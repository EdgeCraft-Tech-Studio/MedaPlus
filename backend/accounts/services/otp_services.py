import logging
import secrets
import string
from datetime import timedelta

import requests  # only needed if you re-enable the AfroMessage SMS block below
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.db import IntegrityError, transaction
from django.template.loader import render_to_string
from django.utils import timezone

from core.utils.time_formatter import format_lockout_duration

from accounts.models import PhoneVerification

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# EXCEPTIONS
# ─────────────────────────────────────────────────────────────────────────────

class OTPException(Exception):
    """Base exception for all OTP errors."""
    pass


class OTPRateLimitError(OTPException):
    """
    Raised when user requests too many OTPs in a short window.
    View returns HTTP 429 Too Many Requests.
    Carries blocked_until so Flutter can show exact countdown timer.
    """
    def __init__(self, message: str, blocked_until):
        super().__init__(message)
        self.blocked_until = blocked_until


class OTPExpiredError(OTPException):
    """
    Raised when OTP record is not found or already expired.
    View returns HTTP 400 Bad Request.
    """
    pass


# alias so otp_views.py can import OTPNotFoundError
OTPNotFoundError = OTPExpiredError


class OTPLockedError(OTPException):
    """
    Raised when user exceeded MAX_ATTEMPTS on OTP entry.
    View returns HTTP 429 Too Many Requests.
    """
    pass


class OTPInvalidError(OTPException):
    """
    Raised when OTP code does not match.
    View returns HTTP 400 Bad Request.
    """
    pass


class SMSSendError(OTPException):
    """
    Raised when the OTP provider (email or SMS) fails to deliver the OTP.
    View returns HTTP 503 Service Unavailable.
    """
    pass


# ─────────────────────────────────────────────────────────────────────────────
# OTP SERVICE
# ─────────────────────────────────────────────────────────────────────────────

