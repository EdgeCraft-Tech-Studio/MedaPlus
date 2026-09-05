from datetime import timedelta
from decimal import Decimal
import uuid
from rest_framework.exceptions import PermissionDenied

from django.db import transaction
from django.utils import timezone

from bookings.availability import finalize_team_slots_as_booked, hold_slots, is_slot_available, release_slots
from pitches.models import Pitch
from core.utils.choices import MembershipRole
from notification.choices import NotificationType
from notification.services import notify
from team.models import TeamMembership

from .models import (
    MemberConfirmationStatus,
    PaymentStatus,
    TeamBookingConfirmation,
    TeamBookingPayment,
    TeamBookingRequest,
    TeamBookingRequestStatus,
)

REQUEST_LIFETIME_MINUTES = 1

PAYMENT_LIFETIME_MINUTES = 10
PAYMENT_REMINDER_MINUTES = 5


def _format_selection_summary(selections: list) -> str:
    """Turns raw ISO selections into short notification copy, e.g.
    'Mon, 21 Jul, 6:00 PM (+2 more slots)'.
    """
    if not selections:
        return "the selected time"
    first = selections[0]
    count = len(selections)
    try:
        start = timezone.datetime.fromisoformat(first["start_iso"])
        label = timezone.localtime(start).strftime("%a, %d %b, %I:%M %p")
    except Exception:
        label = first.get("start_iso", "")
    if count == 1:
        return label
    return f"{label} (+{count - 1} more slot{'s' if count > 2 else ''})"


def _display_name(user) -> str:
    full = f"{getattr(user, 'first_name', '')} {getattr(user, 'last_name', '')}".strip()
    return full or getattr(user, "username", "A teammate")


@transaction.atomic
def create_team_booking_request(
    *,
    pitch_id: str,
    pitch_name: str,
    team,
    created_by,
    booking_type: str,
    selections: list,
    price_per_member,
    total_price,
    notes: str = "",
) -> TeamBookingRequest:
    """Called by the view when a team OWNER picks 'Team' in the
    booking popup and hits Confirm. Creates the request, a pending
    confirmation row per active member (owner auto-confirmed), and
    pushes a notification to every OTHER active member.
    """
    active_members = list(
        TeamMembership.objects.active_for_team(team).select_related("user")
    )

    booking_request = TeamBookingRequest.objects.create(
        pitch_id=str(pitch_id),
        pitch_name=pitch_name,
        team=team,
        created_by=created_by,
        booking_type=booking_type,
        selections=selections,
        notes=notes,
        price_per_member=price_per_member,
        total_price=total_price,
        member_count_at_creation=len(active_members) or 1,
        expires_at=timezone.now() + timedelta(minutes=REQUEST_LIFETIME_MINUTES),
    )

    when_label = _format_selection_summary(selections)

    for membership in active_members:
        confirmation = TeamBookingConfirmation.objects.create(
            request=booking_request,
            member=membership.user,
        )

        if membership.user_id == created_by.id:
            confirmation.mark_confirmed()
            continue

        notify(
            recipient=membership.user,
            notification_type=NotificationType.TEAM_BOOKING_REQUEST_RECEIVED,
            title=f"Game at {pitch_name}?",
            body=f"{team.name} has a game at {pitch_name} on {when_label}. Can you play?",
            data={
                "team_booking_request_id": str(booking_request.id),
                "team_id": str(team.id),
                "team_slug": team.slug,
                "pitch_id": str(pitch_id),
                "pitch_name": pitch_name,
                "when": when_label,
                "price_per_member": str(price_per_member),
                "expires_at": booking_request.expires_at.isoformat(),
            },
        )

    return booking_request


def confirm_booking_request(*, request_id, user) -> TeamBookingConfirmation:
    confirmation = TeamBookingConfirmation.objects.select_related(
        "request", "request__created_by"
    ).get(request_id=request_id, member=user)

    if confirmation.request.status == TeamBookingRequestStatus.PENDING and confirmation.request.is_expired:
        confirmation.request.mark_expired()

    if (
        confirmation.status == MemberConfirmationStatus.PENDING
        and confirmation.request.status == TeamBookingRequestStatus.PENDING
    ):
        confirmation.mark_confirmed()
        notify(
            recipient=confirmation.request.created_by,
            notification_type=NotificationType.TEAM_BOOKING_MEMBER_RESPONDED,
            title="Player confirmed",
            body=f"{_display_name(user)} confirmed for {confirmation.request.pitch_name}.",
            data={"team_booking_request_id": str(confirmation.request.id)},
            send_push=False,
        )

    return confirmation


