import random
import string
from decimal import Decimal

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from accounts.models.user import UserRole
from pitches.models import Pitch, BookingType
from .models import Slot, SlotStatus, Booking, BookingStatus
from .serializers import BookingCreateSerializer


def _is_player(user):
    return user.is_authenticated and user.role == UserRole.PLAYER


def _is_owner(user):
    return user.is_authenticated and user.role == UserRole.OWNER


def _is_admin(user):
    return user.is_authenticated and user.role == UserRole.ADMIN


def _can_manage_pitch(user, pitch: Pitch) -> bool:
    if _is_admin(user):
        return True
    if _is_owner(user) and hasattr(user, "tenant") and pitch.tenant_id == user.tenant.id:
        return True
    return False


def _can_book_pitch(user, pitch: Pitch) -> bool:
    if _is_player(user):
        return pitch.is_active and pitch.is_approved and pitch.tenant.is_active and pitch.tenant.is_approved
    return _can_manage_pitch(user, pitch)


def _generate_booking_code(length=8):
    chars = string.ascii_uppercase + string.digits
    return "".join(random.choice(chars) for _ in range(length))


@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    return Response({"ok": True, "service": "bookings"})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_booking_group(request):
    serializer = BookingCreateSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=400)

    data = serializer.validated_data
    pitch = get_object_or_404(Pitch, id=data["pitch_id"])

    if not _can_book_pitch(request.user, pitch):
        return Response({"detail": "Forbidden"}, status=403)

    booking_type = data["booking_type"]
    selections = data["selections"]
    notes = data.get("notes", "")
    manual_cash = data.get("manual_cash", False)
    booked_for_name = data.get("booked_for_name", "").strip()

    if manual_cash and _is_player(request.user):
        return Response({"detail": "Players cannot create manual cash bookings."}, status=403)

    if not selections:
        return Response({"detail": "At least one slot must be selected."}, status=400)

    price_per_slot = Decimal("0")
    if booking_type == BookingType.HOURLY:
        price_per_slot = pitch.hourly_price
    elif booking_type == BookingType.WEEKLY:
        price_per_slot = pitch.weekly_price
    elif booking_type == BookingType.MONTHLY:
        price_per_slot = pitch.monthly_price

    created = []
    booking_code = _generate_booking_code()

    for item in selections:
        start_dt = item["start_iso"]
        end_dt = item["end_iso"]

        if timezone.is_naive(start_dt):
            start_dt = timezone.make_aware(start_dt, timezone.get_current_timezone())
        if timezone.is_naive(end_dt):
            end_dt = timezone.make_aware(end_dt, timezone.get_current_timezone())

        if start_dt >= end_dt:
            return Response({"detail": "Invalid slot range."}, status=400)

        existing_slot = Slot.objects.filter(
            pitch=pitch,
            start_dt=start_dt,
            end_dt=end_dt,
        ).first()

        if existing_slot and existing_slot.status != SlotStatus.AVAILABLE:
            return Response(
                {"detail": f"Slot already unavailable: {start_dt.isoformat()}"},
                status=400,
            )

        slot = existing_slot
        if not slot:
            slot = Slot.objects.create(
                pitch=pitch,
                start_dt=start_dt,
                end_dt=end_dt,
                status=SlotStatus.AVAILABLE,
                updated_by=request.user,
            )

        slot.status = SlotStatus.BOOKED
        slot.updated_by = request.user
        slot.save()

        combined_notes = notes
        if booked_for_name:
            combined_notes = f"{combined_notes}\nBooked for: {booked_for_name}".strip()
        if manual_cash:
            combined_notes = f"{combined_notes}\nPayment: CASH / MANUAL".strip()

        booking = Booking.objects.create(
            pitch=pitch,
            player=request.user,
            booking_type=booking_type,
            start_dt=start_dt,
            end_dt=end_dt,
            slot=slot,
            status=BookingStatus.CONFIRMED,
            total_price=price_per_slot,
            booking_code=booking_code,
            notes=combined_notes,
        )
        created.append(booking)

    total_amount = sum((b.total_price for b in created), Decimal("0"))

    return Response(
        {
            "booking_code": booking_code,
            "count": len(created),
            "total_amount": str(total_amount),
            "manual_cash": manual_cash,
            "booked_for_name": booked_for_name,
            "bookings": [
                {
                    "id": str(b.id),
                    "start_iso": b.start_dt.isoformat(),
                    "end_iso": b.end_dt.isoformat(),
                    "price": str(b.total_price),
                    "notes": b.notes,
                }
                for b in created
            ],
        },
        status=status.HTTP_201_CREATED,
    )
