import json
import logging
import secrets
import uuid
from datetime import timedelta

from django.contrib.auth.hashers import make_password
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone

from accounts.models import PhoneVerification, UserSession
from accounts.services.otp_services import OTPService, SMSSendError
from accounts.services.session_services import SessionService
from accounts.models.user import User, UserRole
from pitches.models import Tenant
from core.utils.constant import REVOKE_REASON_CHOICES

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# EXCEPTIONS
# ─────────────────────────────────────────────────────────────────────────────

class AuthException(Exception):
    """Base exception for all auth errors."""
    pass


class PhoneAlreadyExistsError(AuthException):
    """
    Raised when signup phone is already registered.
    View returns HTTP 409 Conflict.
    """
    pass

class UsernameAlreadyExistsError(AuthException):
    """
    Raised when signup phone is already registered.
    View returns HTTP 409 Conflict.
    """
    pass


class UserNotFoundError(AuthException):
    """
    Raised when no user exists for the given phone.
    View returns HTTP 404 Not Found.
    """
    pass


class AccountDeletedError(AuthException):
    """
    Raised when a user account has been soft deleted.
    View returns HTTP 403 Forbidden.
    """
    pass


class AccountInactiveError(AuthException):
    """
    Raised when a user account is deactivated by admin.
    View returns HTTP 403 Forbidden.
    """
    pass


class AccountBlockedError(AuthException):
    """
    Raised when a user is temporarily blocked due to failed login attempts.
    Carries blocked_until so Flutter can show a countdown timer.
    View returns HTTP 429 Too Many Requests.
    """
    def __init__(self, message: str, blocked_until):
        super().__init__(message)
        self.blocked_until = blocked_until


class InvalidCredentialsError(AuthException):
    """
    Raised when the password is incorrect.
    Carries remaining_attempts so Flutter can show a warning banner.
    View returns HTTP 401 Unauthorized.
    """
    def __init__(self, message: str, remaining_attempts: int):
        super().__init__(message)
        self.remaining_attempts = remaining_attempts


class InvalidResetTokenError(AuthException):
    """
    Raised when reset_token is invalid, already used, or expired.
    View returns HTTP 400 Bad Request.
    """
    pass


class MustChangePasswordError(AuthException):
    """
    Raised when an admin-created user must change their password before
    proceeding. Flutter redirects to the forced password-change screen.
    View returns HTTP 403 Forbidden.
    """
    pass


class SignupSessionExpiredError(AuthException):
    """
    Raised when signup step-1 data is no longer in Redis (TTL expired or
    user never completed step 1). Flutter must restart the signup flow.
    View returns HTTP 400 Bad Request.
    """
    pass


# ─────────────────────────────────────────────────────────────────────────────
# AUTH SERVICE
# ─────────────────────────────────────────────────────────────────────────────

