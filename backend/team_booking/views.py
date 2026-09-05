from rest_framework import status, views
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.utils.choices import MembershipRole
from team.models import Team, TeamMembership

from .models import TeamBookingConfirmation, TeamBookingPayment, TeamBookingRequest
from .serializers import (
    ConfirmationDetailSerializer,
    PaymentDetailSerializer,
    PendingConfirmationSerializer,
    PendingPaymentSerializer,
    TeamBookingRequestCreateSerializer,
    TeamBookingRequestListItemSerializer,
    TeamBookingRequestLiveDetailSerializer,
)
from .services import (
    confirm_booking_request,
    create_team_booking_request,
    decline_booking_request,
    get_booked_summary_for_user,
    get_my_active_team_bookings,
    get_my_confirmation_detail,
    get_my_payment_detail,
    get_pending_confirmation_for_user,
    get_pending_owner_action,
    get_pending_payment_for_user,
    get_team_booking_live_detail,
    pay_for_booking,
    resolve_confirm_summary,
    resolve_payment_timeout,
)

class TeamBookingRequestCreateView(views.APIView):
    """POST /bookings/team-request/ — called from PitchDetail's popup
    once the owner picks a team and hits 'Confirm & Notify Team'.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        serializer = TeamBookingRequestCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            team = Team.objects.get(id=data["team_id"])
        except Team.DoesNotExist:
            raise NotFound("Team not found.")

        membership = (
            TeamMembership.objects.active_for_team(team).for_user(request.user).first()
        )
        if not membership or membership.role != MembershipRole.OWNER:
            raise PermissionDenied("Only the team owner can request a booking for this team.")

        booking_request = create_team_booking_request(
            pitch_id=data["pitch_id"],
            pitch_name=data.get("pitch_name") or "the pitch",
            team=team,
            created_by=request.user,
            booking_type=data["booking_type"],
            selections=data["selections"],
            notes=data.get("notes", ""),
            price_per_member=data["price_per_member"],
            total_price=data["total_price"],
        )

        return Response(
            {
                "message": f"Booking request sent to {team.name}.",
                "request_id": str(booking_request.id),
            },
            status=status.HTTP_201_CREATED,
        )


class PendingTeamBookingConfirmationView(views.APIView):
    """GET /bookings/team-request/pending-confirmation/ — polled by
    AppShell to decide whether to show the mandatory blocking modal.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        confirmation = get_pending_confirmation_for_user(request.user)
        if not confirmation:
            return Response(None)
        return Response(PendingConfirmationSerializer(confirmation).data)


class ConfirmTeamBookingView(views.APIView):
    """POST /bookings/team-request/{request_id}/confirm/"""

    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        try:
            confirmation = confirm_booking_request(
                request_id=kwargs["request_id"], user=request.user
            )
        except TeamBookingConfirmation.DoesNotExist:
            raise NotFound("Booking request not found.")
        return Response({"status": confirmation.status})


class DeclineTeamBookingView(views.APIView):
    """POST /bookings/team-request/{request_id}/decline/"""

    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        try:
            confirmation = decline_booking_request(
                request_id=kwargs["request_id"], user=request.user
            )
        except TeamBookingConfirmation.DoesNotExist:
            raise NotFound("Booking request not found.")
        return Response({"status": confirmation.status})


