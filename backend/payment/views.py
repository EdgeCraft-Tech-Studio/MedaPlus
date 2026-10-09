from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
import pytesseract
from rest_framework import views
from rest_framework.exceptions import APIException, NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

from .exceptions import PaymentServiceError
from .models import PaymentTransaction, PitchOwnerBankAccount
from .permissions import IsPlatformAdmin
from .ocr import extract_reference_from_image
from .throttling import PaymentSubmitThrottle, ReceiptExtractionThrottle
from .serializers import (
    BankRequirementSerializer,
    ConfigurePaymentProfileSerializer,
    ExtractedReceiptDataSerializer,
    ExtractReceiptDataSerializer,
    OwnerPaymentRowSerializer,
    OwnerReverseVerifiedSerializer,
    OwnerReviewActionSerializer,
    PaymentInfoSerializer,
    PaymentTransactionAdminSerializer,
    PaymentTransactionSerializer,
    PitchOwnerBankAccountSerializer,
    PitchOwnerPaymentProfileSerializer,
    ResolveReviewSerializer,
    SubmitManualBankPaymentSerializer,
    UpsertBankAccountSerializer,
)
from .services import (
    InvalidOwnerPassword,
    PaymentNotFound,
    ReferenceAlreadyVerified,
    acknowledge_payment_completion,
    get_bank_requirements,
    check_pending_payment,
    configure_payment_profile,
    deactivate_bank_account,
    get_payment_completion_payload,
    get_payment_info_for_owner,
    get_pending_payment_completion_for_user,
    get_saved_sender_banks,
    list_pitch_payments,
    owner_resolve_payment,
    owner_reverse_verified_payment,
    resolve_needs_review,
    submit_manual_bank_payment,
    upsert_bank_account,
)

User = get_user_model()


def _get_booking(booking_id):
    from bookings.models import Booking  # ASSUMPTION — same flagged guess as models.py

    return get_object_or_404(Booking, id=booking_id)


def _get_team_booking_payment(payment_id, user):
    """Scoped to payer_id=user.id — 404, not 403, so a wrong id never
    confirms to an unrelated user that this payment exists at all.
    """
    from team_booking.models import TeamBookingPayment

    tbp = get_object_or_404(TeamBookingPayment, id=payment_id)
    if tbp.payer_id != user.id:
        raise NotFound()
    return tbp

class OwnerPaymentInfoView(views.APIView):
    """GET /payment/owners/{owner_id}/payment-info/ — any authenticated
    payer, checking how to pay before/while booking.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, owner_id):
        owner = get_object_or_404(User, id=owner_id)
        info = get_payment_info_for_owner(owner=owner)
        return Response(PaymentInfoSerializer(info).data)


class OwnerPaymentProfileView(views.APIView):
    """GET: owner (self) or admin. PUT: admin only."""

    permission_classes = [IsAuthenticated]

    def get(self, request, owner_id):
        owner = get_object_or_404(User, id=owner_id)
        if request.user.id != owner.id and not getattr(request.user, "platform_admin", False):
            raise PermissionDenied("Not allowed to view this profile.")
        profile = getattr(owner, "payment_profile", None)
        if profile is None:
            return Response(None)
        return Response(PitchOwnerPaymentProfileSerializer(profile).data)

    def put(self, request, owner_id):
        if not getattr(request.user, "platform_admin", False):
            raise PermissionDenied("Only a platform admin can configure payment profiles.")
        owner = get_object_or_404(User, id=owner_id)
        serializer = ConfigurePaymentProfileSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            profile = configure_payment_profile(
                owner=owner, configured_by=request.user, **serializer.validated_data
            )
        except PaymentServiceError as exc:
            raise ValidationError({"detail": str(exc)})
        return Response(PitchOwnerPaymentProfileSerializer(profile).data)


class OwnerBankAccountsView(views.APIView):
    """GET: owner (self) or admin. POST: admin only, upserts one bank."""

    permission_classes = [IsAuthenticated]

    def get(self, request, owner_id):
        owner = get_object_or_404(User, id=owner_id)
        if request.user.id != owner.id and not getattr(request.user, "platform_admin", False):
            raise PermissionDenied("Not allowed to view these accounts.")
        accounts = PitchOwnerBankAccount.objects.filter(owner=owner, is_active=True)
        return Response(PitchOwnerBankAccountSerializer(accounts, many=True).data)

    def post(self, request, owner_id):
        if not getattr(request.user, "platform_admin", False):
            raise PermissionDenied("Only a platform admin can add bank accounts.")
        owner = get_object_or_404(User, id=owner_id)
        serializer = UpsertBankAccountSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            account = upsert_bank_account(owner=owner, **serializer.validated_data)
        except PaymentServiceError as exc:
            raise ValidationError({"detail": str(exc)})
        return Response(PitchOwnerBankAccountSerializer(account).data, status=201)


class OwnerBankAccountDeactivateView(views.APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    def post(self, request, owner_id, account_id):
        account = get_object_or_404(PitchOwnerBankAccount, id=account_id, owner_id=owner_id)
        account = deactivate_bank_account(bank_account=account)
        return Response(PitchOwnerBankAccountSerializer(account).data)


class OcrUnavailable(APIException):
    status_code = 503
    default_detail = "Receipt scanning is unavailable right now. Please type the reference number manually."
    default_code = "ocr_unavailable"


class BankRequirementsView(views.APIView):
    """GET /payment/bank-requirements/ — which extra inputs each bank
    needs on the payer's form. Frontend renders fields from this.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(BankRequirementSerializer(get_bank_requirements(), many=True).data)