def decline_booking_request(*, request_id, user) -> TeamBookingConfirmation:
    confirmation = TeamBookingConfirmation.objects.select_related(
        "request", "request__created_by"
    ).get(request_id=request_id, member=user)

    if confirmation.status == MemberConfirmationStatus.PENDING:
        confirmation.mark_declined()
        notify(
            recipient=confirmation.request.created_by,
            notification_type=NotificationType.TEAM_BOOKING_MEMBER_RESPONDED,
            title="Player can't make it",
            body=f"{_display_name(user)} can't play at {confirmation.request.pitch_name}.",
            data={"team_booking_request_id": str(confirmation.request.id)},
            send_push=False,
        )

    return confirmation


def get_pending_confirmation_for_user(user):
    """The single oldest still-open confirmation for this user, or
    None. This is exactly what AppShell polls to decide whether to
    show the mandatory blocking 'can you play?' modal — no separate
    notification-parsing needed, since this reads live DB state.
    """
    confirmation = (
        TeamBookingConfirmation.objects.select_related("request", "request__team")
        .filter(
            member=user,
            status=MemberConfirmationStatus.PENDING,
            request__status=TeamBookingRequestStatus.PENDING,
        )
        .order_by("created_at")
        .first()
    )

    if confirmation is None:
        return None

    if confirmation.request.is_expired:
        confirmation.request.mark_expired()
        return None

    return confirmation


def expire_stale_requests_and_notify_owners():
    """Sweeps requests whose 10-minute window passed, marks them
    EXPIRED, and sends the owner ONE summary notification: 'X of Y
    confirmed'. Run this periodically — see the management command
    below for a cron-friendly entry point, or wire it to Celery beat
    if you're already running Celery for FCM pushes.
    """
    stale = TeamBookingRequest.objects.expired_but_not_marked().select_related(
        "team", "created_by"
    )
    for booking_request in stale:
        booking_request.mark_expired()

        if booking_request.summary_sent:
            continue

        confirmed = booking_request.confirmations.filter(
            status=MemberConfirmationStatus.CONFIRMED
        ).count()
        total = booking_request.confirmations.count()

        notify(
            recipient=booking_request.created_by,
            notification_type=NotificationType.TEAM_BOOKING_SUMMARY,
            title="Booking response summary",
            body=f"{confirmed} of {total} teammates confirmed for {booking_request.pitch_name}.",
            data={
                "team_booking_request_id": str(booking_request.id),
                "confirmed_count": confirmed,
                "total_count": total,
            },
        )
        booking_request.summary_sent = True
        booking_request.save(update_fields=["summary_sent", "updated_at"])



def _all_members_responded(booking_request: TeamBookingRequest) -> bool:
    return not booking_request.confirmations.filter(
        status=MemberConfirmationStatus.PENDING
    ).exists()


def get_pending_owner_action(owner):
    """Polled by AppShell. Returns the ONE thing needing the owner's
    mandatory attention right now:
      - confirm_summary: EITHER the 20-min window closed, OR every
        member has already responded early (no reason to make the
        owner wait out a timer nobody is still using).
      - payment_timeout: the 10/5-min payment window closed with
        unpaid members left.
    Both auto-popup as soon as they're true — no waiting required.
    """
    payment_timeout_request = (
        TeamBookingRequest.objects.filter(
            created_by=owner,
            status=TeamBookingRequestStatus.PAYMENT_PENDING,
            payment_timeout_needs_owner_action=True,
        )
        .order_by("created_at")
        .first()
    )
    if payment_timeout_request:
        return _build_payment_timeout_payload(payment_timeout_request)

    # Early-detect: any PENDING request where everyone already
    # responded gets treated as ready immediately, not just once
    # expires_at passes.
    still_open = TeamBookingRequest.objects.filter(
        created_by=owner, status=TeamBookingRequestStatus.PENDING
    ).prefetch_related("confirmations")

    for booking_request in still_open:
        if booking_request.is_expired:
            booking_request.mark_expired()
            return _build_confirm_summary_payload(booking_request)
        if _all_members_responded(booking_request):
            booking_request.mark_expired()  # reuse the same downstream flow
            return _build_confirm_summary_payload(booking_request)

    summary_request = (
        TeamBookingRequest.objects.filter(
            created_by=owner,
            status=TeamBookingRequestStatus.EXPIRED,
            owner_action_taken=False,
        )
        .order_by("created_at")
        .first()
    )
    if summary_request:
        return _build_confirm_summary_payload(summary_request)

    return None