class OTPService:
    """
    Handles all OTP lifecycle:
    - Generate secure 5-digit code
    - Send via email (SMTP, HTML + plain text) — SMS provider (AfroMessage)
      kept commented below
    - Create PhoneVerification record with hashed OTP
    - Verify OTP against hash
    - Handle resend with rate limiting
    - Invalidate old OTPs before creating new ones
    - Return OTP status for Flutter countdown timer

    Usage:
        service = OTPService()
        service.send(phone='+251912345678', purpose='signup', email='a@b.com')
        service.verify(phone='+251912345678', otp_code='48291', purpose='signup')
        service.resend(phone='+251912345678', purpose='signup', verification=obj, email='a@b.com')
        service.get_status(phone='+251912345678', purpose='signup')
    """

    OTP_LENGTH           = 5
    OTP_EXPIRY_MINUTES   = 5
    ATTEMPT_BLOCK        = 1
    MAX_RESENDS          = 3
    RESEND_LOCKOUT_HOURS = 1

    # Sentence fragment shown in the email: "Use the code below to <label>."
    PURPOSE_LABELS = {
        PhoneVerification.Purpose.SIGNUP:         'complete your signup',
        PhoneVerification.Purpose.LOGIN:          'log in to your account',
        PhoneVerification.Purpose.PASSWORD_RESET: 'reset your password',
        PhoneVerification.Purpose.PHONE_CHANGE:   'change your phone number',
        PhoneVerification.Purpose.BID_CONFIRM:    'confirm your action',
    }

    # ── private helpers ──

    def _generate_otp(self) -> str:
        """
        Generates a cryptographically secure 5-digit OTP using `secrets`
        (the `random` module is NOT safe for security codes).
        """
        return ''.join(
            secrets.choice(string.digits) for _ in range(self.OTP_LENGTH)
        )

    def _build_message(self, otp_code: str, purpose: str) -> str:
        """
        Builds SMS message body based on purpose.
        Kept short — SMS has 160 character limit.
        (Only used when SMS delivery is re-enabled.)
        """
        messages = {
            PhoneVerification.Purpose.SIGNUP: (
                f'Your MedaPlus signup code is {otp_code}. '
                f'Valid for {self.OTP_EXPIRY_MINUTES} minutes. '
                f'Do not share this code.'
            ),
            PhoneVerification.Purpose.LOGIN: (
                f'Your MedaPlus login code is {otp_code}. '
                f'Valid for {self.OTP_EXPIRY_MINUTES} minutes. '
                f'Do not share this code.'
            ),
            PhoneVerification.Purpose.PASSWORD_RESET: (
                f'Your MedaPlus password reset code is {otp_code}. '
                f'Valid for {self.OTP_EXPIRY_MINUTES} minutes. '
                f'Do not share this code.'
            ),
            PhoneVerification.Purpose.PHONE_CHANGE: (
                f'Your MedaPlus phone change code is {otp_code}. '
                f'Valid for {self.OTP_EXPIRY_MINUTES} minutes. '
                f'Do not share this code.'
            ),
        }
        return messages.get(
            purpose,
            f'Your MedaPlus code is {otp_code}. '
            f'Valid for {self.OTP_EXPIRY_MINUTES} minutes. '
            f'Do not share this code.'
        )

    def _send_email(self, email: str, otp_code: str, purpose: str) -> None:
        """
        Sends the OTP by email as multipart: plain text + HTML.

        Template:  accounts/templates/emails/otp_email.html
        Settings:  EMAIL_* (SMTP), DEFAULT_FROM_EMAIL,
                   EMAIL_LOGO_URL, EMAIL_SUPPORT_ADDRESS, EMAIL_APP_NAME

        Raises:
            SMSSendError: any delivery failure. The same exception type is
            reused so views and services need no changes.
        """
        try:
            app_name      = getattr(settings, 'EMAIL_APP_NAME', 'MedaPlus')
            support_email = getattr(settings, 'EMAIL_SUPPORT_ADDRESS', '')
            purpose_label = self.PURPOSE_LABELS.get(
                purpose, 'verify your account'
            )

            context = {
                'app_name':       app_name,
                'otp_code':       otp_code,
                'purpose_label':  purpose_label,
                'expiry_minutes': self.OTP_EXPIRY_MINUTES,
                'logo_url':       getattr(settings, 'EMAIL_LOGO_URL', ''),
                'support_email':  support_email,
                'year':           timezone.now().year,
            }

            html_body = render_to_string('emails/otp_email.html', context)

            text_body = (
                f"Your {app_name} verification code is {otp_code}\n\n"
                f"Use it to {purpose_label}. "
                f"It is valid for {self.OTP_EXPIRY_MINUTES} minutes.\n\n"
                f"Never share this code with anyone.\n"
                f"If you didn't request this, you can ignore this email.\n\n"
                f"Need help? {support_email}"
            )

            msg = EmailMultiAlternatives(
                subject=f'{otp_code} is your {app_name} verification code',
                body=text_body,                       # plain-text part
                from_email=settings.DEFAULT_FROM_EMAIL,
                to=[email],
                reply_to=[support_email] if support_email else None,
            )
            msg.attach_alternative(html_body, 'text/html')   # HTML part
            msg.send(fail_silently=False)

        except Exception:
            logger.error(
                'OTP email send failed',
                extra={'purpose': purpose},
                exc_info=True,
            )
            raise SMSSendError('Failed to send OTP email. Please try again.')

    def _send_sms(
        self,
        phone: str,
        otp_code: str,
        purpose: str,
        email: str | None = None,
    ) -> None:
        """
        Delivers the OTP. Currently sends by EMAIL (see _send_email).
        The AfroMessage SMS block below is kept commented for later use.
        To switch provider: replace this method body only.
        Everything else stays the same.

        Required settings (SMS, when re-enabled):
            AFROMESSAGE_API_URL
            AFROMESSAGE_API_KEY
            AFROMESSAGE_SENDER_ID

        Raises:
            SMSSendError: provider error, timeout, connection failure,
                          or no email address available
        """
        message = self._build_message(otp_code, purpose)  # noqa: F841 (used by SMS block)

        if not email:
            raise SMSSendError('No email address available to send the OTP.')

        self._send_email(email, otp_code, purpose)

        # NOTE: the debug print() that leaked live OTPs into server logs
        # was removed on purpose. Never log OTP codes in production.

        # try:
        #     response = requests.post(
        #         url=settings.AFROMESSAGE_API_URL,
        #         headers={
        #             'Authorization': f'Bearer {settings.AFROMESSAGE_API_KEY}',
        #             'Content-Type':  'application/json',
        #         },
        #         json={
        #             'to':      phone,
        #             'message': message,
        #             'from':    settings.AFROMESSAGE_SENDER_ID,
        #         },
        #         timeout=10,
        #     )
        #
        #     if response.status_code not in (200, 201):
        #         logger.error(
        #             'AfroMessage API error',
        #             extra={
        #                 'phone':       phone,
        #                 'status_code': response.status_code,
        #                 'response':    response.text,
        #                 'purpose':     purpose,
        #             }
        #         )
        #         raise SMSSendError('Failed to send OTP. Please try again.')
        #
        #     logger.info(
        #         'OTP SMS sent successfully',
        #         extra={'phone': phone, 'purpose': purpose}
        #     )
        #
        # except requests.exceptions.Timeout:
        #     logger.error(
        #         'AfroMessage API timeout',
        #         extra={'phone': phone, 'purpose': purpose}
        #     )
        #     raise SMSSendError(
        #         'SMS service is taking too long. Please try again.'
        #     )
        #
        # except requests.exceptions.ConnectionError:
        #     logger.error(
        #         'AfroMessage API connection error',
        #         extra={'phone': phone, 'purpose': purpose}
        #     )
        #     raise SMSSendError(
        #         'Cannot reach SMS service. Please check your connection.'
        #     )

    def _invalidate_old_otps(self, phone: str, purpose: str, user=None) -> None:
        """
        Marks all existing unused OTPs for this phone + purpose as used.
        Called before creating a new OTP — prevents multiple valid OTPs
        existing simultaneously for same phone + purpose.
        """

        qs = PhoneVerification.objects.filter(
            phone_number=phone,
            purpose=purpose,
            is_used=False,
        )

        if user is not None:
            qs = qs.filter(user=user)

        qs.update(
            is_used=True,
            used_at=timezone.now(),
        )

    def _create_verification_record(
        self,
        phone: str,
        purpose: str,
        otp_code: str,
        user=None,
    ) -> PhoneVerification:
        """
        Create or update OTP verification record.

        Rules:
        - Existing active OTP is reused and updated.
        - Locked OTP cannot be bypassed by requesting new OTP.
        - A freshly issued OTP always gets a clean attempts budget —
          we only reach the "replace OTP" branch once we've confirmed
          the record is NOT currently locked.
        """

        # Only signup can have no user
        if purpose in [
            PhoneVerification.Purpose.PASSWORD_RESET,
            PhoneVerification.Purpose.LOGIN,
            PhoneVerification.Purpose.PHONE_CHANGE,
            PhoneVerification.Purpose.BID_CONFIRM,
        ] and user is None:
            raise ValueError(
                f"user required for purpose {purpose}"
            )

        verification = (
            PhoneVerification.objects
            .select_for_update()
            .filter(
                phone_number=phone,
                user=user,
                purpose=purpose,
                is_used=False,
            )
            .order_by('-created_at')
            .first()
        )

        if verification:

            # Wrong OTP lock
            if verification.is_locked():
                time = format_lockout_duration(verification.attempts_locked_until)
                raise OTPLockedError(
                    "Too many incorrect OTP attempts. "
                    f"Please try again in {time}."
                )

            # Resend lock
            if verification.is_resend_locked():

                raise OTPRateLimitError(
                    "Too many OTP requests. Try again later.",
                    blocked_until=verification.resend_blocked_until
                )

            # Replace OTP
            verification.set_otp(otp_code)

            verification.expires_at = (
                timezone.now()
                + timedelta(minutes=self.OTP_EXPIRY_MINUTES)
            )

            verification.is_used = False
            verification.used_at = None

            # We only get here if not locked, so a freshly issued code
            # always starts with a clean attempts budget.
            verification.attempts = 0
            verification.attempts_locked_until = None

            verification.save()

            return verification

        # No existing record
        verification = PhoneVerification(
            phone_number=phone,
            purpose=purpose,
            user=user,
            expires_at=(
                timezone.now()
                + timedelta(minutes=self.OTP_EXPIRY_MINUTES)
            ),
        )

        verification.set_otp(otp_code)

        try:
            verification.save()

        except IntegrityError:
            # Concurrent request created the active record first —
            # surface this as a normal rate-limit error instead of a
            # raw 500 from the unique_active_verification constraint.
            logger.warning(
                "Concurrent OTP creation collision",
                extra={"phone": phone, "purpose": purpose}
            )
            raise OTPRateLimitError(
                "An OTP was just requested for this number. "
                "Please wait a moment and try again.",
                blocked_until=None,
            )

        return verification

    @transaction.atomic
    def send(
        self,
        phone: str,
        purpose: str,
        user=None,
        email: str | None = None,
    ):
        """
        email: required for SIGNUP (no User row exists yet — the caller passes
        the email entered on the signup form). For every other purpose it is
        optional and falls back to user.email.
        """

        recipient = email or (user.email if user else None)

        otp_code = self._generate_otp()

        verification = self._create_verification_record(
            phone=phone,
            purpose=purpose,
            otp_code=otp_code,
            user=user
        )

        try:

            self._send_sms(
                phone,
                otp_code,
                purpose,
                email=recipient,
            )

        except SMSSendError:

            # Transaction rollback already reverts the create/update
            # above — no explicit delete() needed, and calling it here
            # would incorrectly wipe a *reused* record's prior history.
            logger.error(
                "OTP send failed",
                extra={"phone": phone, "purpose": purpose}
            )
            raise

        logger.info(
            "OTP sent",
            extra={
                "phone": phone,
                "purpose": purpose
            }
        )

        return verification

    @transaction.atomic
    def verify(
        self,
        phone: str,
        otp_code: str,
        purpose: str
    ):

        verification = (
            PhoneVerification.objects
            .select_for_update()
            .filter(
                phone_number=phone,
                purpose=purpose,
                is_used=False,
            )
            .order_by('-created_at')
            .first()
        )

        if not verification:

            raise OTPExpiredError(
                "OTP expired or does not exist."
            )

        if verification.is_locked():
            time = format_lockout_duration(verification.attempts_locked_until)
            raise OTPLockedError(
                "Too many incorrect OTP attempts. "
                f"Please request a new OTP in {time}."
            )

        # Prevents a correct-but-stale OTP from passing after expires_at.
        if verification.is_expired():

            raise OTPExpiredError(
                "OTP expired or does not exist."
            )

        if not verification.check_otp(otp_code):

            # Delegate to the model's own attempt/lock logic instead of
            # duplicating MAX_ATTEMPTS / lock-duration rules here.
            verification.increment_attempts()

            if verification.is_locked():
                time = format_lockout_duration(verification.attempts_locked_until)
                raise OTPLockedError(
                    "Too many incorrect OTP attempts. "
                    f"Try again in {time}."
                )

            raise OTPInvalidError(
                "Incorrect OTP."
            )

        # Success

        verification.is_used = True
        verification.used_at = timezone.now()

        verification.save()

        # Clear resend history now that this flow completed successfully,
        # per the model's own documented contract.
        verification.reset_resend()

        logger.info(
            "OTP verified",
            extra={
                "phone": phone,
                "purpose": purpose
            }
        )

        return verification

    @transaction.atomic
    def resend(
        self,
        phone: str,
        purpose: str,
        verification,
        user=None,
        email: str | None = None,
    ):
        """
        email: required for SIGNUP resend (comes from the Redis signup cache).
        For other purposes it falls back to the verification's own user email.
        """

        # Re-lock the row fresh rather than trusting the caller's
        # possibly-stale in-memory instance.
        verification = (
            PhoneVerification.objects
            .select_for_update()
            .get(pk=verification.pk)
        )

        if verification.is_locked():
            time = format_lockout_duration(verification.attempts_locked_until)
            raise OTPLockedError(
                "Too many incorrect OTP attempts. "
                f"Please try again in {time}."
            )

        if verification.is_resend_locked():

            raise OTPRateLimitError(
                "Too many OTP requests.",
                blocked_until=verification.resend_blocked_until
            )

        verification.increment_resend()

        otp_code = self._generate_otp()

        verification.set_otp(otp_code)

        verification.expires_at = (
            timezone.now()
            + timedelta(minutes=self.OTP_EXPIRY_MINUTES)
        )

        verification.is_used = False
        verification.used_at = None

        # A resend issues a brand-new code — clean attempts budget for it.
        verification.attempts = 0
        verification.attempts_locked_until = None

        verification.save()

        # Resolve who receives the email
        recipient = email or (
            verification.user.email if verification.user_id else None
        )

        try:

            self._send_sms(
                phone,
                otp_code,
                purpose,
                email=recipient,
            )

        except SMSSendError:

            logger.error(
                "OTP resend failed",
                extra={"phone": phone, "purpose": purpose}
            )
            raise

        logger.info(
            "OTP resent",
            extra={
                "phone": phone,
                "purpose": purpose
            }
        )

        return verification

    def get_status(self, phone: str, purpose: str) -> dict:
        """
        Returns current OTP state for Flutter OTP screen countdown timer.

        Flutter calls GET /otp/status/ when OTP screen loads to get:
        - expires_in_seconds → initialize countdown timer
        - resend_locked      → enable or disable resend button
        - resend_blocked_until → show exact resend cooldown

        Returns NO sensitive data — no OTP hash, no partial code.
        Safe to call without authentication.

        Returns:
            dict with keys:
                has_pending_otp:      bool
                expires_in_seconds:   int | None
                resend_count:         int
                resend_locked:        bool
                resend_blocked_until: str (ISO 8601) | None
        """
        verification = (
            PhoneVerification.objects
            .for_phone(phone)
            .by_purpose(purpose)
            .order_by('-created_at')
            .first()
        )

        # no record or already used
        if not verification or verification.is_used:
            return {
                'has_pending_otp':      False,
                'expires_in_seconds':   None,
                'resend_count':         0,
                'resend_locked':        False,
                'resend_blocked_until': None,
            }

        now        = timezone.now()
        expires_in = max(0, int((verification.expires_at - now).total_seconds()))

        return {
            'has_pending_otp':      True,
            'expires_in_seconds':   expires_in,
            'resend_count':         verification.resend_count,
            'resend_locked':        verification.is_resend_locked(),
            'resend_blocked_until': (
                verification.resend_blocked_until.isoformat()
                if verification.resend_blocked_until
                else None
            ),
        }

    def cleanup_expired(self) -> int:
        """
        Hard deletes expired OTP records older than 24 hours.
        Called by Celery beat task daily.

        Returns:
            int: number of records deleted
        """
        cutoff = timezone.now() - timedelta(hours=24)
        count, _ = PhoneVerification.objects.filter(
            expires_at__lt=cutoff,
        ).delete()

        logger.info(
            'Expired OTP records cleaned up',
            extra={'deleted_count': count}
        )

        return count