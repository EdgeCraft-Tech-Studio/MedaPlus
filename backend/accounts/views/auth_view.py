import logging

from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.serializer.auth_serializer import (
    SignupSerializer,
    SignupVerifyOTPSerializer,
    LoginSerializer,
    LogoutSerializer,
    ForgotPasswordSerializer,
    ForgotPasswordVerifyOTPSerializer,
    ResetPasswordSerializer,
    TokenRefreshSerializer,
    ResendOTPSerializer,
)
from accounts.serializer.user_serializer import UserSerializer
from accounts.services.aut_service import (
    AuthService,
    PhoneAlreadyExistsError,
    UserNotFoundError,
    AccountDeletedError,
    AccountInactiveError,
    AccountBlockedError,
    InvalidCredentialsError,
    InvalidResetTokenError,
    MustChangePasswordError,
    SignupSessionExpiredError,
)
from accounts.services.otp_services import OTPLockedError, OTPRateLimitError, SMSSendError
from accounts.services.session_services import (
    RefreshTokenExpiredError,
    RefreshTokenInvalidError,
)

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# SERVICE INSTANCE
#
# One stateless AuthService instance shared across all views.
# AuthService internally holds OTPService and SessionService.
# Views NEVER call OTPService or SessionService directly — always go through
# AuthService so that all business logic stays in one place.
# ─────────────────────────────────────────────────────────────────────────────

_auth_service = AuthService()


# ─────────────────────────────────────────────────────────────────────────────
# PRIVATE HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _get_client_ip(request) -> str | None:
    """
    Extracts the real client IP.
    Checks X-Forwarded-For first (set by nginx / load balancer in production),
    falls back to REMOTE_ADDR for direct connections in development.
    """
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        return x_forwarded_for.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


def _get_user_agent(request) -> str | None:
    """Extracts HTTP User-Agent from request headers."""
    return request.META.get('HTTP_USER_AGENT')


def _get_current_session(request):
    """
    Safely retrieves the current session attached by auth middleware.

    Auth middleware must set request.current_session on every authenticated
    request. If it is absent the middleware is misconfigured — views that
    require a session should check for None and return 401 explicitly.
    """
    return getattr(request, 'current_session', None)


def _build_auth_response(user, session_data: dict, request) -> dict:
    """
    Builds the standard auth payload returned after login and signup.
    Shape is always identical so Flutter can handle both flows the same way.

    Always pass context={'request': request} to UserSerializer so that
    profile_photo_url is returned as an absolute URL, not a relative path.
    """
    return {
        'user':               UserSerializer(user, context={'request': request}).data,
        'session_token':      session_data['session_token'],
        'refresh_token':      session_data['refresh_token'],
        'expires_at':         session_data['expires_at'],
        'refresh_expires_at': session_data['refresh_expires_at'],
    }


# ─────────────────────────────────────────────────────────────────────────────
# SIGNUP DATA HELPERS
#
# Thin wrappers around AuthService Redis methods.
# Actual Redis read/write and password hashing live in AuthService.
# These helpers exist only to give views a clean, intention-revealing API.
#
# WHY Redis (not Django session):
#   Session cookies / DB sessions would persist a password hash in a
#   user-controlled cookie or a DB row readable by any DBA.
#   Redis with a server-side key + 10-minute TTL is the correct pattern
#   for short-lived pre-registration state.
# ─────────────────────────────────────────────────────────────────────────────

def _store_signup_data(phone: str, validated: dict) -> None:
    """
    Stores step-1 signup data in Redis via AuthService.
    AuthService hashes the raw password before writing — raw password
    never reaches Redis.
    Called only after OTP send succeeds — if send fails, we don't store.
    """
    
    _auth_service.store_signup_data(
        phone=phone,
        username=validated['username'],
        first_name=validated['first_name'],
        last_name=validated['last_name'],
        password=validated['password'],
        role=validated['role'],
        email=validated.get('email'),
    )


def _get_signup_data(phone: str) -> dict | None:
    """
    Retrieves step-1 signup data from Redis.
    Returns None if TTL expired or data was never stored.
    """
    return _auth_service.get_signup_data(phone=phone)


def _clear_signup_data(phone: str) -> None:
    """
    Deletes step-1 signup data from Redis after user is created.
    Safe to call even if the key no longer exists.
    """
    _auth_service.clear_signup_data(phone=phone)


# ─────────────────────────────────────────────────────────────────────────────
# 1. SIGNUP VIEW