def _serialize_user(user):
    full = f"{getattr(user, 'first_name', '')} {getattr(user, 'last_name', '')}".strip()
    return {
        "id": str(user.id),
        "name": full or getattr(user, "username", "Player"),
        "profile_photo_url": getattr(user, "profile_photo_url", None),
    }

def _build_confirm_summary_payload(booking_request: TeamBookingRequest) -> dict:
    confirmations = booking_request.confirmations.select_related("member").exclude(
        member_id=booking_request.created_by_id
    )
    confirmed = [c for c in confirmations if c.status == MemberConfirmationStatus.CONFIRMED]
    declined = [c for c in confirmations if c.status != MemberConfirmationStatus.CONFIRMED]

    return {
        "type": "confirm_summary",
        "request_id": str(booking_request.id),
        "pitch_name": booking_request.pitch_name,
        "team_name": booking_request.team.name,
        "price_per_member": str(booking_request.price_per_member),
        "confirmed_count": len(confirmed) + 1,  # +1 for the owner
        "total_count": len(confirmations) + 1,
        "declined_members": [_serialize_user(c.member) for c in declined],
    }



def _build_payment_timeout_payload(booking_request: TeamBookingRequest) -> dict:
    latest_round = booking_request.payment_round
    unpaid = (
        booking_request.payments.select_related("payer")
        .filter(status=PaymentStatus.PENDING, round=latest_round)
        .exclude(payer_id=booking_request.created_by_id)
    )
    paid = (
        booking_request.payments.select_related("payer")
        .filter(status__in=[PaymentStatus.PAID, PaymentStatus.COVERED_BY_OWNER], round=latest_round)
    )
    return {
        "type": "payment_timeout",
        "request_id": str(booking_request.id),
        "pitch_name": booking_request.pitch_name,
        "team_name": booking_request.team.name,
        "price_per_member": str(booking_request.price_per_member),
        "unpaid_members": [_serialize_user(p.payer) for p in unpaid],
        "paid_count": paid.count(),
        "total_count": paid.count() + unpaid.count(),
    }


def get_team_owner_membership_or_raise(team, owner):
    membership = TeamMembership.objects.active_for_team(team).for_user(owner).first()
    if not membership or membership.role != MembershipRole.OWNER:
        raise PermissionDenied("Only this team's current owner can act on this booking.")
    return membership


