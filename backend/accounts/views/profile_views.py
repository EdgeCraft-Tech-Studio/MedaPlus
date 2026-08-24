import logging

from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import DeviceToken
from accounts.serializer.profile_serializer import (
    UpdateProfileSerializer,
    UpdateProfilePhotoSerializer,
    UpdateEmailSerializer,
    ChangePasswordSerializer,
    UpdateFCMTokenSerializer,
)
from accounts.serializer.auth_serializer import (
    RequestPhoneChangeSerializer,
    ConfirmPhoneChangeSerializer,
)
from accounts.serializer.user_serializer import UserSerializer
from accounts.services.aut_service import (
    AuthService,
    PhoneAlreadyExistsError,
)
from accounts.services.profile_services import (
    ProfileService,
)
from accounts.services.otp_services import (
    OTPExpiredError,
    OTPInvalidError,
    OTPLockedError,
    SMSSendError,
)
from core.utils.decorators import session_required

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# service instances — stateless, safe to share across all views
# ─────────────────────────────────────────────────────────────────────────────
_auth_service    = AuthService()
_profile_service = ProfileService()


# ─────────────────────────────────────────────────────────────────────────────
# 1. ME VIEW
#
# Returns the authenticated user's full profile.
# Flutter calls this on app launch to restore user state.
# Also called after any profile update to refresh local state.
#
# GET /accounts/me/
# Headers: Authorization: Bearer <session_token>
#
# Success 200: { ...UserSerializer fields... }
# Error   401: authentication required
# ─────────────────────────────────────────────────────────────────────────────

class MeView(APIView):
    """
    GET /accounts/me/
    Returns full authenticated user data.
    Flutter calls this on app launch to restore user state.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(
            request.user,
            context={'request': request}
        )
        return Response(serializer.data, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────────────────────────────────────
# 2. UPDATE PROFILE VIEW
#
# Updates first_name and/or last_name.
# Both fields optional — send only what changed.
# Returns FULL UserSerializer — not just the changed fields —
# so Flutter refreshes all user state in one call.
#
# PATCH /accounts/me/
# Body: { "first_name": "Dawit", "last_name": "Mekonnen" }
#
# Success 200: { ...UserSerializer fields... }
# Error   400: { "field": ["error message"] }
# Error   400: { "detail": "No changes detected." }
# Error   401: authentication required
# ─────────────────────────────────────────────────────────────────────────────

class UpdateProfileView(APIView):
    """
    PATCH /accounts/me/
    Updates first_name and/or last_name.
    Serializer handles save directly — no service needed.
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request):
        serializer = UpdateProfileSerializer(
            instance=request.user,
            data=request.data,
            partial=True,
            context={'request': request}
        )
        if not serializer.is_valid():
            return Response(
                serializer.errors,
                status=status.HTTP_400_BAD_REQUEST
            )

        user = serializer.save()

        logger.info(
            'Profile updated',
            extra={'user_id': str(user.id)}
        )

        # FIX 1: Use UserSerializer NOT serializer.to_representation().
        # UpdateProfileSerializer.Meta.fields = ['first_name', 'last_name'] only.
        # Calling to_representation() returns only those two fields.
        # Flutter needs the FULL user object to refresh its state.
        # context={'request': request} is mandatory — builds absolute photo URL.
        return Response(
            UserSerializer(user, context={'request': request}).data,
            status=status.HTTP_200_OK
        )


# ─────────────────────────────────────────────────────────────────────────────
# 3. UPDATE PROFILE PHOTO VIEW
#
# Handles multipart/form-data file upload.
# JSON PATCH cannot carry binary file data — separate endpoint
# with MultiPartParser and FormParser required.
# Old photo deleted from S3 before new one saved — no orphaned files.
# Returns only the new photo URL — Flutter already has everything else.
#
# PATCH /accounts/me/photo/
# Content-Type: multipart/form-data
# Body: { "profile_photo": <file> }
#
# Success 200: { "profile_photo_url": "https://..." }
# Error   400: { "profile_photo": ["File too large. Max 5MB."] }
# Error   400: { "profile_photo": ["Only JPEG, PNG, WebP accepted."] }
# Error   401: authentication required
# ─────────────────────────────────────────────────────────────────────────────