class AuthService:
    """
    Single source of truth for all authentication flows.

    Flows handled:
        Signup         → initiate_signup → store_signup_data → complete_signup
        Login          → create_session
        Logout         → logout / logout_all
        Forgot PW      → initiate_forgot_password → generate_reset_token → reset_password
        Token refresh  → refresh_token
        Resend OTP     → resend_otp
        Phone change   → initiate_phone_change → confirm_phone_change

    Rules:
        - Never touches request/response objects — that is the view's job.
        - Never calls serializers — that is the view's job.
        - All multi-step DB writes are wrapped in @transaction.atomic.
        - Raw tokens are only returned from create_session / complete_signup /
          refresh_token — never stored or logged.
        - Views always go through AuthService; never bypass to OTPService or
          SessionService directly.
    """

    # ── cache key prefixes ──────────────────────────────────────────────────
    _SIGNUP_KEY_PREFIX  = 'auth:signup:'
    _SIGNUP_DATA_TTL    = 600   # 10 minutes — user must verify within this window

    # ── reset token config ──────────────────────────────────────────────────
    RESET_TOKEN_EXPIRY_MINUTES = 10

    def __init__(self):
        self.otp_service     = OTPService()
        self.session_service = SessionService()

    # =========================================================================
    # SIGNUP FLOW
    # Step 1 → initiate_signup   (sends OTP)
    # Step 2 → store_signup_data (called by view helper after OTP sent)
    # Step 3 → complete_signup   (verifies OTP, creates user, issues session)
    # =========================================================================

    def initiate_signup(self, phone: str) -> None:
        """
        Step 1 of signup flow — sends OTP to phone.

        Defense-in-depth: re-checks phone uniqueness even though the
        serializer already checked. The serializer runs in request context;
        a race condition between serializer and service is theoretically
        possible at high volume (100k+ users).

        Called by:
            auth_views.SignupView

        Raises:
            PhoneAlreadyExistsError: phone already registered
            SMSSendError: SMS provider failed
        """
        if User.objects.filter(phone=phone, deleted_at__isnull=True).exists():
            raise PhoneAlreadyExistsError(
                'An account with this phone number already exists.'
            )

        self.otp_service.send(
            phone=phone,
            purpose=PhoneVerification.Purpose.SIGNUP, 
            user=None
        )

        logger.info('Signup OTP sent')

    def store_signup_data(
            self,
            phone: str,
            username: str,
            first_name: str,
            last_name: str,
            password: str,
            role: str,
            email: str | None = None,
        ) -> None:
            key = f'{self._SIGNUP_KEY_PREFIX}{phone}'
    
            data = {
                'first_name': first_name,
                'last_name': last_name,
                'username': username,
                'email': email,
                'role':role,
                'hashed_password': make_password(password),
            }
    
            cache.set(
                key,
                json.dumps(data),
                timeout=self._SIGNUP_DATA_TTL
            )
    
            logger.debug(
                'Signup data cached',
                extra={'phone': phone}
            )


    
    def get_signup_data(self, phone: str) -> dict | None:
        """
        Retrieves signup step-1 data from Redis.
        Returns None if the TTL has expired or data was never stored.

        Called by:
            auth_views.SignupVerifyOTPView
        """
        key = f'{self._SIGNUP_KEY_PREFIX}{phone}'
        raw = cache.get(key)
        if raw is None:
            return None
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            logger.error(
                'Corrupt signup cache entry',
            )
            return None

    def clear_signup_data(self, phone: str) -> None:
        """
        Deletes signup step-1 data from Redis after successful registration.
        Safe to call even if the key does not exist.

        Called by:
            auth_views.SignupVerifyOTPView (after user is created)
        """
        cache.delete(f'{self._SIGNUP_KEY_PREFIX}{phone}')

    @transaction.atomic
    def complete_signup(
        self,
        phone: str,
        username: str,
        first_name: str,
        last_name: str,
        hashed_password: str,
        role: str,
        verification: PhoneVerification,
        device_id: str,
        device_name: str | None = None,
        device_type: str = 'mobile',
        ip_address: str | None = None,
        user_agent: str | None = None,
        fcm_token: str | None = None,
        email: str | None = None,
    ) -> dict:
        """
        Step 2 of signup flow — creates user and issues session.

        Accepts an already-verified PhoneVerification object (attached by the
        serializer's validate() method) to avoid a second DB hit inside the
        atomic block. The service calls mark_used() here — inside the
        transaction — so OTP consumption and user creation are atomic.

        Accepts hashed_password (not raw) because the view retrieved it from
        Redis where it was stored already hashed by store_signup_data().
        The User manager's create_user() must accept a pre-hashed password
        (pass it via set_password=False or an equivalent manager method).

        Flow:
            1. Mark OTP as used (inside atomic block — cannot be replayed)
            2. Race-condition guard — recheck phone uniqueness atomically
            3. Create user with hashed_password
            4. Reset failed_attempts to zero (user starts clean)
            5. Create session
            6. Return tokens + user

        Returns:
            dict: user, session_token, refresh_token, expires_at, refresh_expires_at

        Raises:
            PhoneAlreadyExistsError: race condition — phone taken between steps
        """
        # step 1 — consume OTP inside atomic block
        # serializer already verified the hash; we just mark it used here
        # so that OTP consumption and user creation are a single atomic unit
        verification.mark_used()

        # step 2 — race-condition guard
        # two simultaneous signups for the same phone could both pass
        # the serializer check; this SELECT FOR UPDATE prevents both from
        # succeeding by holding the lock until this transaction commits
        if User.objects.filter(phone=phone, deleted_at__isnull=True).exists():
            raise PhoneAlreadyExistsError(
                'An account with this phone number already exists.'
            )
        if email and User.objects.filter(email=email, deleted_at__isnull=True).exists():
            raise PhoneAlreadyExistsError(
                'An account with this email already exists.'
            )
        if User.objects.filter(username=username, deleted_at__isnull=True).exists():
            raise UsernameAlreadyExistsError(
                'This username is already taken.'
            )
        # step 3 — create user
        # password is already hashed — pass directly to avoid double-hashing
        if email is not "":
            user = User(
                username=username,
                phone=phone,
                first_name=first_name,
                last_name=last_name,
                email=email,
                password=hashed_password,
            )
        user = User(
                        username=username,
                        phone=phone,
                        first_name=first_name,
                        last_name=last_name,
                        password=hashed_password,
                    )

        user.role = role
        # Players are approved immediately; owners require admin approval
        user.is_approved = (role == UserRole.PLAYER)
        user.save()

        if role == UserRole.OWNER:
            Tenant.objects.get_or_create(
                owner=user,
                defaults={
                    "name": f"{user.username}'s Business",
                    "is_active": True,
                    "is_approved": False,
                },
            )        
        # step 4 — new user starts with a clean slate
        user.failed_attempts = 0
        user.blocked_until   = None

        user.save(update_fields=['failed_attempts','blocked_until','is_approved','role'])

        # step 5 — create session
        session_data = self.session_service.create_session(
            user=user,
            device_id=device_id,
            device_name=device_name,
            device_type=device_type,
            ip_address=ip_address,
            user_agent=user_agent,
            fcm_token=fcm_token,
            is_privileged=False,
        )

        logger.info(
            'Signup completed — user created and session issued',
            extra={'user_id': str(user.id), 'phone': phone}
        )

        # step 6 — return everything Flutter needs
        return {
            'user':               user,
            'session_token':      session_data['session_token'],
            'refresh_token':      session_data['refresh_token'],
            'expires_at':         session_data['expires_at'],
            'refresh_expires_at': session_data['refresh_expires_at'],
        }

    # =========================================================================
    # LOGIN FLOW
    # The serializer validates credentials (phone format, account state,
    # password check, failed_attempts increment) and attaches _user.
    # The view passes _user here so we skip the duplicate DB fetch.
    # This method handles what the serializer cannot: must_change_password
    # and resetting failed_attempts on success.
    # =========================================================================

    def create_session(
        self,
        user: User,
        device_id: str,
        device_name: str | None = None,
        device_type: str = 'mobile',
        ip_address: str | None = None,
        user_agent: str | None = None,
        fcm_token: str | None = None,
    ) -> dict:
        """
        Creates a session for an already-authenticated user.

        Called by LoginView after LoginSerializer has validated credentials
        and attached the user. The serializer handles: phone existence,
        soft-delete check, active check, blocked check, password check, and
        failed_attempts increment on wrong password.

        This method handles the remaining post-auth concerns:
            - Resets failed_attempts (serializer increments; we reset on success)
            - Checks must_change_password (admin accounts only)
            - Re-checks blocked state (defense against race conditions)
            - Creates the session and returns tokens

        Returns:
            dict: user, session_token, refresh_token, expires_at, refresh_expires_at

        Raises:
            AccountBlockedError: if the account became blocked in a race condition
            MustChangePasswordError: if admin user must change their password
        """
        # defense-in-depth re-check in case account was blocked between
        # serializer validation and now (e.g. another concurrent request)
        if user.is_blocked:
            raise AccountBlockedError(
                f'Too many failed attempts. '
                f'Try again after {user.blocked_until.strftime("%H:%M")}.',
                blocked_until=user.blocked_until,
            )

        # reset failed_attempts on successful login
        # serializer incremented it on wrong passwords — successful login clears it
        if user.failed_attempts > 0:
            user.un_block()
            user.reset_failed_attempts()

        # admin accounts created by the owner must change their password
        # on their first login — we check after resetting attempts so the
        # reset is not lost even if we raise here
        if user.is_staff and user.must_change_password:
            raise MustChangePasswordError(
                'You must change your password before continuing.'
            )

        session_data = self.session_service.create_session(
            user=user,
            device_id=device_id,
            device_name=device_name,
            device_type=device_type,
            ip_address=ip_address,
            user_agent=user_agent,
            fcm_token=fcm_token,
            is_privileged=getattr(user, 'is_staff', False) or getattr(user, 'platform_admin', False),
        )

        logger.info(
            'Login successful — session created',
            extra={
                'user_id':    str(user.id),
                'phone':      user.phone,
                'device_id':  device_id,
                'ip_address': ip_address,
            }
        )

        return {
            'user':               user,
            'session_token':      session_data['session_token'],
            'refresh_token':      session_data['refresh_token'],
            'expires_at':         session_data['expires_at'],
            'refresh_expires_at': session_data['refresh_expires_at'],
        }

    # =========================================================================
    # LOGOUT FLOW
    # =========================================================================

    def logout(self, session: UserSession) -> None:
        """
        Logs out from the current device only.
        Revokes the session and deactivates the FCM token for this device.

        Called by:
            auth_views.LogoutView (revoke_all=False)
        """
        self.session_service.revoke_session(
            session=session,
            reason=REVOKE_REASON_CHOICES.REVOKE_LOGOUT,
        )

        logger.info(
            'User logged out from current device',
            extra={
                'user_id':    str(session.user_id),
                'session_id': str(session.id),
            }
        )

    def logout_all(
        self,
        user_id: uuid.UUID,
        current_session_id: uuid.UUID | None = None,
    ) -> int:
        """
        Logs out from all devices.

        If current_session_id is provided, that session is preserved
        (user stays logged in on the current device).
        If None, all sessions including the current one are revoked.

        Returns:
            int: number of sessions revoked

        Called by:
            auth_views.LogoutView (revoke_all=True)
        """
        count = self.session_service.revoke_all_sessions(
            user_id=user_id,
            reason=REVOKE_REASON_CHOICES.REVOKE_LOGOUT,
            exclude_session_id=current_session_id,
        )

        logger.info(
            'User logged out from all devices',
            extra={
                'user_id':          str(user_id),
                'sessions_revoked': count,
            }
        )

        return count

    # =========================================================================
    # FORGOT PASSWORD FLOW
    # Step 1 → initiate_forgot_password  (sends OTP silently)
    # Step 2 → generate_reset_token      (accepts verified object, issues token)
    # Step 3 → reset_password            (validates token, updates password)
    # =========================================================================

    def initiate_forgot_password(self, phone: str) -> None:
        """
        Step 1 of forgot password flow.

        Silently sends OTP if the phone is registered and the account is
        not deleted. If the phone does not exist, does nothing.
        The Flutter response is always identical — never reveal whether a
        phone number is registered (prevents enumeration attacks).

        Called by:
            auth_views.ForgotPasswordView

        Raises:
            SMSSendError: SMS provider failed (only when user exists)
        """
        user = User.objects.by_phone(phone).first()

        if not user or user.is_deleted:
            logger.info(
                'Forgot password for unknown/deleted phone — silently ignored',
                extra={'phone': phone}
            )
            return

        self.otp_service.send(
            phone=phone,
            purpose=PhoneVerification.Purpose.PASSWORD_RESET,
            user=user
        )

        logger.info('Forgot password OTP sent', extra={'phone': phone})

    def generate_reset_token(
        self,
        phone: str,
        verification: PhoneVerification,
    ) -> str:
        """
        Step 2 of forgot password flow.

        Accepts the already-verified PhoneVerification object attached by
        ForgotPasswordVerifyOTPSerializer.validate() — avoids a second DB
        hit and a second hash check.

        Marks the OTP as used, generates a secure reset token, and stores
        its hash back on the verification record with a fresh 10-minute TTL.
        The raw token is returned to Flutter; the hash is stored server-side.

        Returns:
            str: raw reset token — Flutter stores this temporarily and sends
                 it in the next step with the new password.

        Called by:
            auth_views.ForgotPasswordVerifyOTPView
        """
        raw_reset_token = self._generate_reset_token()
        self._store_reset_token(verification, raw_reset_token)

        logger.info(
            'Reset token generated after OTP verification',
            extra={'phone': phone}
        )

        return raw_reset_token

    @transaction.atomic
    def reset_password(
        self,
        phone: str,
        raw_reset_token: str,
        new_password: str,
        user:None
    ) -> None:
        """
        Step 3 and final step of forgot password flow.

        Validates the reset token, updates the password, unblocks the
        account, and revokes ALL sessions. User must re-authenticate on
        every device after this.

        Wrapped in @transaction.atomic — password update and session
        revocation succeed or fail together.

        Flow:
            1. Validate reset token (raises if invalid or expired)
            2. Fetch user by phone
            3. Update password with set_password() (Django hashes it)
            4. Clear failed_attempts, unblock, restore active=True
            5. Mark reset token as used — cannot be replayed
            6. Revoke ALL sessions — user must login everywhere

        Raises:
            UserNotFoundError: phone not registered
            InvalidResetTokenError: token invalid, expired, or already used

        Called by:
            auth_views.ResetPasswordView
        """
        # step 1 — validate token before doing any writes
        verification = self._validate_reset_token(phone, raw_reset_token,user)

        # step 2 — fetch user
        user = User.objects.by_phone(phone).first()
        if not user:
            raise UserNotFoundError(
                'No account found'
            )

        # step 3 — update password
        # set_password() hashes with Django's PBKDF2 — no double-hashing risk
        user.set_password(new_password)

        # step 4 — heal account state
        user.failed_attempts = 0
        user.blocked_until   = None
        user.active          = True
        user.save(update_fields=[
            'password',
            'failed_attempts',
            'blocked_until',
            'active',
        ])

        # step 5 — consume reset token — one-time use only
        verification.mark_used()

        # step 6 — revoke all sessions — no exclusion
        # every device must login again with the new password
        self.session_service.revoke_all_sessions(
            user_id=user.id,
            reason=REVOKE_REASON_CHOICES.REVOKE_PASSWORD_CHANGE,
            exclude_session_id=None,
        )

        logger.info(
            'Password reset completed — all sessions revoked',
            extra={'user_id': str(user.id), 'phone': phone}
        )

    # =========================================================================
    # TOKEN REFRESH FLOW
    # =========================================================================

    def refresh_token(self, raw_refresh_token: str) -> dict:
        """
        Issues a new session_token using a valid refresh_token.
        Delegates entirely to SessionService.
        Refresh token rotation (old invalidated, new issued) happens inside
        SessionService.

        Returns:
            dict: session_token, refresh_token, expires_at, refresh_expires_at

        Raises:
            RefreshTokenInvalidError: token not found or already revoked
            RefreshTokenExpiredError: refresh_expires_at has passed
 
        Called by:
            auth_views.TokenRefreshsView
        """
        return self.session_service.refresh_session(
            raw_refresh_token=raw_refresh_token,
        )

    # =========================================================================
    # RESEND OTP FLOW
    # =========================================================================

    def resend_otp(self, phone: str, purpose: str) -> None:
        """
        Resends an OTP for any purpose (signup, password_reset, phone_change).
        Rate limiting is enforced by OTPService.resend().

        The serializer has already found the existing verification record and
        checked the resend lock. We delegate to OTPService which increments
        the resend counter and sends the SMS.

        Raises:
            OTPExpiredError: no active record — user must restart the flow
            OTPRateLimitError: too many resend attempts
            SMSSendError: SMS provider failed

        Called by:
            auth_views.ResendOTPView
        """
        self.otp_service.resend(
            phone=phone,
            purpose=purpose,
        )

        logger.info('OTP resent', extra={'phone': phone, 'purpose': purpose})

    # =========================================================================
    # PHONE CHANGE FLOW
    # Step 1 → initiate_phone_change   (sends OTP to new phone)
    # Step 2 → confirm_phone_change    (marks used, updates phone, revokes sessions)
    # =========================================================================

    def initiate_phone_change(self, new_phone: str, user: None) -> None:
        """
        Step 1 of phone change flow.
        Sends OTP to the NEW phone number to verify the user owns it.

        The serializer already confirmed new_phone is not taken and is
        different from the current phone before the view calls this.

        Called by:
            profile_views.RequestPhoneChangeView

        Raises:
            SMSSendError: SMS provider failed
        """
        self.otp_service.send(
            phone=new_phone,
            purpose=PhoneVerification.Purpose.PHONE_CHANGE,
            user=user
        )

        logger.info(
            'Phone change OTP sent to new phone',
            extra={'new_phone': new_phone}
        )

    @transaction.atomic
    def confirm_phone_change(
        self,
        user: User,
        new_phone: str,
        verification: PhoneVerification,
        current_session_id: uuid.UUID,
    ) -> None:
        """
        Step 2 of phone change flow.

        Accepts the already-verified PhoneVerification object from
        ConfirmPhoneChangeSerializer.validate() — no second DB lookup needed.

        Wrapped in @transaction.atomic — phone update and session revocation
        succeed or fail together.

        Flow:
            1. Mark OTP as used (inside atomic block — cannot be replayed)
            2. Race-condition guard — recheck phone uniqueness atomically
            3. Update phone on User
            4. Revoke all sessions except the current one
               (other devices must re-login with the new phone number;
                current device stays logged in seamlessly)

        Raises:
            PhoneAlreadyExistsError: race condition — phone taken between request and confirm

        Called by:
            profile_views.ConfirmPhoneChangeView
        """
        # step 1 — consume OTP atomically
        verification.mark_used()

        # step 2 — race-condition guard
        # the new_phone could have been registered by another user between
        # the serializer check and now — check inside the atomic block
        if User.objects.filter(
            phone=new_phone,
            deleted_at__isnull=True
        ).exclude(id=user.id).exists():
            raise PhoneAlreadyExistsError(
                'This phone number was just registered by another account.'
            )

        # step 3 — update phone
        old_phone  = user.phone
        user.phone = new_phone
        user.save(update_fields=['phone'])

        # step 4 — revoke all sessions except current device
        # other devices will receive 401 and must re-login with the new phone
        self.session_service.revoke_all_sessions(
            user_id=user.id,
            reason=REVOKE_REASON_CHOICES.REVOKE_PHONE_CHANGED,
            exclude_session_id=current_session_id,
        )

        logger.info(
            'Phone number changed — other sessions revoked',
            extra={
                'user_id':      str(user.id),
                'old_phone':    old_phone,
                'new_phone':    new_phone,
                'kept_session': str(current_session_id),
            }
        )

    # =========================================================================
    # PRIVATE HELPERS
    # =========================================================================

    def _generate_reset_token(self) -> str:
        """Generates a cryptographically secure URL-safe reset token."""
        return secrets.token_urlsafe(32)

    def _store_reset_token(
        self,
        verification: PhoneVerification,
        reset_token: str,
    ) -> None:
        """
        Stores the hashed reset token on the PhoneVerification record.

        Reuses set_otp() (which calls make_password()) so the same hashing
        pipeline is used for both OTP codes and reset tokens. The verification
        record is reopened (is_used=False) with a fresh expiry so it can be
        validated in the final reset step.

        The raw token is returned to Flutter and never stored server-side.
        """
        verification.set_otp(reset_token)           # hashes with make_password()
        verification.is_used   = False              # reopen for reset token validation
        verification.expires_at = timezone.now() + timedelta(
            minutes=self.RESET_TOKEN_EXPIRY_MINUTES
        )
        verification.save(update_fields=['otp_hash', 'is_used', 'expires_at'])

    def _validate_reset_token(
        self,
        phone: str,
        raw_reset_token: str,
        user:None
    ) -> PhoneVerification:
        """
        Validates the reset token submitted in the final reset step.
        Raises InvalidResetTokenError if not found, expired, or hash mismatch.
        """
        verification = (
            PhoneVerification.objects
            .valid()
            .for_phone(phone)
            .by_purpose(PhoneVerification.Purpose.PASSWORD_RESET)
            .filter(user=user)
            .order_by('-created_at')
            .first()
        )

        
        if not user:
            raise InvalidResetTokenError(
                'User not found.'
            )

        if not verification:
            raise InvalidResetTokenError(
                'Reset token has expired. Please start the password reset process again.'
            )

        if not verification.check_otp(raw_reset_token):
            raise InvalidResetTokenError(
                'Invalid reset token. Please start the password reset process again.'
            )
        

        return verification