@transaction.atomic
def resolve_payment_timeout(*, request_id, owner, action: str) -> dict:
    """Owner's action once the mandatory payment_timeout popup fires
    (payment window closed with unpaid members left). Four options:

      - remind:      re-hold the pitch for 5 MORE minutes, re-notify
                      ONLY the still-unpaid members with a fresh
                      countdown. Everyone who already paid is untouched.
      - cover:        owner pays the full remaining share for every
                      unpaid member; finalizes immediately.
      - recalculate:  unpaid members are excluded entirely; their
                      total owed amount is split across everyone who
                      DID pay, as a new top-up payment request (round+1),
                      with a fresh 10-minute window.
      - cancel:       whole request is deleted, pitch released, every
                      payer notified.
    """
    booking_request = TeamBookingRequest.objects.select_related("team").get(id=request_id)
    get_team_owner_membership_or_raise(booking_request.team, owner)

    if booking_request.status != TeamBookingRequestStatus.PAYMENT_PENDING:
        raise ValueError("This request is not in a payment-timeout state.")

    latest_round = booking_request.payment_round
    unpaid = booking_request.payments.filter(
        status=PaymentStatus.PENDING, round=latest_round
    ).exclude(is_owner=True)

    # ---------------- cancel ----------------
    if action == "cancel":
        try:
            pitch = Pitch.objects.get(id=booking_request.pitch_id)
            release_slots(pitch, booking_request.selections)
        except Pitch.DoesNotExist:
            pass

        team_name, pitch_name = booking_request.team.name, booking_request.pitch_name
        for payment in booking_request.payments.select_related("payer").exclude(is_owner=True):
            notify(
                recipient=payment.payer,
                notification_type=NotificationType.TEAM_BOOKING_SUMMARY,
                title="Booking cancelled",
                body=f"{team_name}'s game at {pitch_name} was cancelled by the owner.",
                data={"team_booking_request_id": str(booking_request.id)},
                send_push=False,
            )
        booking_request.delete()
        return {"unavailable": False, "cancelled": True}

    try:
        pitch = Pitch.objects.get(id=booking_request.pitch_id)
    except Pitch.DoesNotExist:
        raise ValueError("Pitch no longer exists.")

    def _check_available_or_mark_unavailable() -> bool:
        for item in booking_request.selections:
            if not is_slot_available(pitch, item["start_iso"], item["end_iso"]):
                booking_request.status = TeamBookingRequestStatus.UNAVAILABLE
                booking_request.payment_timeout_needs_owner_action = False
                booking_request.save(
                    update_fields=["status", "payment_timeout_needs_owner_action", "updated_at"]
                )
                return False
        return True

    # ---------------- remind (5-minute reminder round) ----------------
    if action == "remind":
        if not unpaid.exists():
            raise ValueError("Everyone has already paid.")
        if not _check_available_or_mark_unavailable():
            return {"unavailable": True, "pitch_id": booking_request.pitch_id}

        deadline = timezone.now() + timedelta(minutes=PAYMENT_REMINDER_MINUTES)
        hold_slots(pitch, booking_request.selections, held_until=deadline, updated_by=owner)

        booking_request.payment_expires_at = deadline
        booking_request.payment_timeout_needs_owner_action = False
        booking_request.save(
            update_fields=["payment_expires_at", "payment_timeout_needs_owner_action", "updated_at"]
        )

        for payment in unpaid.select_related("payer"):
            notify(
                recipient=payment.payer,
                notification_type=NotificationType.TEAM_BOOKING_PAYMENT_REQUEST,
                title="Final reminder — pay now",
                body=f"You still owe {payment.amount} Br for {booking_request.pitch_name}. You have 5 minutes before the slot is released.",
                data={
                    "team_booking_request_id": str(booking_request.id),
                    "payment_expires_at": deadline.isoformat(),
                },
            )
        return {"unavailable": False, "cancelled": False}

    # ---------------- cover ----------------
    if action == "cover":
        if not _check_available_or_mark_unavailable():
            return {"unavailable": True, "pitch_id": booking_request.pitch_id}

        extra_count = unpaid.count()
        for payment in unpaid:
            payment.mark_covered()
        if extra_count:
            owner_payment = booking_request.payments.get(is_owner=True, round=latest_round)
            owner_payment.amount = owner_payment.amount + (
                booking_request.price_per_member * extra_count
            )
            owner_payment.save(update_fields=["amount"])

        booking_request.payment_timeout_needs_owner_action = False
        booking_request.save(update_fields=["payment_timeout_needs_owner_action", "updated_at"])
        _finalize_booking(booking_request)
        return {"unavailable": False, "cancelled": False, "booking_code": booking_request.final_booking_code}

    # ---------------- recalculate ----------------
    if action == "recalculate":
        if not unpaid.exists():
            raise ValueError("Everyone has already paid.")
        if not _check_available_or_mark_unavailable():
            return {"unavailable": True, "pitch_id": booking_request.pitch_id}

        paid_payments = list(
            booking_request.payments.filter(
                status__in=[PaymentStatus.PAID, PaymentStatus.COVERED_BY_OWNER], round=latest_round
            ).select_related("payer")
        )
        if not paid_payments:
            raise ValueError("No one has paid yet — nothing to recalculate against.")

        unpaid_total = booking_request.price_per_member * unpaid.count()
        top_up = (unpaid_total / len(paid_payments)).quantize(Decimal("0.01"))

        unpaid.update(status=PaymentStatus.EXCLUDED)

        deadline = timezone.now() + timedelta(minutes=PAYMENT_LIFETIME_MINUTES)
        hold_slots(pitch, booking_request.selections, held_until=deadline, updated_by=owner)

        new_round = latest_round + 1
        booking_request.payment_expires_at = deadline
        booking_request.payment_round = new_round
        booking_request.payment_timeout_needs_owner_action = False
        booking_request.save(
            update_fields=[
                "payment_expires_at", "payment_round",
                "payment_timeout_needs_owner_action", "updated_at",
            ]
        )

        for payment in paid_payments:
            TeamBookingPayment.objects.create(
                request=booking_request, payer=payment.payer, is_owner=payment.is_owner,
                amount=top_up, round=new_round,
            )
            notify(
                recipient=payment.payer,
                notification_type=NotificationType.TEAM_BOOKING_PAYMENT_REQUEST,
                title="Extra payment needed",
                body=f"Some teammates couldn't pay, so your share for {booking_request.pitch_name} increased by {top_up} Br. You have 10 minutes.",
                data={
                    "team_booking_request_id": str(booking_request.id),
                    "payment_expires_at": deadline.isoformat(),
                },
            )
        return {"unavailable": False, "cancelled": False}

    raise ValueError("Invalid action.")




