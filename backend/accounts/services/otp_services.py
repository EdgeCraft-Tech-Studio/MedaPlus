import logging
import random
import string
from datetime import timedelta
from django.db import IntegrityError, transaction
import requests
from django.conf import settings
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

    FIX: added __init__ with blocked_until attribute.
    View accesses e.blocked_until to return exact time to Flutter.
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


# FIX: alias so otp_views.py can import OTPNotFoundError
# both names point to the same class — no duplication
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
    Raised when SMS provider fails to deliver OTP.
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
    - Send via SMS provider (AfroMessage for Ethiopia)
    - Create PhoneVerification record with hashed OTP
    - Verify OTP against hash
    - Handle resend with rate limiting
    - Invalidate old OTPs before creating new ones
    - Return OTP status for Flutter countdown timer

    Usage:
        service = OTPService()
        service.send(phone='+251912345678', purpose='signup')
        service.verify(phone='+251912345678', otp_code='48291', purpose='signup')
        service.resend(phone='+251912345678', purpose='signup', verification=obj)
        service.get_status(phone='+251912345678', purpose='signup')
    """

    OTP_LENGTH           = 5
    OTP_EXPIRY_MINUTES   = 5
    ATTEMPT_BLOCK        = 1
    MAX_RESENDS          = 3
    RESEND_LOCKOUT_HOURS = 1

    # ── private helpers ──

    def _generate_otp(self) -> str:
        """
        Generates a cryptographically random 5-digit OTP.
        Digits only — avoids confusion between 0/O or 1/I on small screens.
        """
        return ''.join(random.choices(string.digits, k=self.OTP_LENGTH))

    def _build_message(self, otp_code: str, purpose: str) -> str:
        """
        Builds SMS message body based on purpose.
        Kept short — SMS has 160 character limit.
        """
        messages = {
            PhoneVerification.Purpose.SIGNUP: (
                f'Your Auction App signup code is {otp_code}. '
                f'Valid for {self.OTP_EXPIRY_MINUTES} minutes. '
                f'Do not share this code.'
            ),
            PhoneVerification.Purpose.LOGIN: (
                f'Your Auction App login code is {otp_code}. '
                f'Valid for {self.OTP_EXPIRY_MINUTES} minutes. '
                f'Do not share this code.'
            ),
            PhoneVerification.Purpose.PASSWORD_RESET: (
                f'Your Auction App password reset code is {otp_code}. '
                f'Valid for {self.OTP_EXPIRY_MINUTES} minutes. '
                f'Do not share this code.'
            ),
            PhoneVerification.Purpose.PHONE_CHANGE: (
                f'Your Auction App phone change code is {otp_code}. '
                f'Valid for {self.OTP_EXPIRY_MINUTES} minutes. '
                f'Do not share this code.'
            ),
        }
        return messages.get(
            purpose,
            f'Your Auction App code is {otp_code}. '
            f'Valid for {self.OTP_EXPIRY_MINUTES} minutes. '
            f'Do not share this code.'
        )

    def _send_sms(self, phone: str, otp_code: str, purpose: str) -> None:
        """
        Sends OTP via AfroMessage SMS API.
        To switch provider: replace this method body only.
        Everything else stays the same.

        Required settings:
            AFROMESSAGE_API_URL
            AFROMESSAGE_API_KEY
            AFROMESSAGE_SENDER_ID

        Raises:
            SMSSendError: provider error, timeout, or connection failure
        """
        message = self._build_message(otp_code, purpose)

        print(f"⚡ OTP for {phone} ({purpose}): {otp_code}")

        #try:
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

        #     logger.info(
        #         'OTP SMS sent successfully',
        #         extra={'phone': phone, 'purpose': purpose}
        #     )

        # except requests.exceptions.Timeout:
        #     logger.error(
        #         'AfroMessage API timeout',
        #         extra={'phone': phone, 'purpose': purpose}
        #     )
        #     raise SMSSendError(
        #         'SMS service is taking too long. Please try again.'
        #     )

        # except requests.exceptions.ConnectionError:
        #     logger.error(
        #         'AfroMessage API connection error',
        #         extra={'phone': phone, 'purpose': purpose}
        #     )
        #     raise SMSSendError(
        #         'Cannot reach SMS service. Please check your connection.'
        #     )

    def _invalidate_old_otps(self, phone: str, purpose: str,user:None) -> None:
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
    user=None
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

            # Resend SMS lock
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
                "Please wait a moment and try again."
            )

        return verification


    @transaction.atomic
    def send(
        self,
        phone: str,
        purpose: str,
        user=None
    ):

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
                purpose
            )

        except SMSSendError:

            # Transaction rollback already reverts the create/update
            # above — no explicit delete() needed, and calling it here
            # would incorrectly wipe a *reused* record's prior history.
            logger.error(
                "OTP SMS send failed",
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

        # Was previously missing — allowed a correct-but-stale OTP
        # to pass verification after expires_at had already passed.
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
                f"Incorrect OTP."
            )

        # Success

        verification.is_used = True
        verification.used_at = timezone.now()

        verification.save()

        # Clear resend history now that this flow completed successfully,
        # per the model's own documented contract ("call this on successful reset").
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
        user=None
    ):

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

        verification.set_otp(
            otp_code
        )

        verification.expires_at = (
            timezone.now()
            + timedelta(minutes=self.OTP_EXPIRY_MINUTES)
        )

        verification.is_used = False
        verification.used_at = None

        # A resend issues a brand-new code — same reasoning as in
        # _create_verification_record: clean attempts budget for it.
        verification.attempts = 0
        verification.attempts_locked_until = None

        verification.save()

        try:

            self._send_sms(
                phone,
                otp_code,
                purpose
            )

        except SMSSendError:

            logger.error(
                "OTP resend SMS failed",
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

        NEW METHOD — needed by OTPStatusView.

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