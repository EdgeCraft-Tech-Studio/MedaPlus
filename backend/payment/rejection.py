"""
Everything about a pitch owner rejecting a VERIFIED payment:

  * the time rule        (can_owner_reject / reject_deadline)
  * making the booking that payment paid for FAIL (solo hold, team request, plain booking)
  * building + sending the notifications

Solo and team payments are each tied to exactly ONE target, so rejecting a
member's SOLO payment never touches his TEAM booking, and the other way round.
The team request is set to CANCELLED, never deleted: a delete would cascade
to the payment rows and erase the very record being rejected.
"""
import logging
from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from notification.choices import NotificationType
from notification.services import notify

from .choices import PaymentStatus
from .exceptions import PaymentValidationError

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# ERRORS
# ─────────────────────────────────────────────────────────────────────────────

class RejectionWindowClosed(PaymentValidationError):
    """The booking is too close / already started, so it can't be rejected any more."""


class RejectCodeInvalid(PaymentValidationError):
    """Wrong 5-digit code."""


class RejectCodeExpired(PaymentValidationError):
    """No valid code (expired, used, or never requested)."""


class RejectCodeLocked(PaymentValidationError):
    """Too many wrong codes."""


# ─────────────────────────────────────────────────────────────────────────────
# TIME RULE
# ─────────────────────────────────────────────────────────────────────────────

def rejection_hours() -> float:
    return float(getattr(settings, "REJECTION_ALLOWED_TIME", 1))


def _parse_dt(value):
    if isinstance(value, str):
        value = parse_datetime(value)
    if value is None:
        return None
    if timezone.is_naive(value):
        value = timezone.make_aware(value, timezone.get_current_timezone())
    return value


def booking_selections(transaction) -> list:
    """[{start_iso, end_iso}, ...] of what this ONE payment paid for."""
    if transaction.solo_booking_hold_id:
        return list(transaction.solo_booking_hold.selections or [])
    if transaction.team_booking_payment_id:
        return list(transaction.team_booking_payment.request.selections or [])
    if transaction.booking_id:
        b = transaction.booking
        return [{"start_iso": b.start_dt, "end_iso": b.end_dt}]
    return []


def booking_start_for(transaction):
    starts = [_parse_dt(s.get("start_iso")) for s in booking_selections(transaction)]
    starts = [s for s in starts if s is not None]
    return min(starts) if starts else None


def reject_deadline(transaction):
    start = booking_start_for(transaction)
    return None if start is None else start - timedelta(hours=rejection_hours())


def can_owner_reject(transaction, now=None) -> bool:
    if transaction.status != PaymentStatus.VERIFIED:
        return False
    deadline = reject_deadline(transaction)
    if deadline is None:
        return False
    return (now or timezone.now()) <= deadline


def window_closed_message() -> str:
    hours = rejection_hours()
    label = f"{hours:g} hour{'s' if hours != 1 else ''}"
    return (
        f"This payment can only be rejected up to {label} before the booking starts. "
        "That time has passed, so it can't be rejected any more."
    )


# ─────────────────────────────────────────────────────────────────────────────
# TEXT + NOTIFICATIONS
# ─────────────────────────────────────────────────────────────────────────────

def _fmt_time(dt) -> str:
    return dt.strftime("%I:%M %p").lstrip("0")


def format_when(selections: list) -> str:
    """'Mon, 12 Oct, 2:00 PM to 4:00 PM'"""
    spans = []
    for s in selections:
        start, end = _parse_dt(s.get("start_iso")), _parse_dt(s.get("end_iso"))
        if start and end:
            spans.append((timezone.localtime(start), timezone.localtime(end)))
    if not spans:
        return "the booked time"
    spans.sort()
    first, last = spans[0][0], spans[-1][1]
    day = first.strftime("%a, %d %b")
    if all(s[0].date() == first.date() for s in spans):
        return f"{day}, {_fmt_time(first)} to {_fmt_time(last)}"
    more = len(spans) - 1
    return f"{day}, {_fmt_time(first)} (+{more} more slot{'s' if more > 1 else ''})"