class ConfirmSummaryAction:
    COVER = "cover"
    RECALCULATE = "recalculate"
    OPEN_SLOT = "open_slot"
    CANCEL = "cancel"


@transaction.atomic
def resolve_confirm_summary(*, request_id, owner, action: str) -> dict:
    """Owner's action after the 20-min window closes, chosen from the
    (now non-mandatory, bell-triggered) summary popup:

      - cover:        owner pays extra for every declined/no-response member
      - recalculate:  price is redivided across only confirmed members
      - open_slot:    declined members' spots are simply left unpaid —
                       pitch books at a lower total, nobody covers them
      - cancel:       whole request is cancelled, no payment phase starts
    """
    booking_request = TeamBookingRequest.objects.select_related("team").get(id=request_id)

    membership = (
        TeamMembership.objects.active_for_team(booking_request.team).for_user(owner).first()
    )
    if not membership or membership.role != MembershipRole.OWNER:
        raise PermissionDenied("Only this team's current owner can act on this booking.")

    all_confirmed = not booking_request.confirmations.exclude(
        status=MemberConfirmationStatus.CONFIRMED
    ).exists()

    if booking_request.status == TeamBookingRequestStatus.PENDING and not all_confirmed:
        raise ValueError("Still waiting on responses — can't decide yet.")
    if booking_request.status not in (
        TeamBookingRequestStatus.PENDING,
        TeamBookingRequestStatus.EXPIRED,
    ):
        raise ValueError("This request is not awaiting a decision.")

    if action == ConfirmSummaryAction.CANCEL:
        team_name = booking_request.team.name
        pitch_name = booking_request.pitch_name
        request_id_str = str(booking_request.id)

        # Notify everyone BEFORE deleting — once the row is gone,
        # confirmations (and any FK-dependent data) cascade-delete
        # with it, so this must happen first.
        for confirmation in booking_request.confirmations.select_related("member").exclude(
            member_id=owner.id
        ):
            notify(
                recipient=confirmation.member,
                notification_type=NotificationType.TEAM_BOOKING_SUMMARY,
                title="Booking cancelled",
                body=f"{team_name}'s game at {pitch_name} was cancelled by the owner.",
                data={"team_booking_request_id": request_id_str},
                send_push=False,
            )

        # Hard delete — cancelled requests should disappear from the
        # owner's Team Update list entirely, not linger as a dead row.
        # TeamBookingConfirmation and TeamBookingPayment rows cascade
        # via on_delete=CASCADE on their `request` FK.
        booking_request.delete()

        return {"unavailable": False, "cancelled": True}

    try:
        pitch = Pitch.objects.get(id=booking_request.pitch_id)
    except Pitch.DoesNotExist:
        raise ValueError("Pitch no longer exists.")

    for item in booking_request.selections:
        if not is_slot_available(pitch, item["start_iso"], item["end_iso"]):
            booking_request.status = TeamBookingRequestStatus.UNAVAILABLE
            booking_request.owner_action_taken = True
            booking_request.save(update_fields=["status", "owner_action_taken", "updated_at"])
            return {"unavailable": True, "pitch_id": booking_request.pitch_id}

    now = timezone.now()
    payment_deadline = now + timedelta(minutes=10)
    hold_slots(pitch, booking_request.selections, held_until=payment_deadline, updated_by=owner)

    confirmations = booking_request.confirmations.select_related("member")
    confirmed_others = [
        c for c in confirmations
        if c.status == MemberConfirmationStatus.CONFIRMED and c.member_id != owner.id
    ]
    declined_or_pending = [
        c for c in confirmations
        if c.status != MemberConfirmationStatus.CONFIRMED and c.member_id != owner.id
    ]

    if action == ConfirmSummaryAction.RECALCULATE:
        payer_count = len(confirmed_others) + 1  # +1 owner, excludes declined entirely
        share = (booking_request.total_price / payer_count).quantize(Decimal("0.01"))
        owner_amount = share
        member_amount = share
    elif action == ConfirmSummaryAction.OPEN_SLOT:
        owner_amount = booking_request.price_per_member
        member_amount = booking_request.price_per_member
    else:  # COVER
        owner_amount = booking_request.price_per_member * (1 + len(declined_or_pending))
        member_amount = booking_request.price_per_member

    TeamBookingPayment.objects.create(
        request=booking_request, payer=owner, is_owner=True, amount=owner_amount,
    )
    for confirmation in confirmed_others:
        TeamBookingPayment.objects.create(
            request=booking_request, payer=confirmation.member, amount=member_amount,
        )

    booking_request.status = TeamBookingRequestStatus.PAYMENT_PENDING
    booking_request.owner_action_taken = True
    booking_request.payment_started_at = now
    booking_request.payment_expires_at = payment_deadline
    booking_request.save(
        update_fields=[
            "status", "owner_action_taken", "payment_started_at",
            "payment_expires_at", "updated_at",
        ]
    )

    when_label = _format_selection_summary(booking_request.selections)
    for confirmation in confirmed_others:
        notify(
            recipient=confirmation.member,
            notification_type=NotificationType.TEAM_BOOKING_PAYMENT_REQUEST,
            title="Time to pay",
            body=f"Pay {member_amount} Br for {booking_request.pitch_name} on {when_label}. You have 10 minutes.",
            data={
                "team_booking_request_id": str(booking_request.id),
                "payment_expires_at": payment_deadline.isoformat(),
            },
        )

    _mark_owner_paid_and_maybe_finalize(booking_request, owner)
    return {"unavailable": False, "cancelled": False}
