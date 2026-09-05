"""Shared availability/hold logic used by both the normal booking
flow (views.py's create_booking_group) and team_booking's payment
phase. Kept separate from views.py so team_booking can import it
without pulling in DRF view machinery.
"""
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from .models import Booking, BookingStatus, Slot, SlotStatus


def _normalize(dt):
    """Accepts either a datetime (the normal case when called from
    bookings/views.py, where DRF's serializer already parsed the
    request body into datetime objects) or a string (the case when
    called from team_booking/services.py with data pulled back out
    of a JSONField — JSON has no native datetime type, so anything
    that round-trips through a saved TeamBookingRequest.selections
    column comes back as an ISO string, not a datetime).
    """
    if isinstance(dt, str):
        parsed = parse_datetime(dt)
        if parsed is None:
            raise ValueError(f"Could not parse datetime string: {dt!r}")
        dt = parsed
    if timezone.is_naive(dt):
        return timezone.make_aware(dt, timezone.get_current_timezone())
    return dt

def is_slot_available(pitch, start_dt, end_dt) -> bool:
    start_dt, end_dt = _normalize(start_dt), _normalize(end_dt)
    slot = Slot.objects.filter(pitch=pitch, start_dt=start_dt, end_dt=end_dt).first()
    if not slot:
        return True
    if slot.status == SlotStatus.BOOKED:
        return False
    if slot.status == SlotStatus.BLOCKED:
        return bool(slot.held_until) and timezone.now() >= slot.held_until
    return True


def hold_slots(pitch, selections, *, held_until, updated_by):
    """Marks each selection's Slot as BLOCKED with a hold expiry.
    Only ever called once we already know every slot is available
    (caller must check is_slot_available first for each one).
    """
    held = []
    for item in selections:
        start_dt, end_dt = _normalize(item["start_iso"]), _normalize(item["end_iso"])
        slot, _ = Slot.objects.get_or_create(
            pitch=pitch, start_dt=start_dt, end_dt=end_dt,
            defaults={"status": SlotStatus.AVAILABLE},
        )
        slot.status = SlotStatus.BLOCKED
        slot.held_until = held_until
        slot.updated_by = updated_by
        slot.save(update_fields=["status", "held_until", "updated_by", "updated_at"])
        held.append(slot)
    return held


def release_slots(pitch, selections):
    """Reverts held (not booked) slots back to AVAILABLE — used when
    a payment window times out with no booking finalized.
    """
    for item in selections:
        start_dt, end_dt = _normalize(item["start_iso"]), _normalize(item["end_iso"])
        Slot.objects.filter(
            pitch=pitch, start_dt=start_dt, end_dt=end_dt, status=SlotStatus.BLOCKED,
        ).update(status=SlotStatus.AVAILABLE, held_until=None)


def finalize_team_slots_as_booked(*, pitch, selections, player, booking_type, price_per_slot, notes, booking_code):
    """Creates real Booking rows and marks slots BOOKED — the team-
    booking equivalent of bookings/views.py's create_booking_group
    loop, reused so both paths produce identical data shapes.
    """
    created = []
    for item in selections:
        start_dt, end_dt = _normalize(item["start_iso"]), _normalize(item["end_iso"])
        slot, _ = Slot.objects.get_or_create(
            pitch=pitch, start_dt=start_dt, end_dt=end_dt,
            defaults={"status": SlotStatus.AVAILABLE},
        )
        slot.status = SlotStatus.BOOKED
        slot.held_until = None
        slot.updated_by = player
        slot.save(update_fields=["status", "held_until", "updated_by", "updated_at"])

        booking = Booking.objects.create(
            pitch=pitch, player=player, booking_type=booking_type,
            start_dt=start_dt, end_dt=end_dt, slot=slot,
            status=BookingStatus.CONFIRMED, total_price=price_per_slot,
            booking_code=booking_code, notes=notes,
        )
        created.append(booking)
    return created