class SignupView(APIView):
    """POST /auth/signup/ — Step 1: validate input and send OTP."""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = SignupSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        validated = serializer.validated_data
        phone     = validated['phone']

        try:
            _auth_service.initiate_signup(phone=phone)
        except PhoneAlreadyExistsError as e:
            return Response({'detail': str(e)}, status=status.HTTP_409_CONFLICT)
        except SMSSendError as e:
            logger.error(
                'SMS send failed during signup',
                extra={'phone': phone, 'error': str(e)}
            )
            return Response(
                {'detail': 'SMS service unavailable. Please try again.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )
        except Exception as e:
            logger.exception(
                "Unexpected signup error",
                extra={"phone": phone}
            )
            return Response(
                {"detail": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        # Store signup data in Redis only after OTP send succeeds.
        # If SMS fails, we do not store — user retries from scratch.
        _store_signup_data(phone, validated)

        logger.info('Signup OTP sent', extra={'phone': phone})

        return Response(
            {'message': 'OTP has been sent.'},
            status=status.HTTP_200_OK
        )


# ─────────────────────────────────────────────────────────────────────────────
# 2. SIGNUP VERIFY OTP VIEW


class SignupVerifyOTPView(APIView):
    """POST /auth/signup/verify/ — Step 2: verify OTP and create user."""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = SignupVerifyOTPSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        validated    = serializer.validated_data
        phone        = validated['phone']
        verification = validated['_verification']   # already verified by serializer

        # Retrieve step-1 data from Redis
        signup_data = _get_signup_data(phone)
        if not signup_data:
            return Response(
                {
                    'detail': (
                        'session expired. '
                        'Please start the signup process again.'
                    )
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        try:
            result = _auth_service.complete_signup(
                phone=phone,
                username=signup_data['username'],
                first_name=signup_data['first_name'],
                last_name=signup_data['last_name'],
                email=signup_data.get('email'),
                hashed_password=signup_data['hashed_password'],   # hashed in Redis
                role=signup_data['role'],
                verification=verification,
                device_id=validated['device_id'],
                device_name=validated.get('device_name'),
                device_type=validated.get('device_type', 'mobile'),
                ip_address=_get_client_ip(request),
                user_agent=_get_user_agent(request),
                fcm_token=validated.get('fcm_token'),
            )
        except PhoneAlreadyExistsError as e:
            return Response({'detail': str(e)}, status=status.HTTP_409_CONFLICT)

        # Clear Redis — data is no longer needed after user is created
        _clear_signup_data(phone)

        logger.info('Signup completed', extra={'phone': phone})

        return Response(
            _build_auth_response(result['user'], result, request),
            status=status.HTTP_201_CREATED
        )


# ─────────────────────────────────────────────────────────────────────────────
# 3. LOGIN VIEW
#    Validates credentials → creates session → returns tokens.
#    Each failure case returns a distinct HTTP status so Flutter can show
#    the appropriate UI state (wrong password, locked account, etc.).
#
#    The serializer handles: phone existence, soft-delete, active, blocked,
#    password check, and failed_attempts increment.
#    The service handles: reset_failed_attempts on success, must_change_password.
#
#    POST /auth/login/
#    Body: {
#        "phone":       "+251912345678",
#        "password":    "MyPass@123",
#        "device_id":   "uuid",
#        "device_name": "Samsung Galaxy S22",
#        "device_type": "mobile",
#        "fcm_token":   "firebase-token"
#    }
#
#    200:  { "user": {...}, "session_token": "...", "refresh_token": "..." }
#    400:  validation errors
#    403:  { "detail": "You must change your password before continuing." }
#    429:  { "detail": "Account locked.", "blocked_until": "2026-01-01T14:30:00Z" }
# ─────────────────────────────────────────────────────────────────────────────

class LoginView(APIView):
    """POST /auth/login/ — validate credentials and issue session."""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        validated = serializer.validated_data
        user      = validated['_user']   # fetched and validated by serializer

        try:
            result = _auth_service.create_session(
                user=user,
                device_id=validated['device_id'],
                device_name=validated.get('device_name'),
                device_type=validated.get('device_type', 'mobile'),
                ip_address=_get_client_ip(request),
                user_agent=_get_user_agent(request),
                fcm_token=validated.get('fcm_token') or None,
            )
        except AccountBlockedError as e:
            # race condition: account became blocked between serializer and service
            return Response(
                {
                    'detail':        str(e),
                    'blocked_until': e.blocked_until.isoformat(),
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS
            )
        except MustChangePasswordError as e:
            return Response({'detail': str(e)}, status=status.HTTP_403_FORBIDDEN)

        logger.info(
            'Login successful',
            extra={
                'user_id':    str(user.id),
                'phone':      user.phone,
                'ip_address': _get_client_ip(request),
                'device_id':  validated['device_id'],
            }
        )

        return Response(
            _build_auth_response(user, result, request),
            status=status.HTTP_200_OK
        )


class HomeDataView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # request.user was resolved and verified by SessionTokenAuthentication
        # before this line ever runs — no re-fetch needed.
        serializer = UserSerializer(request.user, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)
# ─────────────────────────────────────────────────────────────────────────────
# 4. LOGOUT VIEW
#    Revokes the current session or all sessions.
#    Current session is attached by auth middleware as request.current_session.
#
#    POST /auth/logout/
#    Body: { "revoke_all": false }
#
#    200: { "message": "Logged out successfully." }
#    200: { "message": "Logged out from all 3 device(s)." }
#    401: session not found (middleware misconfigured)
# ─────────────────────────────────────────────────────────────────────────────

class LogoutView(APIView):
    """POST /auth/logout/ — revoke current session or all sessions."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = LogoutSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        current_session = _get_current_session(request)
        if not current_session:
            logger.error(
                'LogoutView: request.current_session not set — '
                'check that SessionAuthMiddleware is in settings.MIDDLEWARE'
            )
            return Response(
                {'detail': 'Session not found. Please login again.'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        revoke_all = serializer.validated_data.get('revoke_all', False)

        if revoke_all:
            count = _auth_service.logout_all(
                user_id=request.user.id,
                current_session_id=None,   # None = revoke ALL including current
            )
            message = f'Logged out from all {count} device(s).'
        else:
            _auth_service.logout(session=current_session)
            message = 'Logged out successfully.'

        logger.info(
            'Logout',
            extra={'user_id': str(request.user.id), 'revoke_all': revoke_all}
        )

        return Response({'message': message}, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────────────────────────────────────
# 5. FORGOT PASSWORD VIEW
#    Step 1 of the password reset flow.
#    Always returns the same message — prevents phone enumeration attacks.
#    The service silently does nothing when the phone is not registered.
#
#    POST /auth/forgot-password/
#    Body: { "phone": "+251912345678" }
#
#    200: { "message": "If this number is registered, an OTP has been sent." }
#    503: SMS service unavailable (only when user actually exists)
# ─────────────────────────────────────────────────────────────────────────────

class ForgotPasswordView(APIView):
    """POST /auth/forgot-password/ — step 1: send password-reset OTP."""
    permission_classes = [AllowAny]

    _RESPONSE_MESSAGE = 'If this number is registered, an OTP has been sent.'

    def post(self, request):
        serializer = ForgotPasswordSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        phone = serializer.validated_data['phone']

        try:
            _auth_service.initiate_forgot_password(phone=phone)
        
        except OTPLockedError as e:
            return Response(
                {"phone": str(e)},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        except SMSSendError as e:
            logger.error(
                'SMS send failed during forgot password',
                extra={'phone': phone, 'error': str(e)}
            )
            return Response(
                {'detail': 'SMS service unavailable. Please try again.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )

        # Always return the same message — never reveal whether phone exists
        return Response(
            {'message': self._RESPONSE_MESSAGE},
            status=status.HTTP_200_OK
        )


# ─────────────────────────────────────────────────────────────────────────────
# 6. FORGOT PASSWORD VERIFY OTP VIEW
#    Step 2 of the password reset flow.
#    Serializer verifies OTP and attaches '_verification'.
#    Service generates a short-lived reset token and stores its hash.
#
#    POST /auth/forgot-password/verify/
#    Body: { "phone": "+251912345678", "otp_code": "73654" }
#
#    200: { "reset_token": "..." }
#    400: OTP expired, not found, or incorrect
#    429: Too many incorrect attempts
# ─────────────────────────────────────────────────────────────────────────────

class ForgotPasswordVerifyOTPView(APIView):
    """POST /auth/forgot-password/verify/ — step 2: verify OTP, issue reset token."""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ForgotPasswordVerifyOTPSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        validated    = serializer.validated_data
        verification = validated['_verification']   # already verified by serializer

        reset_token = _auth_service.generate_reset_token(
            phone=validated['phone'],
            verification=verification,   # service calls mark_used() here
        )

        return Response({'reset_token': reset_token}, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────────────────────────────────────
# 7. RESET PASSWORD VIEW
#    Step 3 and final step of the password reset flow.
#    Validates reset_token → updates password → revokes ALL sessions.
#
#    POST /auth/reset-password/
#    Body: {
#        "phone":            "+251912345678",
#        "reset_token":      "...",
#        "new_password":     "NewPass@123",
#        "confirm_password": "NewPass@123"
#    }
#
#    200: { "message": "Password reset successful. Please login again." }
#    400: Invalid or expired reset token
#    404: No account found
# ─────────────────────────────────────────────────────────────────────────────

class ResetPasswordView(APIView):
    """POST /auth/reset-password/ — step 3: validate token and set new password."""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ResetPasswordSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        validated = serializer.validated_data
        user      = validated['_user']   # fetched by serializer

        try:
            _auth_service.reset_password(
                phone=user.phone,
                user=user,
                raw_reset_token=validated['reset_token'],
                new_password=validated['new_password'],
            )
        except InvalidResetTokenError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except UserNotFoundError as e:
            # should not occur (serializer already fetched the user)
            # guarded here for defense-in-depth
            return Response({'detail': str(e)}, status=status.HTTP_404_NOT_FOUND)

        logger.info(
            'Password reset completed',
            extra={'user_id': str(user.id), 'phone': user.phone}
        )

        return Response(
            {'message': 'Password reset successful. Please login again.'},
            status=status.HTTP_200_OK
        )


# ─────────────────────────────────────────────────────────────────────────────
# 8. TOKEN REFRESH VIEW
#    Issues a new session_token when the current one expires.
#    Flutter calls this automatically on receiving 401 Unauthorized.
#    Old refresh_token is invalidated — Flutter must store both new tokens.
#
#    POST /auth/token/refresh/
#    Body: { "refresh_token": "..." }
#
#    200: {
#        "session_token":      "...",
#        "refresh_token":      "...",
#        "expires_at":         "...",
#        "refresh_expires_at": "..."
#    }
#    401: Invalid or expired refresh token
# ─────────────────────────────────────────────────────────────────────────────

class TokenRefreshsView(APIView): 
    """POST /auth/token/refresh/ — exchange refresh token for new session token."""
    permission_classes = [AllowAny]   # session_token is expired — cannot require auth

    def post(self, request):
        serializer = TokenRefreshSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            result = _auth_service.refresh_token(
                raw_refresh_token=serializer.validated_data['refresh_token'],
            )
        except RefreshTokenInvalidError as e:
            return Response({'detail': str(e)}, status=status.HTTP_401_UNAUTHORIZED)
        except RefreshTokenExpiredError as e:
            return Response({'detail': str(e)}, status=status.HTTP_401_UNAUTHORIZED)

        return Response(
            {
                'session_token':      result['session_token'],
                'refresh_token':      result['refresh_token'],
                'expires_at':         result['expires_at'],
                'refresh_expires_at': result['refresh_expires_at'],
            },
            status=status.HTTP_200_OK
        )


# ─────────────────────────────────────────────────────────────────────────────
# 9. RESEND OTP VIEW
#    Flutter OTP screen "Didn't receive a code? Resend" button.
#    Serializer checks the resend lock before allowing — prevents OTP spam.
#
#    POST /auth/resend-otp/
#    Body: { "phone": "+251912345678", "purpose": "signup" }
#
#    200: { "message": "OTP resent to +251912345678" }
#    400: No pending OTP — user must restart the flow
#    429: { "detail": "Too many requests. Try again after 14:30." }
#    503: SMS service unavailable
# ─────────────────────────────────────────────────────────────────────────────

class ResendOTPView(APIView):
    """POST /auth/resend-otp/ — resend OTP for any pending flow."""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ResendOTPSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        validated = serializer.validated_data
        phone     = validated['phone']
        purpose   = validated['purpose']

        try:
            _auth_service.resend_otp(
                phone=phone,
                purpose=purpose,
            )

        except OTPLockedError as e:
            return Response(
                {"phone": str(e)},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        except OTPRateLimitError as e:
            return Response(
                {
                    "phone": str(e),
                    "blocked_until": e.blocked_until,
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        except SMSSendError as e:
            logger.error(
                "SMS send failed during OTP resend",
                extra={
                    "phone": phone,
                    "purpose": purpose,
                    "error": str(e),
                },
            )

            return Response(
                {"detail": "SMS service unavailable. Please try again."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