class ExtractReceiptDataView(views.APIView):
    """POST /payment/extract-receipt-data/ — best-effort OCR
    suggestion only. The payer still confirms/edits before the actual
    payment submission uses any of this. Throttled: OCR is CPU work,
    not a network wait like verify.et — under concurrent abuse this
    competes for server CPU directly, so it needs its own limit
    separate from the payment-submission throttle.
    """

    permission_classes = [IsAuthenticated]
    throttle_classes = [ReceiptExtractionThrottle]

    def post(self, request):
        serializer = ExtractReceiptDataSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            result = extract_reference_from_image(
                image_file=serializer.validated_data["screenshot"],
                bank_hint=serializer.validated_data.get("bank_hint", ""),
            )
        except ValueError as exc:
            raise ValidationError({"screenshot": str(exc)})
        except (pytesseract.TesseractNotFoundError, RuntimeError):
            raise OcrUnavailable()
        return Response(ExtractedReceiptDataSerializer(result).data)

class TeamBookingPaymentInfoView(views.APIView):
    """GET /payment/team-booking-payments/{payment_id}/payment-info/
    What MemberPaymentPopup needs: gateway-eligible or manual bank,
    and if manual, which accounts + per-bank field requirements.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, payment_id):
        from pitches.models import Pitch

        tbp = _get_team_booking_payment(payment_id, request.user)
        pitch = get_object_or_404(Pitch.objects.select_related("tenant"), id=tbp.request.pitch_id)
        info = get_payment_info_for_owner(owner=pitch.tenant.owner)
        info["amount_due"] = str(tbp.amount)
        return Response(PaymentInfoSerializer(info).data)


class SubmitTeamBookingPaymentView(views.APIView):
    """POST /payment/team-booking-payments/{payment_id}/pay/
    A team member's (or owner's) manual-bank payment for their share.
    """

    permission_classes = [IsAuthenticated]
    throttle_classes = [PaymentSubmitThrottle]

    def post(self, request, payment_id):
        from team_booking.models import PaymentStatus as TeamBookingPaymentStatus

        tbp = _get_team_booking_payment(payment_id, request.user)
        if tbp.status != TeamBookingPaymentStatus.PENDING:
            raise ValidationError({"detail": "This payment is no longer pending."})
        if tbp.request.is_payment_expired:
            raise ValidationError({"detail": "The payment window has closed."})

        serializer = SubmitManualBankPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            transaction = submit_manual_bank_payment(
                team_booking_payment=tbp, payer=request.user, **serializer.validated_data
            )
        except PaymentServiceError as exc:
            raise ValidationError({"detail": str(exc)})
        return Response(PaymentTransactionSerializer(transaction).data, status=201)



class SubmitPaymentView(views.APIView):
    """POST /payment/bookings/{booking_id}/pay/ — the payer's actual
    payment submission.
    """

    permission_classes = [IsAuthenticated]
    throttle_classes = [PaymentSubmitThrottle]

    def post(self, request, booking_id):
        booking = _get_booking(booking_id)
        serializer = SubmitManualBankPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            transaction = submit_manual_bank_payment(
                booking=booking, payer=request.user, **serializer.validated_data
            )
        except PaymentServiceError as exc:
            raise ValidationError({"detail": str(exc)})
        return Response(PaymentTransactionSerializer(transaction).data, status=201)


def _get_own_or_admin_transaction(request, transaction_id):
    transaction = get_object_or_404(PaymentTransaction, id=transaction_id)
    is_owner_party = request.user.id in (transaction.payer_id, transaction.pitch_owner_id)
    if not is_owner_party and not getattr(request.user, "platform_admin", False):
        raise NotFound()  # don't reveal existence to unrelated users
    return transaction


class PaymentTransactionDetailView(views.APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, transaction_id):
        transaction = _get_own_or_admin_transaction(request, transaction_id)
        serializer_cls = (
            PaymentTransactionAdminSerializer
            if getattr(request.user, "platform_admin", False)
            else PaymentTransactionSerializer
        )
        return Response(serializer_cls(transaction).data)


class PaymentTransactionPollView(views.APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, transaction_id):
        transaction = _get_own_or_admin_transaction(request, transaction_id)
        transaction = check_pending_payment(transaction=transaction)
        return Response(PaymentTransactionSerializer(transaction).data)


class MyPaymentTransactionsView(views.APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        transactions = PaymentTransaction.objects.for_payer(request.user)
        return Response(PaymentTransactionSerializer(transactions, many=True).data)


class ReviewQueueView(views.APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    def get(self, request):
        from .choices import PaymentStatus

        transactions = PaymentTransaction.objects.filter(status=PaymentStatus.NEEDS_REVIEW)
        return Response(PaymentTransactionAdminSerializer(transactions, many=True).data)


class ResolveReviewView(views.APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    def post(self, request, transaction_id):
        transaction = get_object_or_404(PaymentTransaction, id=transaction_id)
        serializer = ResolveReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            transaction = resolve_needs_review(
                transaction=transaction, resolved_by=request.user, **serializer.validated_data
            )
        except PaymentServiceError as exc:
            raise ValidationError({"detail": str(exc)})
        return Response(PaymentTransactionAdminSerializer(transaction).data)


class PendingPaymentCompletionView(views.APIView):
    """GET /payment/transactions/pending-completion/ — polled by
    AppShell. Completely independent of pendingPayment/pendingSolo
    checks, which is the whole point: once a transaction is VERIFIED,
    those correctly stop returning it, but THIS popup must keep
    showing until the payer explicitly dismisses it.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        txn = get_pending_payment_completion_for_user(request.user)
        if not txn:
            return Response(None)
        return Response(get_payment_completion_payload(txn))