# ======================================================================
# PHASE 3 — 10-minute payment window
# ======================================================================

def get_pending_payment_for_user(user):
    """Polled by AppShell for every user (not just owners) to drive
    the mandatory member payment popup with its countdown. Orders by
    round DESC so a top-up request (round 2+) takes priority over an
    already-resolved earlier round.
    """
    payment = (
        TeamBookingPayment.objects.select_related("request", "request__team")
        .filter(
            payer=user,
            status=PaymentStatus.PENDING,
            request__status=TeamBookingRequestStatus.PAYMENT_PENDING,
        )
        .exclude(is_owner=True)
        .order_by("-round", "created_at")
        .first()
    )
    if not payment:
        return None
    if payment.request.is_payment_expired:
        return None
    return payment



def _display_name(user) -> str:
    full = f"{getattr(user, 'first_name', '')} {getattr(user, 'last_name', '')}".strip()
    return full or getattr(user, "username", "A teammate")

@transaction.atomic
def pay_for_booking(*, request_id, user) -> TeamBookingPayment:
    """Stub payment — no real charge, just marks PAID. Swap the body
    of this function for real gateway integration later; everything
    downstream (notifications, finalize check) stays the same.

    STRICTLY rejects any attempt after the payment window has closed
    — even if the person is still staring at a countdown that reads
    0:00 client-side due to network lag, the SERVER's clock is what
    decides whether a payment counts, never the client's.
    """
    payment = (
        TeamBookingPayment.objects.select_related("request")
        .filter(request_id=request_id, payer=user, status=PaymentStatus.PENDING)
        .order_by("-round")
        .first()
    )
    if not payment:
        raise ValueError("No pending payment found for you on this booking.")

    if payment.request.status != TeamBookingRequestStatus.PAYMENT_PENDING:
        raise ValueError("This payment window is no longer open.")

    if payment.request.is_payment_expired:
        raise ValueError("The payment window has closed. You can no longer pay for this slot.")

    payment.mark_paid()
    notify(
        recipient=payment.request.created_by,
        notification_type=NotificationType.TEAM_BOOKING_PAYMENT_RECEIVED,
        title="Payment received",
        body=f"{_display_name(user)} paid for {payment.request.pitch_name}.",
        data={"team_booking_request_id": str(payment.request.id)},
        send_push=False,
    )
    _try_finalize_if_all_paid(payment.request)
    return payment