def _spec(recipient, ntype, title, body, data) -> dict:
    return {"recipient": recipient, "type": ntype, "title": title, "body": body, "data": data}


def send_rejection_notifications(specs: list) -> None:
    """Called AFTER the database work is committed. A notification problem must
    never undo or fail a rejection."""
    for s in specs:
        try:
            notify(
                recipient=s["recipient"],
                notification_type=s["type"],
                title=s["title"],
                body=s["body"],
                data=s["data"],
                send_push=True,
            )
        except Exception:
            logger.exception("Could not send rejection notification to %s", getattr(s["recipient"], "id", "?"))


# ─────────────────────────────────────────────────────────────────────────────
# FREEING THE PITCH
# ─────────────────────────────────────────────────────────────────────────────

def _cancel_bookings_by_code(pitch_id, booking_code) -> None:
    from bookings.models import Booking, BookingStatus

    if not booking_code:
        return
    for b in Booking.objects.select_for_update().filter(
        pitch_id=pitch_id, booking_code=booking_code
    ).exclude(status=BookingStatus.CANCELLED):
        b.status = BookingStatus.CANCELLED
        b.save(update_fields=["status"])


def _free_booked_slots(pitch_id, selections: list) -> None:
    """BOOKED slot -> AVAILABLE, but only when no other live booking still uses it."""
    from bookings.models import Booking, BookingStatus, Slot, SlotStatus

    for sel in selections:
        start, end = _parse_dt(sel.get("start_iso")), _parse_dt(sel.get("end_iso"))
        if not start or not end:
            continue
        slot = (
            Slot.objects.select_for_update()
            .filter(pitch_id=pitch_id, start_dt=start, end_dt=end, status=SlotStatus.BOOKED)
            .first()
        )
        if slot is None:
            continue
        if Booking.objects.filter(slot=slot).exclude(status=BookingStatus.CANCELLED).exists():
            continue
        slot.status = SlotStatus.AVAILABLE
        slot.held_until = None
        slot.save(update_fields=["status", "held_until", "updated_at"])


# ─────────────────────────────────────────────────────────────────────────────
# CANCEL THE BOOKING (runs inside the same db transaction as the rejection)
# ─────────────────────────────────────────────────────────────────────────────

def _cancel_solo(transaction) -> list:
    from bookings.availability import release_slots
    from bookings.models import SoloBookingHold, SoloBookingStatus

    hold = SoloBookingHold.objects.select_for_update(of=("self",)).select_related("pitch").get(
        pk=transaction.solo_booking_hold_id
    )
    pitch = hold.pitch
    if hold.status != SoloBookingStatus.CANCELLED:
        if hold.status == SoloBookingStatus.PAYMENT_PENDING:
            release_slots(pitch, hold.selections)  # finalize never ran: slots are still held
        _cancel_bookings_by_code(pitch.id, hold.final_booking_code)
        _free_booked_slots(pitch.id, hold.selections)
        hold.status = SoloBookingStatus.CANCELLED
        hold.save(update_fields=["status", "updated_at"])

    body = (
        f"The pitch you booked, {pitch.name} for {format_when(hold.selections)}, was checked by "
        "the pitch owner and rejected. For more info contact the pitch owner."
    )
    return [_spec(
        transaction.payer, NotificationType.PAYMENT_REJECTED, "Booking rejected", body,
        {"payment_transaction_id": str(transaction.id), "icon": "rejected"},
    )]