class PendingOwnerActionView(views.APIView):
    """GET /bookings/team-request/pending-owner-action/ — polled by
    every user; only ever returns something for someone who owns a
    team with a request needing their attention.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        action = get_pending_owner_action(request.user)
        return Response(action)


class ResolveConfirmSummaryView(views.APIView):
    """POST /bookings/team-request/{request_id}/resolve-confirm-summary/
    body: {"action": "cover" | "recalculate" | "open_slot" | "cancel"}
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        action = request.data.get("action")
        if action not in ("cover", "recalculate", "open_slot", "cancel"):
            return Response({"detail": "Invalid action."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            result = resolve_confirm_summary(
                request_id=kwargs["request_id"], owner=request.user, action=action
            )
        except ValueError as exc: 
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(result)

class PendingPaymentView(views.APIView):
    """GET /bookings/team-request/pending-payment/ — polled by every
    user to drive the mandatory member payment popup.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        payment = get_pending_payment_for_user(request.user)
        if not payment:
            return Response(None)
        return Response(PendingPaymentSerializer(payment).data)


class PayForBookingView(views.APIView):
    """POST /bookings/team-request/{request_id}/pay/"""
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        try:
            payment = pay_for_booking(request_id=kwargs["request_id"], user=request.user)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"status": payment.status})



    
class ResolvePaymentTimeoutView(views.APIView):
    """POST /bookings/team-request/{request_id}/resolve-payment-timeout/
    body: {"action": "remind" | "cover" | "recalculate" | "cancel"}
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        action = request.data.get("action")
        if action not in ("remind", "cover", "recalculate", "cancel"):
            return Response({"detail": "Invalid action."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            result = resolve_payment_timeout(
                request_id=kwargs["request_id"], owner=request.user, action=action
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(result)


class MyActiveTeamBookingsView(views.APIView):
    """GET /bookings/team-request/my-active/ — every active booking
    request the owner created, across all their teams. This is what
    the "Team Update" button opens now — available any time, not
    gated behind the 20-min window closing.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        requests = get_my_active_team_bookings(request.user)
        return Response(TeamBookingRequestListItemSerializer(requests, many=True).data)


class TeamBookingRequestLiveDetailView(views.APIView):
    """GET /bookings/team-request/{request_id}/live/ — full live
    breakdown for one request: who's confirmed, who's still pending,
    who declined. Callable anytime the owner wants to check in.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        try:
            booking_request = get_team_booking_live_detail(
                request_id=kwargs["request_id"], owner=request.user
            )
        except TeamBookingRequest.DoesNotExist:
            raise NotFound("Booking request not found.")
        return Response(TeamBookingRequestLiveDetailSerializer(booking_request).data)



class MyConfirmationDetailView(views.APIView):
    """GET /bookings/team-request/{request_id}/my-confirmation/
    Called when a member clicks "View" on a can-you-play notification
    — works whether or not the window is still open.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        try:
            confirmation, can_respond = get_my_confirmation_detail(
                request_id=kwargs["request_id"], user=request.user
            )
        except TeamBookingConfirmation.DoesNotExist:
            raise NotFound("Confirmation not found.")
        data = ConfirmationDetailSerializer(confirmation, context={"can_respond": can_respond}).data
        return Response(data)


class MyPaymentDetailView(views.APIView):
    """GET /bookings/team-request/{request_id}/my-payment/
    Called when a member clicks "View" on a payment-request
    notification — works whether or not the window is still open.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        try:
            payment, can_pay = get_my_payment_detail(
                request_id=kwargs["request_id"], user=request.user
            )
        except TeamBookingPayment.DoesNotExist:
            raise NotFound("Payment not found.")
        data = PaymentDetailSerializer(payment, context={"can_pay": can_pay}).data
        return Response(data)



class BookedPitchSummaryView(views.APIView):
    """GET /bookings/team-request/{request_id}/booked-summary/
    Called from the 'Pitch booked!' notification's View button.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        try:
            result = get_booked_summary_for_user(request_id=kwargs["request_id"], user=request.user)
        except TeamBookingRequest.DoesNotExist:
            raise NotFound("Booking not found.")

        br = result["booking_request"]
        return Response({
            "request_id": str(br.id),
            "pitch_name": br.pitch_name,
            "team_name": br.team.name,
            "selections": br.selections,
            "total_price": str(br.total_price),
            "final_booking_code": br.final_booking_code,
            "is_owner_or_admin": result["is_owner_or_admin"],
            "paid_count": result["paid_count"],
            "total_count": result["total_count"],
            "paid_members": result["paid_members"],
        })