def _mark_owner_paid_and_maybe_finalize(booking_request: TeamBookingRequest, owner):
    owner_payment = booking_request.payments.get(payer=owner, is_owner=True)
    owner_payment.mark_paid()
    _try_finalize_if_all_paid(booking_request)


def _try_finalize_if_all_paid(booking_request: TeamBookingRequest):
    booking_request.refresh_from_db()
    if booking_request.status != TeamBookingRequestStatus.PAYMENT_PENDING:
        return
    still_pending = booking_request.payments.filter(status=PaymentStatus.PENDING).exists()
    if not still_pending:
        _finalize_booking(booking_request)


def _finalize_booking(booking_request: TeamBookingRequest):
    try:
        pitch = Pitch.objects.get(id=booking_request.pitch_id)
    except Pitch.DoesNotExist:
        return

    price_per_slot = booking_request.total_price / max(len(booking_request.selections), 1)
    booking_code = uuid.uuid4().hex[:8].upper()

    finalize_team_slots_as_booked(
        pitch=pitch,
        selections=booking_request.selections,
        player=booking_request.created_by,
        booking_type=booking_request.booking_type,
        price_per_slot=price_per_slot,
        notes=f"Team booking: {booking_request.team.name}",
        booking_code=booking_code,
    )

    booking_request.status = TeamBookingRequestStatus.BOOKED
    booking_request.final_booking_code = booking_code
    booking_request.save(update_fields=["status", "final_booking_code", "updated_at"])

    when_label = _format_selection_summary(booking_request.selections)
    recipients = {p.payer for p in booking_request.payments.select_related("payer")}
    for member in recipients:
        notify(
            recipient=member,
            notification_type=NotificationType.TEAM_BOOKING_PITCH_BOOKED,
            title="Pitch booked!",
            body=f"{booking_request.pitch_name} is booked for {when_label}. Code: {booking_code}",
            data={"team_booking_request_id": str(booking_request.id), "booking_code": booking_code},
        )



def sweep_payment_timeouts():
    """Companion sweep to expire_stale_requests_and_notify_owners —
    run on the same cron cadence. Any PAYMENT_PENDING request whose
    window passed with unpaid members left gets flagged for the
    owner's second mandatory popup; slots are released so the pitch
    becomes bookable again until the owner resolves it.
    """
    stale = TeamBookingRequest.objects.filter(
        status=TeamBookingRequestStatus.PAYMENT_PENDING,
        payment_expires_at__lte=timezone.now(),
        payment_timeout_needs_owner_action=False,
    ).select_related("team", "created_by")

    for booking_request in stale:
        still_unpaid = booking_request.payments.filter(status=PaymentStatus.PENDING).exists()
        if not still_unpaid:
            continue  # a race with _try_finalize_if_all_paid — nothing to do

        try:
            pitch = Pitch.objects.get(id=booking_request.pitch_id)
            release_slots(pitch, booking_request.selections)
        except Pitch.DoesNotExist:
            pass

        booking_request.payment_timeout_needs_owner_action = True
        booking_request.save(update_fields=["payment_timeout_needs_owner_action", "updated_at"])


# ======================================================================
# Anytime owner visibility — list every active team booking request,
# and live detail for one of them. Not tied to the 20-min expiry at
# all; the owner can open these the moment a request is created.
# ======================================================================

_ACTIVE_STATUSES = [
    TeamBookingRequestStatus.PENDING,
    TeamBookingRequestStatus.EXPIRED,
    TeamBookingRequestStatus.PAYMENT_PENDING,
]


