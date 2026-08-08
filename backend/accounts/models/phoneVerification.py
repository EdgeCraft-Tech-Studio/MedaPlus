from datetime import timedelta

from django.contrib.auth.hashers import check_password, make_password
from django.db import models
from django.utils import timezone

from core.utils.base import TimeStampedModel

# django-mongodb-backend==6.0.2
# Same pattern as the other two files:
#   - Meta.indexes (idx_phone_purpose_valid, idx_phone_expires) removed.
#   - Meta.constraints (unique_active_verification, a partial UniqueConstraint
#     on phone_number+purpose where is_used=False) removed.
#   - db_index=True stripped from phone_number, user (FK), expires_at.
# No field here had unique=True, so there's no version of the phone/user
# contradiction from user.py to worry about — nothing to touch there.


# ─────────────────────────────────────────────
# QUERYSET
# ─────────────────────────────────────────────

class PhoneVerificationQuerySet(models.QuerySet):

    def used(self):
         return self.filter(is_used=False)

    def valid(self):
        return self.filter(is_used=False, expires_at__gt=timezone.now())

    def for_phone(self, phone_number):
        return self.filter(phone_number=phone_number)

    def by_purpose(self, purpose):
        return self.filter(purpose=purpose)

    def expired(self):
        return self.filter(expires_at__lte=timezone.now())


# ─────────────────────────────────────────────
# MANAGER
# ─────────────────────────────────────────────

class PhoneVerificationManager(models.Manager):

    def get_queryset(self):
        return PhoneVerificationQuerySet(self.model, using=self._db)

    def used(self):
        return self.get_queryset().used()

    def valid(self):
        return self.get_queryset().valid()

    def for_phone(self, phone_number):
        return self.get_queryset().for_phone(phone_number)

    def by_purpose(self, purpose):
        return self.get_queryset().by_purpose(purpose)

    def expired(self):
        return self.get_queryset().expired()


# ─────────────────────────────────────────────
# MODEL
# ─────────────────────────────────────────────

class PhoneVerification(TimeStampedModel):
    class Purpose(models.TextChoices):
        SIGNUP = "signup", "Signup"
        LOGIN = "login", "Login"
        PASSWORD_RESET = "password_reset", "Password Reset"
        PHONE_CHANGE = "phone_change", "Phone Change"
        BID_CONFIRM = "bid_confirm", "Bid Confirm"

    MAX_ATTEMPTS = 5

    phone_number = models.CharField(max_length=20)
    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='phone_verifications',
        null=True,   # or backfill existing rows before making it non-null
    )
    otp_hash = models.CharField(max_length=255)
    purpose = models.CharField(max_length=20, choices=Purpose.choices)
    expires_at = models.DateTimeField()
    is_used = models.BooleanField(default=False)
    attempts = models.PositiveSmallIntegerField(default=0)
    attempts_locked_until = models.DateTimeField(null=True, blank=True)
    used_at = models.DateTimeField(null=True, blank=True)
    resend_count = models.PositiveSmallIntegerField(default=0)
    resend_blocked_until = models.DateTimeField(null=True, blank=True)

    objects = PhoneVerificationManager()

    # Thin model methods only — mirrors Django's own
    # User.set_password() / check_password() convention.
    # No SMS-sending, no view/request logic — that belongs in services.py.

    class Meta:
        db_table = 'phone_verifications'
        verbose_name = 'Phone Verification'
        verbose_name_plural = 'Phone Verifications'
        ordering = ['-created_at']
        # No indexes, no constraints — removed per your request.
        # NOTE: the old partial UniqueConstraint (unique_active_verification)
        # enforced "only one un-used OTP per phone_number+purpose at a time"
        # at the DB level. Without it, nothing stops two active OTP rows for
        # the same phone+purpose existing simultaneously unless your service
        # layer explicitly invalidates/marks-used any prior valid() row
        # before creating a new one on each OTP request.

    def set_otp(self, raw_code: str):
        """Hash before storing — never save the raw OTP code."""
        self.otp_hash = make_password(raw_code)

    def check_otp(self, raw_code: str) -> bool:
        return check_password(raw_code, self.otp_hash)

    def is_expired(self) -> bool:
        return timezone.now() >= self.expires_at

    def mark_used(self) -> bool:
        if self.is_used or self.is_expired():
            return False
        self.is_used = True
        self.used_at = timezone.now()
        self.save(update_fields=['is_used', 'used_at'])
        return True
    # for security against brute-force OTP guessing
    def is_locked(self) -> bool:
        return bool(
            self.attempts_locked_until
            and timezone.now() < self.attempts_locked_until
        )

    def increment_attempts(self):

        from django.utils import timezone
        from datetime import timedelta
        from django.db import transaction

        with transaction.atomic():

            verification = (
                PhoneVerification.objects
                .select_for_update()
                .get(pk=self.pk)
            )

            verification.attempts += 1

            if verification.attempts >= self.MAX_ATTEMPTS and verification.resend_count < 3:
                verification.attempts_locked_until = (
                    timezone.now()
                    + timedelta(minutes=3)
                )
            elif verification.attempts >= self.MAX_ATTEMPTS and verification.resend_count >= 3:
                verification.attempts_locked_until = (
                    timezone.now()
                    + timedelta(days=1)
                )

            verification.save(
                update_fields=[
                    "attempts",
                    "attempts_locked_until",
                ]
            )

            self.refresh_from_db()

    # resend rate limit lock to many times resend click
    def is_resend_locked(self) -> bool:
        if self.resend_blocked_until is None:
            return False
        return timezone.now() < self.resend_blocked_until

    def increment_resend(self):
        if self.is_resend_locked():
            return False

        self.resend_count += 1
        if self.resend_count >= 3:
            self.resend_blocked_until = timezone.now() + timedelta(hours=2)
        self.save(update_fields=['resend_count', 'resend_blocked_until'])
        return True

    def reset_resend(self):
        """ call this on successful reset """
        self.resend_count = 0
        self.resend_blocked_until = None
        self.save(update_fields=['resend_count', 'resend_blocked_until'])

    def __str__(self):
        return f"{self.phone_number} · {self.purpose}"