class UpdatePhotoView(APIView):
    """
    PATCH /accounts/me/photo/
    Accepts multipart/form-data image upload.
    Old photo deleted from S3 before saving new one.
    """
    permission_classes = [IsAuthenticated]
    parser_classes     = [MultiPartParser, FormParser]

    def patch(self, request):
        serializer = UpdateProfilePhotoSerializer(
            instance=request.user,
            data=request.data,
            context={'request': request}
        )
        if not serializer.is_valid():
            return Response(
                serializer.errors,
                status=status.HTTP_400_BAD_REQUEST
            )

        user = serializer.save()

        logger.info(
            'Profile photo updated',
            extra={'user_id': str(user.id)}
        )

        # Return only the new URL — Flutter has the rest of the user object.
        # get_profile_photo_url builds absolute URL using request context.
        return Response(
            {'profile_photo_url': serializer.get_profile_photo_url(user)},
            status=status.HTTP_200_OK
        )


# ─────────────────────────────────────────────────────────────────────────────
# 4. UPDATE EMAIL VIEW
#
# Email is optional on this platform — phone is primary auth field.
# Useful for receipts and account recovery.
# Returns FULL UserSerializer so Flutter refreshes all state in one call.
#
# PATCH /accounts/me/email/
# Body: { "email": "user@example.com" }
#
# Success 200: { ...UserSerializer fields... }
# Error   400: { "email": ["This email is already in use."] }
# Error   400: { "email": ["This is already your current email."] }
# Error   401: authentication required
# ─────────────────────────────────────────────────────────────────────────────