def _cancel_plain_booking(transaction) -> list:
    from bookings.models import BookingStatus

    booking = transaction.booking
    selections = booking_selections(transaction)
    if booking.status != BookingStatus.CANCELLED:
        booking.status = BookingStatus.CANCELLED
        booking.save(update_fields=["status"])
        _free_booked_slots(booking.pitch_id, selections)

    body = (
        f"The pitch you booked, {booking.pitch.name} for {format_when(selections)}, was checked by "
        "the pitch owner and rejected. For more info contact the pitch owner."
    )
    return [_spec(
        transaction.payer, NotificationType.PAYMENT_REJECTED, "Booking rejected", body,
        {"payment_transaction_id": str(transaction.id), "icon": "rejected"},
    )]


def _cancel_team(transaction) -> list:
    from bookings.availability import release_slots
    from pitches.models import Pitch
    from team_booking.models import (
        PaymentStatus as TeamPaymentStatus,
        TeamBookingPayment,
        TeamBookingRequest,
        TeamBookingRequestStatus,
    )
    from team_booking.services import _display_name, _get_outside_joiners

    req = (
        TeamBookingRequest.objects.select_for_update(of=("self",))
        .select_related("team", "created_by")
        .get(pk=transaction.team_booking_payment.request_id)
    )

    if req.status != TeamBookingRequestStatus.CANCELLED:
        try:
            pitch = Pitch.objects.get(id=req.pitch_id)
        except Pitch.DoesNotExist:
            pitch = None

        if pitch is not None:
            if req.final_booking_code:
                _cancel_bookings_by_code(pitch.id, req.final_booking_code)   # fully paid: real Booking rows exist
            else:
                release_slots(pitch, req.selections)                         # still paying: slots are only held
            _free_booked_slots(pitch.id, req.selections)

        req.status = TeamBookingRequestStatus.CANCELLED
        req.payment_timeout_needs_owner_action = False
        req.save(update_fields=["status", "payment_timeout_needs_owner_action", "updated_at"])

    when = format_when(req.selections)
    team_name, pitch_name = req.team.name, req.pitch_name
    payer = transaction.payer
    data = {
        "payment_transaction_id": str(transaction.id),
        "team_booking_request_id": str(req.id),
        "icon": "rejected",
    }

    # 1) the member whose payment was rejected
    specs = [_spec(
        payer, NotificationType.PAYMENT_REJECTED, "Payment rejected",
        f"Your team payment for team {team_name} for pitch {pitch_name} on {when} was rejected "
        "by the pitch owner. For more info contact the pitch owner.",
        data,
    )]
    notified = {payer.id}

    # 2) the team owner (creator of the booking)
    team_owner = req.created_by
    if team_owner is not None and team_owner.id not in notified:
        specs.append(_spec(
            team_owner, NotificationType.BOOKING_REJECTED, "Booking rejected",
            f"Booking for {pitch_name} with team {team_name} on {when} was rejected because the "
            f"payment of {_display_name(payer)} could not be verified. "
            "For more info contact the pitch owner.",
            data,
        ))
        notified.add(team_owner.id)

    # 3) every other person in this booking (members who paid / were asked to pay + outside players)
    others = [
        p.payer for p in TeamBookingPayment.objects.filter(request=req)
        .exclude(status=TeamPaymentStatus.EXCLUDED).select_related("payer")
    ]
    others += list(_get_outside_joiners(req))
    for member in others:
        if member is None or member.id in notified:
            continue
        specs.append(_spec(
            member, NotificationType.BOOKING_REJECTED, "Booking rejected",
            f"Booking for {pitch_name} with team {team_name} on {when} was rejected.",
            data,
        ))
        notified.add(member.id)
    return specs


def cancel_booking_for_rejected_payment(transaction) -> list:
    """Frees the pitch for what this ONE payment paid for and returns the
    notifications to send once the surrounding db transaction has committed."""
    if transaction.solo_booking_hold_id:
        return _cancel_solo(transaction)
    if transaction.team_booking_payment_id:
        return _cancel_team(transaction)
    if transaction.booking_id:
        return _cancel_plain_booking(transaction)
    return []