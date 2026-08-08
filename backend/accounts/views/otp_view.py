import logging

from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.serializer.auth_serializer import ResendOTPSerializer
from accounts.services.otp_services import (
    OTPLockedError,
    OTPService,
    OTPNotFoundError,
    OTPRateLimitError,
    SMSSendError,
)
from core.utils.validator import validate_phone_format

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# WHY THIS FILE EXISTS
#
# auth_views.py handles OTP as part of specific auth flows:
#   SignupVerifyOTPView           → verifies OTP then creates user + session
#   ForgotPasswordVerifyOTPView   → verifies OTP then issues reset_token
#
# profile_views.py handles OTP as part of profile flows:
#   ConfirmPhoneChangeView        → verifies OTP then updates phone number
#
# THIS FILE handles OTP as a pure standalone utility:
#   ResendOTPView   → resend OTP for ANY purpose (signup / password_reset / phone_change)
#   OTPStatusView   → check OTP state for Flutter's countdown timer
#
# Future OTP uses (bidding confirmation, high-value payment confirmation,
# sensitive admin actions) will call otp_service.send() and otp_service.verify()
# directly inside their own service files. They do NOT need views here.
# Only ResendOTP and OTPStatus are cross-cutting enough to live in this file.
# ─────────────────────────────────────────────────────────────────────────────

_otp_service = OTPService()


# ─────────────────────────────────────────────────────────────────────────────
# 1. RESEND OTP VIEW
#
# Flutter OTP screen "Didn't receive a code? Resend" button.
# Works for all purposes: signup, password_reset, phone_change.
# Rate limited: max 3 resends per phone per purpose before lockout (1 hour).
#
# KEY DESIGN:
# ResendOTPSerializer.validate() already:
#   - Found the PhoneVerification record
#   - Checked is_resend_locked()
#   - Attached it as validated_data['_verification']
# We pass it directly to the service — no second DB lookup.
#
# POST /otp/resend/
# Body: { "phone": "+251912345678", "purpose": "signup" }
#
# Success 200: { "message": "OTP resent to +251912345678" }
# Error   400: { "detail": "No pending OTP found. Please start over." }
# Error   429: {
#     "detail": "Too many OTP requests. Try again after 14:30.",
#     "blocked_until": "2026-06-01T14:30:00Z"
# }
# Error   503: { "detail": "SMS service unavailable. Please try again." }
# ─────────────────────────────────────────────────────────────────────────────

class ResendOTPView(APIView):
    """
    POST /otp/resend/
    No authentication required — user may not be logged in yet
    (e.g. during signup or password reset flows).
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ResendOTPSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                serializer.errors,
                status=status.HTTP_400_BAD_REQUEST
            )

        validated    = serializer.validated_data
        phone        = validated['phone']
        purpose      = validated['purpose']

        # Pass _verification already found by serializer — no second DB hit
        verification = validated['_verification']

        try:
            _otp_service.resend(
                phone=phone,
                purpose=purpose,
                verification=verification,
                user=None
            )
        except OTPNotFoundError as e:
            return Response(
                {'detail': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except OTPLockedError as e:
            # user guessed wrong too many times — locked out regardless
            # of resend attempts, must wait for the attempts lock to clear
            logger.warning(
                'OTP resend blocked — attempts locked',
                extra={'phone': phone, 'purpose': purpose}
            )
            return Response(
                {'detail': str(e)},
                status=status.HTTP_423_LOCKED
            )
        except OTPRateLimitError as e:
            # blocked_until lets Flutter show exact countdown timer
            return Response(
                {
                    'detail':        str(e),
                    'blocked_until': e.blocked_until.isoformat(),
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS
            )
        except SMSSendError:
            logger.error(
                'SMS send failed during OTP resend',
                extra={'phone': phone, 'purpose': purpose},
                exc_info=True,
            )
            return Response(
                {'detail': 'SMS service unavailable. Please try again.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )

        logger.info(
            'OTP resent',
            extra={'phone': phone, 'purpose': purpose}
        )

        return Response(
            {'message': f'OTP resent to {phone}'},
            status=status.HTTP_200_OK
        )


class OTPStatusView(APIView):
    """
    GET /otp/status/?phone=+251912345678&purpose=signup
    Read-only. No authentication required.
    Used by Flutter OTP screen to initialize countdown timer
    and determine resend button state on screen load.
    """
    permission_classes = [AllowAny]

    VALID_PURPOSES = {'signup', 'login', 'password_reset', 'phone_change'}

    def get(self, request):
        phone   = request.query_params.get('phone', '').strip()
        purpose = request.query_params.get('purpose', '').strip()

        if not phone:
            return Response(
                {'detail': 'phone query parameter is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not purpose:
            return Response(
                {'detail': 'purpose query parameter is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if purpose not in self.VALID_PURPOSES:
            return Response(
                {
                    'detail': (
                        f'Invalid purpose. '
                        f'Must be one of: {", ".join(sorted(self.VALID_PURPOSES))}'
                    )
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            validate_phone_format(phone)
        except Exception:
            return Response(
                {'detail': 'Invalid phone number format. Example: +251912345678'},
                status=status.HTTP_400_BAD_REQUEST
            )

        otp_status = _otp_service.get_status(phone=phone, purpose=purpose)

        return Response(otp_status, status=status.HTTP_200_OK)