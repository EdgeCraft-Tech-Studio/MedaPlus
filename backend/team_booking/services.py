from datetime import timedelta
from decimal import Decimal
import uuid
from rest_framework.exceptions import PermissionDenied

from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

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

REQUEST_LIFETIME_MINUTES = 30
PAYMENT_LIFETIME_MINUTES = 1
PAYMENT_REMINDER_MINUTES = 1


def _format_selection_summary(selections: list) -> str:
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


def _to_datetime(value):
    """selections values round-trip through a JSONField, so by the
    time we read them back they're plain ISO strings, not datetime
    objects — same fix as bookings/availability.py's _normalize.
    """
    if isinstance(value, str):
        parsed = parse_datetime(value)
        if parsed is None:
            raise ValueError(f"Invalid datetime value: {value}")
        value = parsed
    if timezone.is_naive(value):
        value = timezone.make_aware(value, timezone.get_current_timezone())
    return value


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
    """Still the single oldest open confirmation — the AUTO-POPUP
    trigger on every fresh page load. The frontend now closes this
    locally when dismissed and does NOT re-poll it into view again
    until the next real page mount, per the new non-mandatory design.
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
    """Polled by AppShell. Priority order:

      1. payment_success — everyone paid, booking finalized. Shown
         once, dismissible via its own 'Great!' button.
      2. pitch_unavailable — someone else booked this pitch/time
         while the request was still in confirmation/open-slots
         limbo (deliberately NOT held during those phases). Shown
         once, as its OWN distinct popup — never routed through the
         payment-timeout resolver, which is exactly the bug that was
         producing "This request is not in a payment-timeout state."
      3. payment_timeout — payment window closed with unpaid members
         left. MANDATORY, never dismissible.
      4. confirm_summary — 20-min window closed, or everyone already
         responded early. NOT mandatory anymore — frontend shows a
         close button and re-surfaces it on every fresh page mount
         as long as it's still true.
    """
    booked_request = (
        TeamBookingRequest.objects.filter(
            created_by=owner,
            status=TeamBookingRequestStatus.BOOKED,
            booked_popup_shown=False,
        )
        .select_related("team")
        .order_by("-updated_at")
        .first()
    )
    if booked_request:
        return _build_payment_success_payload(booked_request)

    unavailable_request = (
        TeamBookingRequest.objects.filter(
            created_by=owner,
            status=TeamBookingRequestStatus.UNAVAILABLE,
            booked_popup_shown=False,
        )
        .order_by("-updated_at")
        .first()
    )
    if unavailable_request:
        return {
            "type": "pitch_unavailable",
            "request_id": str(unavailable_request.id),
            "pitch_id": unavailable_request.pitch_id,
            "pitch_name": unavailable_request.pitch_name,
        }

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

    still_open = TeamBookingRequest.objects.filter(
        created_by=owner, status=TeamBookingRequestStatus.PENDING
    ).prefetch_related("confirmations")

    for booking_request in still_open:
        if booking_request.is_expired:
            booking_request.mark_expired()
            return _build_confirm_summary_payload(booking_request)
        if _all_members_responded(booking_request):
            booking_request.mark_expired()
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


def _is_open_slots_filled(booking_request: TeamBookingRequest) -> bool:
    if not booking_request.open_slot_match_id:
        return False
    match = booking_request.open_slot_match
    return match.confirmed_participant_count >= match.slots_needed


def _build_confirm_summary_payload(booking_request: TeamBookingRequest) -> dict:
    confirmations = booking_request.confirmations.select_related("member").exclude(
        member_id=booking_request.created_by_id
    )
    confirmed = [c for c in confirmations if c.status == MemberConfirmationStatus.CONFIRMED]
    declined = [c for c in confirmations if c.status != MemberConfirmationStatus.CONFIRMED]

    if _is_open_slots_filled(booking_request):
        declined = []

    return {
        "type": "confirm_summary",
        "request_id": str(booking_request.id),
        "team_id": str(booking_request.team_id),
        "pitch_id": booking_request.pitch_id,
        "pitch_name": booking_request.pitch_name,
        "team_name": booking_request.team.name,
        "price_per_member": str(booking_request.price_per_member),
        "selections": booking_request.selections,
        "confirmed_count": (len(confirmations) + 1) if not declined and confirmations else len(confirmed) + 1,
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
        "team_id": str(booking_request.team_id),
        "pitch_id": booking_request.pitch_id,
        "pitch_name": booking_request.pitch_name,
        "team_name": booking_request.team.name,
        "price_per_member": str(booking_request.price_per_member),
        "selections": booking_request.selections,
        "unpaid_members": [_serialize_user(p.payer) for p in unpaid],
        "paid_count": paid.count(),
        "total_count": paid.count() + unpaid.count(),
    }


def _build_payment_success_payload(booking_request: TeamBookingRequest) -> dict:
    latest = booking_request.payment_round
    payments = booking_request.payments.select_related("payer").filter(round=latest)
    paid = [p for p in payments if p.status in (PaymentStatus.PAID, PaymentStatus.COVERED_BY_OWNER)]
    outside_joiners = _get_outside_joiners(booking_request)

    paid_members = [_serialize_user(p.payer) for p in paid]
    for joiner in outside_joiners:
        entry = _serialize_user(joiner)
        entry["is_outside_player"] = True
        paid_members.append(entry)

    return {
        "type": "payment_success",
        "request_id": str(booking_request.id),
        "pitch_name": booking_request.pitch_name,
        "team_name": booking_request.team.name,
        "total_price": str(booking_request.total_price),
        "final_booking_code": booking_request.final_booking_code,
        "paid_members": paid_members,
        "total_count": payments.count() + len(outside_joiners),
    }


def acknowledge_booking_completion(*, request_id, owner) -> None:
    """Dismisses payment_success AND pitch_unavailable popups — both
    reuse this same one-time flag.
    """
    booking_request = TeamBookingRequest.objects.get(id=request_id, created_by=owner)
    booking_request.booked_popup_shown = True
    booking_request.save(update_fields=["booked_popup_shown"])


def get_team_owner_membership_or_raise(team, owner):
    membership = TeamMembership.objects.active_for_team(team).for_user(owner).first()
    if not membership or membership.role != MembershipRole.OWNER:
        raise PermissionDenied("Only this team's current owner can act on this booking.")
    return membership


@transaction.atomic
def resolve_payment_timeout(*, request_id, owner, action: str) -> dict:
    booking_request = TeamBookingRequest.objects.select_related("team").get(id=request_id)
    get_team_owner_membership_or_raise(booking_request.team, owner)

    if booking_request.status != TeamBookingRequestStatus.PAYMENT_PENDING:
        raise ValueError("This request is not in a payment-timeout state.")

    latest_round = booking_request.payment_round
    unpaid = booking_request.payments.filter(
        status=PaymentStatus.PENDING, round=latest_round
    ).exclude(is_owner=True)

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
                booking_request.owner_action_taken = True
                booking_request.save(
                    update_fields=[
                        "status", "payment_timeout_needs_owner_action",
                        "owner_action_taken", "updated_at",
                    ]
                )
                return False
        return True

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
            new_payment = TeamBookingPayment.objects.create(
                request=booking_request, payer=payment.payer, is_owner=payment.is_owner,
                amount=top_up, round=new_round,
            )

            if payment.is_owner:
                # The owner triggered this action themselves — auto-pay
                # their new top-up row immediately, the same way
                # resolve_confirm_summary already does via
                # _mark_owner_paid_and_maybe_finalize. Without this,
                # the owner would sit in PENDING and get funneled into
                # their OWN mandatory MemberPaymentPopup, which is
                # exactly the bug: they'd have to go dig it out of the
                # notification drawer instead of it being handled here.
                new_payment.mark_paid()
                notify(
                    recipient=payment.payer,
                    notification_type=NotificationType.TEAM_BOOKING_PAYMENT_RECEIVED,
                    title="Payment received",
                    body=f"You paid {top_up} Br for {booking_request.pitch_name}.",
                    data={"team_booking_request_id": str(booking_request.id)},
                    send_push=False,
                )
            else:
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

        _try_finalize_if_all_paid(booking_request)
        return {"unavailable": False, "cancelled": False}
    
    raise ValueError("Invalid action.")


class ConfirmSummaryAction:
    COVER = "cover"
    RECALCULATE = "recalculate"
    OPEN_SLOT = "open_slot"
    CANCEL = "cancel"


@transaction.atomic
def resolve_confirm_summary(*, request_id, owner, action: str) -> dict:
    booking_request = TeamBookingRequest.objects.select_related("team").get(id=request_id)

    membership = (
        TeamMembership.objects.active_for_team(booking_request.team).for_user(owner).first()
    )
    if not membership or membership.role != MembershipRole.OWNER:
        raise PermissionDenied("Only this team's current owner can act on this booking.")

    all_confirmed = not booking_request.confirmations.exclude(
        status=MemberConfirmationStatus.CONFIRMED
    ).exists()
    open_slots_filled = _is_open_slots_filled(booking_request)

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

        booking_request.delete()
        return {"unavailable": False, "cancelled": True}

    try:
        pitch = Pitch.objects.get(id=booking_request.pitch_id)
    except Pitch.DoesNotExist:
        raise ValueError("Pitch no longer exists.")

    # Availability is only CHECKED here — never held before this
    # exact moment. The pitch stays fully bookable by any other team
    # right up until this call, which is the first time hold_slots
    # is ever invoked for this request.
    for item in booking_request.selections:
        if not is_slot_available(pitch, item["start_iso"], item["end_iso"]):
            booking_request.status = TeamBookingRequestStatus.UNAVAILABLE
            booking_request.owner_action_taken = True
            booking_request.save(update_fields=["status", "owner_action_taken", "updated_at"])
            return {"unavailable": True, "pitch_id": booking_request.pitch_id}

    now = timezone.now()
    payment_deadline = now + timedelta(minutes=PAYMENT_LIFETIME_MINUTES)
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

    if open_slots_filled:
        # Gaps already covered by outside joiners — team pays exactly
        # its own confirmed share regardless of which action string
        # the frontend sent (the trophy screen always sends "cover").
        owner_amount = booking_request.price_per_member
        member_amount = booking_request.price_per_member
    elif action == ConfirmSummaryAction.RECALCULATE:
        payer_count = len(confirmed_others) + 1
        share = (booking_request.total_price / payer_count).quantize(Decimal("0.01"))
        owner_amount = share
        member_amount = share
    elif action == ConfirmSummaryAction.COVER:
        owner_amount = booking_request.price_per_member * (1 + len(declined_or_pending))
        member_amount = booking_request.price_per_member
    else:
        # "open_slot" must never reach here — the view rejects it, and
        # the frontend intercepts it before ever calling this endpoint.
        raise ValueError("Invalid action for this stage.")

    TeamBookingPayment.objects.create(
        request=booking_request, payer=owner, is_owner=True, amount=owner_amount,
    )
    for confirmation in confirmed_others:
        TeamBookingPayment.objects.create(
            request=booking_request, payer=confirmation.member, amount=member_amount,
        )

    # If gaps were filled by outside joiners (not team members), they
    # owe the exact same fixed share and pay in the SAME 10-minute
    # window as the team — never at join time. This is what actually
    # asks them to pay; joining a match only ever reserves a spot.
    outside_payers = []
    if open_slots_filled:
        outside_payers = _get_outside_joiners(booking_request)
        for joiner in outside_payers:
            TeamBookingPayment.objects.create(
                request=booking_request, payer=joiner, amount=member_amount,
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
    for joiner in outside_payers:
        notify(
            recipient=joiner,
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


def get_pending_payment_for_user(user):
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


@transaction.atomic
def pay_for_booking(*, request_id, user) -> TeamBookingPayment:
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

def _get_outside_joiners(booking_request: TeamBookingRequest):
    """Users who joined the linked open-slots Match but are NOT team
    members — they never get a TeamBookingPayment row (payment for
    match participants isn't built yet), but they still need to be
    counted and notified once the booking finalizes.
    """
    if not booking_request.open_slot_match_id:
        return []
    from match.models import MatchParticipant

    return [
        p.user
        for p in MatchParticipant.objects.active()
        .for_match(booking_request.open_slot_match)
        .select_related("user")
    ]


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
    outside_joiners = _get_outside_joiners(booking_request)
    recipients.update(outside_joiners)

    for member in recipients:
        notify(
            recipient=member,
            notification_type=NotificationType.TEAM_BOOKING_PITCH_BOOKED,
            title="Pitch booked!",
            body=f"{booking_request.pitch_name} is booked for {when_label}. Code: {booking_code}",
            data={"team_booking_request_id": str(booking_request.id), "booking_code": booking_code},
        )

def sweep_payment_timeouts():
    stale = TeamBookingRequest.objects.filter(
        status=TeamBookingRequestStatus.PAYMENT_PENDING,
        payment_expires_at__lte=timezone.now(),
        payment_timeout_needs_owner_action=False,
    ).select_related("team", "created_by")

    for booking_request in stale:
        still_unpaid = booking_request.payments.filter(status=PaymentStatus.PENDING).exists()
        if not still_unpaid:
            continue

        try:
            pitch = Pitch.objects.get(id=booking_request.pitch_id)
            release_slots(pitch, booking_request.selections)
        except Pitch.DoesNotExist:
            pass

        booking_request.payment_timeout_needs_owner_action = True
        booking_request.save(update_fields=["payment_timeout_needs_owner_action", "updated_at"])


def sweep_pitch_conflicts_and_notify_owners():
    """Because the pitch is deliberately NOT held during PENDING/
    EXPIRED/AWAITING_OPEN_SLOTS, another team can legitimately book
    the same pitch/time first while this request is still in
    progress. Catches that proactively and notifies the owner.
    """
    at_risk = TeamBookingRequest.objects.filter(
        status__in=[
            TeamBookingRequestStatus.PENDING,
            TeamBookingRequestStatus.EXPIRED,
            TeamBookingRequestStatus.AWAITING_OPEN_SLOTS,
        ]
    ).select_related("team", "created_by")

    for booking_request in at_risk:
        try:
            pitch = Pitch.objects.get(id=booking_request.pitch_id)
        except Pitch.DoesNotExist:
            continue

        still_available = all(
            is_slot_available(pitch, item["start_iso"], item["end_iso"])
            for item in booking_request.selections
        )
        if still_available:
            continue

        booking_request.status = TeamBookingRequestStatus.UNAVAILABLE
        booking_request.owner_action_taken = True
        booking_request.save(update_fields=["status", "owner_action_taken", "updated_at"])

        notify(
            recipient=booking_request.created_by,
            notification_type=NotificationType.TEAM_BOOKING_PITCH_UNAVAILABLE,
            title="Pitch booked by someone else",
            body=f"{booking_request.pitch_name} was booked by another team before you finished. Pick a new time or pitch.",
            data={
                "team_booking_request_id": str(booking_request.id),
                "pitch_id": booking_request.pitch_id,
            },
        )


_ACTIVE_STATUSES = [
    TeamBookingRequestStatus.PENDING,
    TeamBookingRequestStatus.EXPIRED,
    TeamBookingRequestStatus.AWAITING_OPEN_SLOTS,
    TeamBookingRequestStatus.PAYMENT_PENDING,
]


def get_my_active_team_bookings(owner):
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


def get_team_bookings_for_team(*, team_id, user):
    """Every booking relevant to this team's chat — in-progress ones
    plus finished/booked ones. Visible to ANY active team member, not
    just the owner. This is the one source that actually covers "in
    progress, nobody's specifically waiting on me right now" — which
    the other three discovery endpoints never cover for the owner
    (auto-confirmed, auto-paid) or for a member who already responded.
    Cancelled bookings are hard-deleted elsewhere in this file, so
    they never need filtering here — they simply don't exist anymore.
    """
    membership = (
        TeamMembership.objects.active().for_user(user).filter(team_id=team_id).first()
    )
    if not membership:
        raise PermissionDenied("Only active team members can view this team's bookings.")

    statuses = _ACTIVE_STATUSES + [TeamBookingRequestStatus.BOOKED]
    return (
        TeamBookingRequest.objects.filter(team_id=team_id, status__in=statuses)
        .select_related("team")
        .order_by("-created_at")
    )


def get_team_booking_live_detail(*, request_id, owner) -> TeamBookingRequest:
    booking_request = TeamBookingRequest.objects.select_related("team").get(id=request_id)

    membership = (
        TeamMembership.objects.active_for_team(booking_request.team).for_user(owner).first()
    )
    if not membership:
        raise PermissionDenied("Only active team members can view this booking's status.")

    if booking_request.status == TeamBookingRequestStatus.PENDING and booking_request.is_expired:
        booking_request.mark_expired()
    return booking_request


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
    booking_request = TeamBookingRequest.objects.select_related("team").get(id=request_id)

    outside_joiners = _get_outside_joiners(booking_request)
    is_outside_joiner = any(u.id == user.id for u in outside_joiners)

    involved = (
        booking_request.confirmations.filter(member=user).exists()
        or booking_request.payments.filter(payer=user).exists()
        or is_outside_joiner
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

    paid_members = []
    if is_owner_or_admin:
        paid_members = [_serialize_user(p.payer) for p in paid_qs]
        for joiner in outside_joiners:
            entry = _serialize_user(joiner)
            entry["is_outside_player"] = True
            paid_members.append(entry)

    return {
        "booking_request": booking_request,
        "is_owner_or_admin": is_owner_or_admin,
        "paid_count": paid_qs.count() + len(outside_joiners),
        "total_count": total_qs.count() + len(outside_joiners),
        "paid_members": paid_members,
    }


@transaction.atomic
def open_slots_for_declined_members(*, request_id, owner, description: str = "") -> dict:
    """Slot count and price are both computed server-side from real
    confirmation data — never trusted from the client. The pitch is
    deliberately NOT held here — see the module docstring above.
    """
    booking_request = TeamBookingRequest.objects.select_related("team").get(id=request_id)
    get_team_owner_membership_or_raise(booking_request.team, owner)

    if booking_request.status not in (
        TeamBookingRequestStatus.PENDING,
        TeamBookingRequestStatus.EXPIRED,
    ):
        raise ValueError("This request is not awaiting a decision.")

    all_confirmed = not booking_request.confirmations.exclude(
        status=MemberConfirmationStatus.CONFIRMED
    ).exists()
    if all_confirmed:
        raise ValueError("Everyone already confirmed — no need to open slots.")

    slots_needed = (
        booking_request.confirmations.exclude(member_id=booking_request.created_by_id)
        .exclude(status=MemberConfirmationStatus.CONFIRMED)
        .count()
    )
    if slots_needed <= 0:
        raise ValueError("No open slots to fill.")

    try:
        pitch = Pitch.objects.get(id=booking_request.pitch_id)
    except Pitch.DoesNotExist:
        raise ValueError("Pitch no longer exists.")

    if not booking_request.selections:
        raise ValueError("This booking has no time selected.")

    for item in booking_request.selections:
        if not is_slot_available(pitch, item["start_iso"], item["end_iso"]):
            booking_request.status = TeamBookingRequestStatus.UNAVAILABLE
            booking_request.owner_action_taken = True
            booking_request.save(update_fields=["status", "owner_action_taken", "updated_at"])
            return {"unavailable": True, "pitch_id": booking_request.pitch_id}

    first_selection = booking_request.selections[0]
    start_time = _to_datetime(first_selection["start_iso"])
    end_time = _to_datetime(first_selection["end_iso"])

    from match.exceptions import MatchServiceError
    from match.services import create_match as _create_open_slot_match

    try:
        match = _create_open_slot_match(
            creator_team=booking_request.team,
            created_by=owner,
            pitch=pitch,
            start_time=start_time,
            end_time=end_time,
            slots_needed=slots_needed,
            price_per_slot=booking_request.price_per_member,
            description=description,
        )
    except (MatchServiceError, ValueError) as exc:
        raise ValueError(str(exc))

    booking_request.open_slot_match = match
    booking_request.status = TeamBookingRequestStatus.AWAITING_OPEN_SLOTS
    booking_request.owner_action_taken = True
    booking_request.save(
        update_fields=["open_slot_match", "status", "owner_action_taken", "updated_at"]
    )

    return {"unavailable": False, "match_id": str(match.id), "slots_needed": slots_needed}


@transaction.atomic
def handle_open_slot_match_filled(booking_request: TeamBookingRequest) -> None:
    booking_request.refresh_from_db()
    if booking_request.status != TeamBookingRequestStatus.AWAITING_OPEN_SLOTS:
        return
    booking_request.status = TeamBookingRequestStatus.EXPIRED
    booking_request.owner_action_taken = False
    booking_request.save(update_fields=["status", "owner_action_taken", "updated_at"])


@transaction.atomic
def cover_remaining_open_slots_and_start_payment(*, request_id, owner) -> dict:
    """Owner's action from the Team Update live-detail screen while a
    request is AWAITING_OPEN_SLOTS and not yet fully joined: cancel
    the linked Match first (so no more outside players can join, and
    anyone already on a reserved/confirmed slot there is released —
    they were never charged anyway, since match-side payment isn't
    built yet), THEN start the normal payment window, with the owner
    covering exactly the slots nobody filled.
    """
    booking_request = TeamBookingRequest.objects.select_related("team", "open_slot_match").get(
        id=request_id
    )
    get_team_owner_membership_or_raise(booking_request.team, owner)

    if booking_request.status != TeamBookingRequestStatus.AWAITING_OPEN_SLOTS:
        raise ValueError("This request is not awaiting open slots.")

    match = booking_request.open_slot_match
    if not match:
        raise ValueError("No linked match found for this request.")

    filled = match.confirmed_participant_count
    remaining = max(match.slots_needed - filled, 0)

    # Disable the match FIRST — no new joins can land mid-transaction.
    from match.services import cancel_match as _cancel_open_slot_match

    _cancel_open_slot_match(match=match, cancelled_by=owner)

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
    payment_deadline = now + timedelta(minutes=PAYMENT_LIFETIME_MINUTES)
    hold_slots(pitch, booking_request.selections, held_until=payment_deadline, updated_by=owner)

    confirmed_others = [
        c for c in booking_request.confirmations.select_related("member")
        if c.status == MemberConfirmationStatus.CONFIRMED and c.member_id != owner.id
    ]

    owner_amount = booking_request.price_per_member * (1 + remaining)
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
    return {"unavailable": False, "covered_slots": remaining}