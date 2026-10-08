import uuid
from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied

from accounts.models.user import UserRole
from pitches.models import Pitch, BookingType

from .availability import hold_slots, is_slot_available, release_slots, finalize_team_slots_as_booked
from .models import SoloBookingHold, SoloBookingStatus

PAYMENT_LIFETIME_MINUTES = 5


def _generate_booking_code(length=8):
    import random, string
    chars = string.ascii_uppercase + string.digits
    return "".join(random.choice(chars) for _ in range(length))


@transaction.atomic
def create_solo_booking_hold(*, pitch: Pitch, player, booking_type: str, selections: list, notes: str = "") -> SoloBookingHold:
    """ONLY for PLAYER-role accounts — OWNER/ADMIN manual-cash
    bookings stay on the original instant-confirm path (unchanged,
    create_booking_group). A pitch owner can NEVER book a pitch
    (their own or anyone else's) through this payment flow — enforced
    here explicitly, not just inherited from elsewhere.
    """
    if player.role != UserRole.PLAYER:
        raise PermissionDenied("Only players can book a pitch this way.")

    if not pitch.is_active or not pitch.is_approved or not pitch.tenant.is_active or not pitch.tenant.is_approved:
        raise ValueError("This pitch isn't available for booking.")

    if not selections:
        raise ValueError("At least one slot must be selected.")

    price_per_slot = Decimal("0")
    if booking_type == BookingType.HOURLY:
        price_per_slot = pitch.hourly_price
    elif booking_type == BookingType.WEEKLY:
        price_per_slot = pitch.weekly_price
    elif booking_type == BookingType.MONTHLY:
        price_per_slot = pitch.monthly_price

    for item in selections:
        if not is_slot_available(pitch, item["start_iso"], item["end_iso"]):
            raise ValueError(f"Slot already unavailable: {item['start_iso']}")

    deadline = timezone.now() + timedelta(minutes=PAYMENT_LIFETIME_MINUTES)
    hold_slots(pitch, selections, held_until=deadline, updated_by=player)

    total_price = price_per_slot * len(selections)
    hold = SoloBookingHold.objects.create(
        pitch=pitch, player=player, booking_type=booking_type,
        selections=selections, notes=notes,
        price_per_slot=price_per_slot, total_price=total_price,
        status=SoloBookingStatus.PAYMENT_PENDING,
        payment_expires_at=deadline,
    )
    return hold


def finalize_solo_booking(*, hold_id) -> None:
    try:
        hold = SoloBookingHold.objects.select_related("pitch").get(
            id=hold_id, status=SoloBookingStatus.PAYMENT_PENDING
        )
    except SoloBookingHold.DoesNotExist:
        return

    booking_code = _generate_booking_code()
    finalize_team_slots_as_booked(
        pitch=hold.pitch,
        selections=hold.selections,
        player=hold.player,
        booking_type=hold.booking_type,
        price_per_slot=hold.price_per_slot,
        notes=hold.notes,
        booking_code=booking_code,
    )
    hold.status = SoloBookingStatus.BOOKED
    hold.final_booking_code = booking_code
    hold.save(update_fields=["status", "final_booking_code", "updated_at"])


def sweep_solo_booking_timeouts():
    """Same cron cadence as team_booking's sweep — releases slots held
    by an expired, never-paid solo booking so the pitch becomes
    bookable again.
    """
    stale = SoloBookingHold.objects.filter(
        status=SoloBookingStatus.PAYMENT_PENDING,
        payment_expires_at__lte=timezone.now(),
    )
    for hold in stale:
        release_slots(hold.pitch, hold.selections)
        hold.status = SoloBookingStatus.EXPIRED
        hold.save(update_fields=["status", "updated_at"])



def get_pending_solo_hold_for_user(user):
    """Mirrors team_booking's get_pending_payment_for_user — this is
    what AppShell polls so the mandatory solo-payment popup survives
    a page refresh, exactly like the team one already does.
    """
    hold = (
        SoloBookingHold.objects.select_related("pitch")
        .filter(player=user, status=SoloBookingStatus.PAYMENT_PENDING)
        .order_by("created_at")
        .first()
    )
    if not hold:
        return None
    if hold.is_payment_expired:
        return None
    return hold