class UpdateEmailView(APIView):
    """
    PATCH /accounts/me/email/
    Updates optional email field.
    Serializer handles save and uniqueness check directly.
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request):
        serializer = UpdateEmailSerializer(
            instance=request.user,
            data=request.data,
            context={'request': request}
        )
        if not serializer.is_valid():
            return Response(
                serializer.errors,
                status=status.HTTP_400_BAD_REQUEST
            )

        user = serializer.save()

        logger.info(
            'Email updated',
            extra={'user_id': str(user.id)}
        )

        # FIX 1 (same as UpdateProfileView):
        # Use UserSerializer — UpdateEmailSerializer.Meta.fields = ['email'] only.
        # Flutter needs the full user object not just the email field.
        return Response(
            UserSerializer(user, context={'request': request}).data,
            status=status.HTTP_200_OK
        )


# ─────────────────────────────────────────────────────────────────────────────
# 5. CHANGE PASSWORD VIEW
#
# Requires current password to prevent unauthorized changes.
#
# On success:
# - Password updated and hashed
# - failed_attempts reset to 0
# - blocked_until cleared
# - must_change_password cleared
# - ALL OTHER active sessions revoked — other devices must login again
# - Current session kept alive — user stays logged in on THIS device
#
# POST /accounts/me/change-password/
# Body: {
#     "current_password": "...",
#     "new_password":     "...",
#     "confirm_password": "..."
# }
#
# Success 200: { "message": "Password updated. Other devices have been logged out." }
# Error   400: { "current_password": ["Current password is incorrect."] }
# Error   400: { "new_password": ["Must be different from current password."] }
# Error   400: { "confirm_password": ["Passwords do not match."] }
# Error   401: authentication required or session not found in middleware
# ─────────────────────────────────────────────────────────────────────────────

class ChangePasswordView(APIView):
    """
    POST /accounts/me/change-password/
    Updates password and revokes all other sessions.
    Current session excluded — user stays logged in on this device.
    """
    permission_classes = [IsAuthenticated]

    @session_required
    def post(self, request):
        serializer = ChangePasswordSerializer(
            data=request.data,
            context={'request': request}
        )
        if not serializer.is_valid():
            return Response(
                serializer.errors,
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            _profile_service.change_password(
                user=request.user,
                new_password=serializer.validated_data['new_password'],
                current_session_id=request.current_session.id,
            )
        except Exception as e:
            logger.warning('Password change failed at service layer', extra={'user_id': str(request.user.id)}, exc_info=True)
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        logger.info(
            'Password changed — other sessions revoked',
            extra={
                'user_id':    str(request.user.id),
                'session_id': str(request.current_session.id),
            }
        )

        return Response(
            {'message': 'Password updated. Other devices have been logged out.'},
            status=status.HTTP_200_OK
        )


# ─────────────────────────────────────────────────────────────────────────────
# 6. REQUEST PHONE CHANGE VIEW
#
# Step 1 of phone change flow.
# User enters new phone number.
# OTP sent to NEW phone to confirm they own it.
# Current phone number does NOT change here.
#
# POST /accounts/me/phone/request/
# Body: { "new_phone": "+251911000000" }
#
# Success 200: { "message": "OTP sent to +251911000000" }
# Error   400: { "new_phone": ["Must be different from current number."] }
# Error   409: { "detail": "This number is already registered." }
# Error   503: { "detail": "SMS service unavailable. Please try again." }
# Error   401: authentication required
# ─────────────────────────────────────────────────────────────────────────────

class RequestPhoneChangeView(APIView):
    """
    POST /accounts/me/phone/request/
    Step 1 of phone change — sends OTP to new phone number.
    Phone number does NOT change until OTP verified in step 2.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = RequestPhoneChangeSerializer(
            data=request.data,
            context={'request': request}
        )
        if not serializer.is_valid():
            return Response(
                serializer.errors,
                status=status.HTTP_400_BAD_REQUEST
            )

        new_phone = serializer.validated_data['new_phone']

        try:
            # FIX 2: Pass user=request.user.
            # The service needs to know WHICH account is requesting the change
            # to associate the PhoneVerification row with the right user.
            # Original passed only new_phone — service had no user context.
            _auth_service.initiate_phone_change(
                new_phone=new_phone,
                user = request.user
            )
        except SMSSendError:
            # do not expose internal SMS error details to API caller
            logger.error(
                'SMS send failed during phone change request',
                extra={
                    'user_id':   str(request.user.id),
                    'new_phone': new_phone,
                },
                exc_info=True,
            )
            return Response(
                {'detail': 'SMS service unavailable. Please try again.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )

        logger.info(
            'Phone change OTP sent',
            extra={
                'user_id':   str(request.user.id),
                'new_phone': new_phone,
            }
        )

        return Response(
            {'message': f'OTP sent to {new_phone}'},
            status=status.HTTP_200_OK
        )


# ─────────────────────────────────────────────────────────────────────────────
# 7. CONFIRM PHONE CHANGE VIEW
#
# Step 2 of phone change flow.
# User enters OTP received on NEW phone.
#
# On success:
# - OTP marked as used — cannot be replayed
# - Phone number updated on User model
# - ALL OTHER sessions revoked — other devices login with new phone
# - Current session kept alive — user stays on this device
# - Returns full UserSerializer so Flutter sees new phone number immediately
#
# POST /accounts/me/phone/confirm/
# Body: { "new_phone": "+251911000000", "otp_code": "39271" }
#
# Success 200: { ...UserSerializer fields... }  ← with updated phone number
# Error   400: { "otp_code": ["Incorrect OTP. 3 attempt(s) remaining."] }
# Error   400: { "otp_code": ["OTP expired. Request a new one."] }
# Error   409: { "detail": "Phone just taken by another account." }
# Error   429: { "detail": "Too many incorrect attempts." }
# Error   401: authentication required or session not found
# ─────────────────────────────────────────────────────────────────────────────

class ConfirmPhoneChangeView(APIView):
    """
    POST /accounts/me/phone/confirm/
    Step 2 of phone change — verifies OTP and updates phone number.
    All other sessions revoked. Current session kept alive.
    """
    permission_classes = [IsAuthenticated]

    @session_required
    def post(self, request):
        serializer = ConfirmPhoneChangeSerializer(
            data=request.data,
            context={'request': request}
        )
        if not serializer.is_valid():
            return Response(
                serializer.errors,
                status=status.HTTP_400_BAD_REQUEST
            )

        validated    = serializer.validated_data
        verification = validated['_verification']  # already verified by serializer

        try:
            # FIX 3: Pass verification= NOT otp_code=.
            # Serializer already queried the DB, verified the OTP hash,
            # and attached the row as validated_data['_verification'].
            # Passing otp_code= makes the service run a second identical
            # query and hash check — pure duplication and wasted DB hit.
            # Service receives the already-verified row and calls
            # verification.mark_used() inside the atomic transaction.
            _auth_service.confirm_phone_change(
                user=request.user,
                new_phone=validated['new_phone'],
                verification=verification,
                current_session_id=request.current_session.id,
            )
        except PhoneAlreadyExistsError as e:
            # race condition — phone taken between step 1 and step 2
            return Response(
                {'detail': str(e)},
                status=status.HTTP_409_CONFLICT
            )
        except OTPExpiredError as e:
            return Response(
                {'detail': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except OTPInvalidError as e:
            return Response(
                {'detail': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except OTPLockedError as e:
            return Response(
                {'detail': str(e)},
                status=status.HTTP_429_TOO_MANY_REQUESTS
            )

        # refresh_from_db() — phone just changed in the database.
        # request.user is the in-memory instance with the OLD phone.
        # Without this, UserSerializer serializes the stale object
        # and Flutter sees the old phone number in the response.
        request.user.refresh_from_db()

        logger.info(
            'Phone number changed',
            extra={
                'user_id':   str(request.user.id),
                'new_phone': validated['new_phone'],
            }
        )

        # Flutter sees new phone number immediately — no separate GET needed
        return Response(
            UserSerializer(request.user, context={'request': request}).data,
            status=status.HTTP_200_OK
        )


# ─────────────────────────────────────────────────────────────────────────────
# 8. UPDATE FCM TOKEN VIEW  ← FIX 4: NEW — was missing entirely
#
# WHY THIS EXISTS:
# Firebase does not always initialize before the first login completes.
# When fcm_token=None at login, DeviceToken is created without a token
# and that device never receives push notifications until next login.
#
# Flutter calls this endpoint in two cases:
# 1. Firebase initializes AFTER login — Flutter now has a token to register
# 2. Firebase rotates the token — Flutter must update it to keep receiving pushes
#
# Without this endpoint:
# - Users with fcm_token=None at login never get push notifications
# - Users whose Firebase rotated token silently stop getting pushes
# - Only fix would be logout + login — terrible UX
#
# PATCH /accounts/me/fcm-token/
# Body: { "fcm_token": "firebase-token-string" }
#
# Success 200: { "message": "Device token updated." }
# Error   400: { "fcm_token": ["FCM token appears invalid."] }
# Error   401: authentication required or session not found
# ─────────────────────────────────────────────────────────────────────────────

class UpdateFCMTokenView(APIView):
    """
    PATCH /accounts/me/fcm-token/
    Updates or registers FCM token for the current device.
    Called by Flutter after Firebase initializes post-login,
    or whenever Firebase rotates the token.
    """
    permission_classes = [IsAuthenticated]

    @session_required
    def patch(self, request):
        serializer = UpdateFCMTokenSerializer(
            data=request.data,
            context={'request': request}
        )
        if not serializer.is_valid():
            return Response(
                serializer.errors,
                status=status.HTTP_400_BAD_REQUEST
            )

        fcm_token = serializer.validated_data['fcm_token']

        # DeviceToken.replace_token_for_device handles:
        # 1. Deactivate old token for this device (if any)
        # 2. Create fresh DeviceToken linked to current session
        # Both steps wrapped in transaction.atomic() on the model
        DeviceToken.replace_token_for_device(
            user_id=request.user.id,
            device_id=request.current_session.device_id,
            fcm_token=fcm_token,
            session=request.current_session,
            device_name=request.current_session.device_name,
            device_type=request.current_session.device_type,
        )

        logger.info(
            'FCM token updated',
            extra={
                'user_id':   str(request.user.id),
                'device_id': request.current_session.device_id,
            }
        )

        return Response(
            {'message': 'Device token updated.'},
            status=status.HTTP_200_OK
        )