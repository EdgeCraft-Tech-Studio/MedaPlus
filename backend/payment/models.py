import uuid

from django.conf import settings
from django.db import models

from .choices import GatewayProvider, PaymentMode, PaymentStatus, SupportedBank

# What the PAYER must supply to verify.et (per the bank requirements table):
SUFFIX_REQUIRED_BANKS = {SupportedBank.CBE: 8, SupportedBank.BOA: 5}
PAYER_PHONE_REQUIRED_BANKS = {SupportedBank.CBEBIRR}
# How the OWNER's receiving account is identified (wallets use a phone number):
WALLET_BANKS = {SupportedBank.TELEBIRR, SupportedBank.MPESA, SupportedBank.CBEBIRR}


class PitchOwnerPaymentProfile(models.Model):
    """One row per pitch-owner user. Never created or edited by the
    owner at signup — set only by a superadmin after manual approval.
    Does not touch accounts.User at all.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="payment_profile"
    )
    payment_mode = models.CharField(
        max_length=15, choices=PaymentMode.choices, default=PaymentMode.NOT_CONFIGURED
    )
    gateway_provider = models.CharField(max_length=15, choices=GatewayProvider.choices, blank=True)
    gateway_merchant_ref = models.CharField(max_length=100, blank=True)
    configured_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="payment_profiles_configured",
    )
    configured_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "payment_owner_profile"
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(payment_mode=PaymentMode.NOT_CONFIGURED)
                    | models.Q(payment_mode=PaymentMode.MANUAL_BANK)
                    | models.Q(payment_mode=PaymentMode.GATEWAY, gateway_provider__gt="")
                ),
                name="payment_profile_gateway_requires_provider",
            ),
        ]

    def __str__(self):
        return f"{self.owner_id} ({self.payment_mode})"

    @property
    def uses_gateway(self) -> bool:
        return self.payment_mode == PaymentMode.GATEWAY

    @property
    def uses_manual_bank(self) -> bool:
        return self.payment_mode == PaymentMode.MANUAL_BANK


class PitchOwnerBankAccount(models.Model):
    """A pitch owner can register more than one bank/wallet. Only
    used when the owner's payment_mode is MANUAL_BANK, but kept
    independent of that field so an owner switching modes later
    doesn't lose already-entered account data.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="bank_accounts"
    )
    bank = models.CharField(max_length=15, choices=SupportedBank.choices)
    account_holder_name = models.CharField(max_length=150)
    account_number = models.CharField(max_length=30, blank=True)
    phone_number = models.CharField(max_length=20, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "payment_owner_bank_account"
        constraints = [
            models.UniqueConstraint(
                fields=["owner", "bank"],
                condition=models.Q(is_active=True),
                name="uniq_active_bank_per_owner_per_bank_type",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(
                        bank__in=[b.value for b in WALLET_BANKS],
                        phone_number__gt="",
                    )
                    | (
                        ~models.Q(bank__in=[b.value for b in WALLET_BANKS])
                        & models.Q(account_number__gt="")
                    )
                ),
                name="bank_account_has_required_identifier",
            ),
        ]

    def __str__(self):
        return f"{self.owner_id} / {self.bank}"

    @property
    def settlement_identifier(self) -> str:
        return self.phone_number if self.bank in WALLET_BANKS else self.account_number


class PaymentTransactionQuerySet(models.QuerySet):
    def for_booking(self, booking):
        return self.filter(booking=booking)

    def for_payer(self, user):
        return self.filter(payer=user)

    def verified(self):
        return self.filter(status=PaymentStatus.VERIFIED)

    def pending_or_processing(self):
        return self.filter(status__in=[PaymentStatus.PENDING, PaymentStatus.PROCESSING])


PaymentTransactionManager = models.Manager.from_queryset(PaymentTransactionQuerySet)