class AcknowledgePaymentCompletionView(views.APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, transaction_id):
        acknowledge_payment_completion(transaction_id=transaction_id, user=request.user)
        return Response({"status": "acknowledged"})


# ─────────────────────────────────────────────────────────────────────────────
# PITCH OWNER: "Payment Detail" table on the pitch page
# ─────────────────────────────────────────────────────────────────────────────

class OwnerPasswordThrottle(UserRateThrottle):
    """Rejecting a VERIFIED payment asks for the password, so guessing it must
    be slow even for someone holding a logged-in session."""
    scope = "payment_owner_password"
    rate = "5/min"


class PitchPaymentTransactionsView(views.APIView):
    """GET /payment/pitches/{pitch_id}/transactions/?status=all|verified|needs_review|rejected&page=1
    Only the pitch's owner (or a platform admin)."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pitch_id):
        from pitches.models import Pitch

        pitch = get_object_or_404(Pitch.objects.select_related("tenant"), id=pitch_id)
        is_admin = getattr(request.user, "platform_admin", False)
        if pitch.tenant.owner_id != request.user.id and not is_admin:
            raise PermissionDenied("Only the pitch owner can see these payments.")

        try:
            page = int(request.query_params.get("page", 1))
        except (TypeError, ValueError):
            page = 1
        data = list_pitch_payments(
            pitch_id=pitch.id,
            status_filter=request.query_params.get("status", "all"),
            page=page,
        )
        data["results"] = OwnerPaymentRowSerializer(data["results"], many=True).data
        return Response(data)


def _owner_action_error_response(exc):
    """409 for 'this reference is already verified' (the UI shows a popup),
    404 unknown payment, 400 everything else."""
    if isinstance(exc, ReferenceAlreadyVerified):
        return Response(
            {"code": "reference_already_verified", "detail": str(exc), "reference_number": exc.reference_number},
            status=409,
        )
    if isinstance(exc, PaymentNotFound):
        return Response({"detail": "Payment not found."}, status=404)
    return Response({"detail": str(exc)}, status=400)


class OwnerReviewTransactionView(views.APIView):
    """POST /payment/transactions/{id}/owner-review/  {"action": "approve" | "reject"}
    For a payment that is waiting for review."""

    permission_classes = [IsAuthenticated]

    def post(self, request, transaction_id):
        serializer = OwnerReviewActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            transaction = owner_resolve_payment(
                transaction_id=transaction_id,
                owner=request.user,
                action=serializer.validated_data["action"],
            )
        except PaymentServiceError as exc:
            return _owner_action_error_response(exc)
        # re-read with the joins the row serializer needs (one query)
        transaction = (
            PaymentTransaction.objects
            .select_related("payer", "owner_bank_account", "team_booking_payment__request__team")
            .get(id=transaction.id)
        )
        return Response(OwnerPaymentRowSerializer(transaction).data)


class OwnerReverseVerifiedView(views.APIView):
    """POST /payment/transactions/{id}/owner-reject-verified/  {"password": "..."}
    VERIFIED -> REJECTED, only after the owner re-enters their own password."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [OwnerPasswordThrottle]

    def post(self, request, transaction_id):
        serializer = OwnerReverseVerifiedSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            transaction = owner_reverse_verified_payment(
                transaction_id=transaction_id,
                owner=request.user,
                password=serializer.validated_data["password"],
            )
        except InvalidOwnerPassword:
            return Response({"code": "invalid_password", "detail": "Incorrect password."}, status=403)
        except PaymentServiceError as exc:
            return _owner_action_error_response(exc)
        transaction = (
            PaymentTransaction.objects
            .select_related("payer", "owner_bank_account", "team_booking_payment__request__team")
            .get(id=transaction.id)
        )
        return Response(OwnerPaymentRowSerializer(transaction).data)


class MySavedSenderBanksView(views.APIView):
    """GET /payment/my-saved-banks/ -> {"banks": ["cbe", ...]}
    Banks for which we already remember this payer's account digits (kept after a
    successful payment), so the form does not have to ask for them again."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"banks": get_saved_sender_banks(request.user)})