def get_my_active_team_bookings(owner):
    """Every booking request for teams where THIS user is the
    CURRENT active owner — checked via live TeamMembership, not the
    `created_by` snapshot on the request. This matters if ownership
    is ever transferred: access always follows who owns the team
    right now, not who happened to click Confirm & Notify originally.
    """
    owned_team_ids = (
        TeamMembership.objects.active()
        .owners()
        .for_user(owner)
        .values_list("team_id", flat=True)
    )
    return (
        TeamBookingRequest.objects.filter(team_id__in=owned_team_ids, status__in=_ACTIVE_STATUSES)
        .select_related("team")
        .order_by("-created_at")
    )


def get_team_booking_live_detail(*, request_id, owner) -> TeamBookingRequest:
    """One request's full live state — confirmed/pending/declined
    member breakdown. Callable at ANY time, not just after expiry.

    Access control: the requesting user must be the CURRENT active
    OWNER of the specific team this request belongs to. This is a
    fresh membership check every call, not `created_by == owner` —
    so it stays correct even after an ownership transfer, and a
    regular member (not the owner) is correctly refused even if they
    somehow guess a valid request_id.
    """
    booking_request = TeamBookingRequest.objects.select_related("team").get(id=request_id)

    membership = (
        TeamMembership.objects.active_for_team(booking_request.team).for_user(owner).first()
    )
    if not membership or membership.role != MembershipRole.OWNER:
        raise PermissionDenied("Only this team's current owner can view its booking status.")

    if booking_request.status == TeamBookingRequestStatus.PENDING and booking_request.is_expired:
        booking_request.mark_expired()
    return booking_request



# ======================================================================
# Member-side lookups for clicking "View" on a notification, even
# after the relevant window has closed. Unlike get_pending_*_for_user
# (which only returns something while a response is still allowed),
# these ALWAYS return the row if it exists, plus a can_respond /
# can_pay flag so the frontend can render a disabled, read-only view.
# ======================================================================

def get_my_confirmation_detail(*, request_id, user):
    confirmation = TeamBookingConfirmation.objects.select_related(
        "request", "request__team"
    ).get(request_id=request_id, member=user)

    if confirmation.request.status == TeamBookingRequestStatus.PENDING and confirmation.request.is_expired:
        confirmation.request.mark_expired()

    can_respond = (
        confirmation.status == MemberConfirmationStatus.PENDING
        and confirmation.request.status == TeamBookingRequestStatus.PENDING
    )
    return confirmation, can_respond


def get_my_payment_detail(*, request_id, user):
    payment = (
        TeamBookingPayment.objects.select_related("request", "request__team")
        .filter(request_id=request_id, payer=user)
        .order_by("-round")
        .first()
    )
    if payment is None:
        raise TeamBookingPayment.DoesNotExist()

    can_pay = (
        payment.status == PaymentStatus.PENDING
        and payment.request.status == TeamBookingRequestStatus.PAYMENT_PENDING
        and not payment.request.is_payment_expired
    )
    return payment, can_pay




def get_booked_summary_for_user(*, request_id, user):
    """Called when ANYONE involved in a booking (owner, admin, or any
    member who confirmed/paid) clicks 'View' on their 'Pitch booked!'
    notification. Returns different detail depending on role:
      - regular member: just a paid_count number
      - team OWNER or ADMIN: full list of who actually paid, by name
    """
    booking_request = TeamBookingRequest.objects.select_related("team").get(id=request_id)

    involved = (
        booking_request.confirmations.filter(member=user).exists()
        or booking_request.payments.filter(payer=user).exists()
    )
    if not involved:
        raise PermissionDenied("You are not part of this booking.")

    membership = TeamMembership.objects.active_for_team(booking_request.team).for_user(user).first()
    is_owner_or_admin = bool(
        membership and membership.role in (MembershipRole.OWNER, MembershipRole.ADMIN)
    )

    latest_round = booking_request.payment_round
    paid_qs = booking_request.payments.select_related("payer").filter(
        round=latest_round, status__in=[PaymentStatus.PAID, PaymentStatus.COVERED_BY_OWNER]
    )
    total_qs = booking_request.payments.filter(round=latest_round)

    return {
        "booking_request": booking_request,
        "is_owner_or_admin": is_owner_or_admin,
        "paid_count": paid_qs.count(),
        "total_count": total_qs.count(),
        "paid_members": [_serialize_user(p.payer) for p in paid_qs] if is_owner_or_admin else [],
    }