class PaymentTransaction(models.Model):
    """One attempt to pay for a booking. Multiple rows can exist per
    booking (retries after rejection); only one can ever reach
    VERIFIED — enforced by the DB constraint below, which is the real
    anti-replay guarantee, not just the pre-check in services.py.

    ASSUMPTION FLAGGED: `booking` targets "bookings.Booking". If your
    real app/model name differs, this is the one line to fix.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    
    booking = models.ForeignKey(
        "bookings.Booking",
        on_delete=models.CASCADE,
        related_name="payment_transactions",
        null=True,
        blank=True,
    )
    team_booking_payment = models.ForeignKey(
        "team_booking.TeamBookingPayment",
        on_delete=models.CASCADE,
        related_name="payment_transactions",
        null=True,
        blank=True,
    )
    solo_booking_hold = models.ForeignKey(
        "bookings.SoloBookingHold",
        on_delete=models.CASCADE,
        related_name="payment_transactions",
        null=True,
        blank=True,
    )
    payer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="payment_transactions"
    )
    pitch_owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="received_payment_transactions",
        help_text="Snapshotted from booking.pitch.tenant.owner at creation time.",
    )
    amount_expected = models.DecimalField(max_digits=10, decimal_places=2)

    payment_mode = models.CharField(max_length=15, choices=PaymentMode.choices)

    gateway_provider = models.CharField(max_length=15, choices=GatewayProvider.choices, blank=True)
    gateway_reference = models.CharField(max_length=100, blank=True)

    bank = models.CharField(max_length=15, choices=SupportedBank.choices, blank=True)
    owner_bank_account = models.ForeignKey(
        PitchOwnerBankAccount,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="payment_transactions",
    )
    screenshot = models.ImageField(upload_to="payment_screenshots/%Y/%m/", null=True, blank=True)
    reference_number = models.CharField(max_length=64, blank=True)
    account_suffix = models.CharField(max_length=10, blank=True)
    payer_phone_number = models.CharField(max_length=20, blank=True)

    status = models.CharField(max_length=15, choices=PaymentStatus.choices, default=PaymentStatus.PENDING)

    verify_request_id = models.CharField(max_length=100, blank=True)
    verify_response = models.JSONField(null=True, blank=True)
    verified_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    verified_transaction_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.CharField(max_length=100, blank=True)

    submitted_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Drives the separate, mandatory "Payment Completed" popup — set
    # True only when the PAYER clicks Done on it. Independent of any
    # "is something still pending" check, so it survives exactly as
    # long as the user needs it to, including across a refresh.
    completion_acknowledged = models.BooleanField(default=False)

    objects = PaymentTransactionManager()

    class Meta:
        db_table = "payment_transaction"
        ordering = ["-submitted_at"]
        constraints = [
            # THE anti-replay guarantee. Scoped to VERIFIED only, so a
            # rejected attempt (typo'd suffix, etc.) can be retried
            # with the same real reference_number.
            models.UniqueConstraint(
                fields=["bank", "reference_number"],
                condition=models.Q(status=PaymentStatus.VERIFIED) & ~models.Q(reference_number=""),
                name="uniq_verified_reference_per_bank",
            ),
            # verify.et's own docs: "Do not submit a new POST for the
            # same receipt while that request is still in flight."
            # This is the DB-level enforcement of that rule — under
            # concurrent uploads of the same screenshot/reference, the
            # SECOND insert fails immediately with IntegrityError
            # rather than both requests separately calling verify.et.
            models.UniqueConstraint(
                fields=["bank", "reference_number"],
                condition=(
                    models.Q(status__in=[PaymentStatus.PENDING, PaymentStatus.PROCESSING])
                    & ~models.Q(reference_number="")
                ),
                name="uniq_inflight_reference_per_bank",
            ),
            # One verified payment per booking — a second valid payment
            # for an already-paid booking must never silently become
            # a second VERIFIED row.
            models.UniqueConstraint(
                fields=["booking"],
                condition=models.Q(status=PaymentStatus.VERIFIED, booking__isnull=False),
                name="uniq_verified_payment_per_booking",
            ),
            models.UniqueConstraint(
                fields=["team_booking_payment"],
                condition=models.Q(status=PaymentStatus.VERIFIED, team_booking_payment__isnull=False),
                name="uniq_verified_payment_per_team_booking_payment",
            ),
            models.CheckConstraint(
                condition=models.Q(amount_expected__gt=0), name="payment_amount_positive"
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(booking__isnull=False, team_booking_payment__isnull=True, solo_booking_hold__isnull=True)
                    | models.Q(booking__isnull=True, team_booking_payment__isnull=False, solo_booking_hold__isnull=True)
                    | models.Q(booking__isnull=True, team_booking_payment__isnull=True, solo_booking_hold__isnull=False)
                ),
                name="payment_target_exactly_one",
            ),
            models.UniqueConstraint(
                fields=["solo_booking_hold"],
                condition=models.Q(status=PaymentStatus.VERIFIED, solo_booking_hold__isnull=False),
                name="uniq_verified_payment_per_solo_hold",
            ),
        ]
        indexes = [
            models.Index(fields=["bank", "reference_number"]),
            models.Index(fields=["booking", "status"]),
            models.Index(fields=["payer", "status"]),
            models.Index(fields=["status", "submitted_at"]),
        ]

    def __str__(self):
        return f"{self.booking_id} / {self.status}"

    
    @property
    def reference_date(self):
        if self.booking_id:
            return self.booking.created_at
        if self.team_booking_payment_id:
            return self.team_booking_payment.created_at
        return self.solo_booking_hold.created_at


# ADD this class at the bottom of payment/models.py (nothing else in models.py changes).
# Then run:  python manage.py makemigrations payment   and   python manage.py migrate
#
# It remembers ONLY the last 8 (CBE) / 5 (BOA) digits of the account a player paid
# from, after a successful payment, so they are not asked for it again.

class PayerBankSuffix(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    payer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="saved_bank_suffixes"
    )
    bank = models.CharField(max_length=15, choices=SupportedBank.choices)
    suffix = models.CharField(max_length=10)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "payment_payer_bank_suffix"
        constraints = [
            models.UniqueConstraint(fields=["payer", "bank"], name="uniq_saved_suffix_per_payer_bank"),
        ]

    def __str__(self):
        return f"{self.payer_id} / {self.bank}"