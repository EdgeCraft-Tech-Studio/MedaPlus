from datetime import datetime, time, timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from accounts.models import UserRole
from bookings.models import Slot, SlotStatus
from .models import Tenant, Pitch, PitchImage
from .serializers import PitchSerializer, PitchCreateSerializer, PitchUpdateSerializer

from collections import defaultdict
from django.shortcuts import get_object_or_404

User = get_user_model()


def is_admin(u) -> bool:
    return u.is_authenticated and u.role == UserRole.ADMIN


def is_owner(u) -> bool:
    return u.is_authenticated and u.role == UserRole.OWNER

def _can_view_pitch(user, pitch: Pitch) -> bool:
    if is_admin(user):
        return True
    if is_owner(user) and hasattr(user, "tenant") and pitch.tenant_id == user.tenant.id:
        return True
    return pitch.is_active and pitch.is_approved and pitch.tenant.is_active and pitch.tenant.is_approved

def _can_edit_pitch(user, pitch: Pitch) -> bool:
    if is_admin(user):
        return True
    if is_owner(user) and hasattr(user, "tenant") and pitch.tenant_id == user.tenant.id:
        return True
    return False

def _build_day_slots(pitch: Pitch, day_date):
    tz = timezone.get_current_timezone()
    now_local = timezone.localtime()

    start_hour = pitch.opening_time.hour
    end_hour = pitch.closing_time.hour

    day_start = timezone.make_aware(datetime.combine(day_date, time(hour=start_hour)), tz)
    day_end = timezone.make_aware(datetime.combine(day_date, time(hour=end_hour)), tz)

    existing_slots = Slot.objects.filter(
        pitch=pitch,
        start_dt__gte=day_start,
        start_dt__lt=day_end,
    ).order_by("start_dt")

    slot_map = {}
    for s in existing_slots:
        slot_map[s.start_dt] = s

    slots = []
    for hour in range(start_hour, end_hour):
        start_dt = timezone.make_aware(datetime.combine(day_date, time(hour=hour)), tz)
        end_dt = start_dt + timedelta(hours=1)

        existing = slot_map.get(start_dt)
        status_value = SlotStatus.AVAILABLE
        if existing:
            status_value = existing.status

        is_past = start_dt <= now_local
        is_available = (status_value == SlotStatus.AVAILABLE) and not is_past

        slots.append({
            "key": start_dt.isoformat(),
            "slot_id": str(existing.id) if existing else None,
            "start_iso": start_dt.isoformat(),
            "end_iso": end_dt.isoformat(),
            "label": f"{start_dt.strftime('%I:%M %p')} - {end_dt.strftime('%I:%M %p')}",
            "hour": hour,
            "status": "PAST" if is_past else status_value,
            "is_available": is_available,
        })

    return {
        "date": day_date.isoformat(),
        "weekday": day_date.strftime("%A"),
        "weekday_short": day_date.strftime("%a"),
        "display_date": day_date.strftime("%d %b"),
        "slots": slots,
    }


def _build_next_7_days(pitch: Pitch):
    today = timezone.localdate()
    return [_build_day_slots(pitch, today + timedelta(days=i)) for i in range(7)]


def _build_monthly_weeks(pitch: Pitch):
    today = timezone.localdate()
    weeks = []
    for week_index in range(4):
        start_date = today + timedelta(days=week_index * 7)
        week_days = [_build_day_slots(pitch, start_date + timedelta(days=i)) for i in range(7)]
        weeks.append({
            "week_index": week_index + 1,
            "days": week_days,
        })
    return weeks

@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    return Response({"ok": True, "service": "pitches"})


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def pitches_list_create(request):
    u = request.user

    # ------------------------
    # LIST
    # ------------------------
    if request.method == "GET":
        if is_admin(u):
            qs = Pitch.objects.all().order_by("-created_at")

        elif is_owner(u):
            tenant, _ = Tenant.objects.get_or_create(
                owner=u,
                defaults={
                    "name": f"{u.username}'s Business",
                    "is_active": True,
                    "is_approved": bool(getattr(u, "is_approved", False)),
                },
            )
            qs = Pitch.objects.filter(tenant=tenant).order_by("-created_at")

        else:
            qs = Pitch.objects.filter(
                is_active=True,
                is_approved=True,
                tenant__is_active=True,
                tenant__is_approved=True,
            ).order_by("-created_at")

        return Response(
            {"pitches": PitchSerializer(qs, many=True, context={"request": request}).data}
        )

    # ------------------------
    # CREATE
    # ------------------------
    incoming = request.data.copy()

    slot_hours = request.data.getlist("slot_hours")
    if slot_hours:
        incoming.setlist("slot_hours", slot_hours)

    serializer = PitchCreateSerializer(data=incoming)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    images = request.FILES.getlist("images")
    if not images:
        return Response(
            {"images": ["At least one pitch image is required."]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    data = serializer.validated_data
    tenant = None

    if is_admin(u):
        tenant_id = data.get("tenant_id")
        owner_id = data.get("owner_id")

        if tenant_id:
            try:
                tenant = Tenant.objects.get(id=tenant_id)
            except Tenant.DoesNotExist:
                return Response({"detail": "Tenant not found"}, status=404)

        elif owner_id:
            try:
                owner_user = User.objects.get(id=owner_id)
            except User.DoesNotExist:
                return Response({"detail": "Owner not found."}, status=404)

            if owner_user.role != UserRole.OWNER:
                return Response({"detail": "Selected user is not an owner."}, status=400)

            tenant, _ = Tenant.objects.get_or_create(
                owner=owner_user,
                defaults={
                    "name": f"{owner_user.username}'s Business",
                    "is_active": True,
                    "is_approved": bool(getattr(owner_user, "is_approved", False)),
                },
            )

        else:
            return Response(
                {"detail": "Admin must provide tenant_id or owner_id."},
                status=400,
            )

    elif is_owner(u):
        tenant, _ = Tenant.objects.get_or_create(
            owner=u,
            defaults={
                "name": f"{u.username}'s Business",
                "is_active": True,
                "is_approved": bool(getattr(u, "is_approved", False)),
            },
        )

    else:
        return Response({"detail": "Forbidden"}, status=403)

    pitch = Pitch.objects.create(
        tenant=tenant,
        name=data["name"],
        address=data.get("address", ""),
        latitude=data["latitude"],
        longitude=data["longitude"],
        min_hours=data.get("min_hours", 1),
        allow_hourly=data.get("allow_hourly", True),
        allow_weekly=data.get("allow_weekly", False),
        allow_monthly=data.get("allow_monthly", False),
        hourly_price=data.get("hourly_price", 0),
        weekly_price=data.get("weekly_price", 0),
        monthly_price=data.get("monthly_price", 0),
        has_dressing_room=data.get("has_dressing_room", False),
        has_showers=data.get("has_showers", False),
        has_parking=data.get("has_parking", False),
        has_lighting=data.get("has_lighting", False),
        other_services=data.get("other_services", ""),
        opening_time=data["opening_time"],
        closing_time=data["closing_time"],
        is_approved=False,
        is_active=True,
    )

    for uploaded_file in images:
        PitchImage.objects.create(pitch=pitch, image=uploaded_file)

    slot_date = data.get("slot_date") or timezone.localdate()
    slot_hours = data.get("slot_hours") or []
    tz = timezone.get_current_timezone()

    for raw_h in slot_hours:
        h = int(raw_h)
        start_naive = datetime.combine(slot_date, time(hour=h, minute=0))
        end_naive = start_naive + timedelta(hours=1)

        start_dt = timezone.make_aware(start_naive, tz)
        end_dt = timezone.make_aware(end_naive, tz)

        Slot.objects.create(
            pitch=pitch,
            start_dt=start_dt,
            end_dt=end_dt,
            status=SlotStatus.AVAILABLE,
            updated_by=u,
        )

    return Response(
        {"pitch": PitchSerializer(pitch, context={"request": request}).data},
        status=status.HTTP_201_CREATED,
    )

@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def pitch_detail(request, pitch_id: str):
    pitch = get_object_or_404(Pitch, id=pitch_id)

    if request.method == "GET":
        if not _can_view_pitch(request.user, pitch):
            return Response({"detail": "Pitch not found."}, status=404)

        return Response({
            "pitch": PitchSerializer(pitch, context={"request": request}).data,
            "daily_weekly_days": _build_next_7_days(pitch),
            "monthly_weeks": _build_monthly_weeks(pitch),
        })

    # PATCH
    if not _can_edit_pitch(request.user, pitch):
        return Response({"detail": "Forbidden"}, status=403)

    serializer = PitchUpdateSerializer(data=request.data, partial=True)
    if not serializer.is_valid():
        return Response(serializer.errors, status=400)

    data = serializer.validated_data

    for field in [
        "name",
        "address",
        "latitude",
        "longitude",
        "opening_time",
        "closing_time",
        "min_hours",
        "allow_hourly",
        "allow_weekly",
        "allow_monthly",
        "hourly_price",
        "weekly_price",
        "monthly_price",
        "has_dressing_room",
        "has_showers",
        "has_parking",
        "has_lighting",
        "other_services",
    ]:
        if field in data:
            setattr(pitch, field, data[field])

    pitch.save()

    new_images = request.FILES.getlist("images")
    if new_images:
        pitch.images.all().delete()
        for uploaded_file in new_images:
            PitchImage.objects.create(pitch=pitch, image=uploaded_file)

    return Response({
        "pitch": PitchSerializer(pitch, context={"request": request}).data,
        "message": "Pitch updated successfully.",
    })

"""
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def pitch_detail(request, pitch_id: str):
    pitch = get_object_or_404(Pitch, id=pitch_id)

    if not _can_view_pitch(request.user, pitch):
        return Response({"detail": "Pitch not found."}, status=404)

    return Response({
        "pitch": PitchSerializer(pitch).data,
        "daily_weekly_days": _build_next_7_days(pitch),
        "monthly_weeks": _build_monthly_weeks(pitch),
    })
"""

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_pending_pitches(request):
    if not is_admin(request.user):
        return Response({"detail": "Forbidden"}, status=403)

    qs = Pitch.objects.filter(is_approved=False, is_active=True).order_by("-created_at")
    return Response(
        {"pending_pitches": PitchSerializer(qs, many=True, context={"request": request}).data}
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def admin_approve_pitch(request, pitch_id: str):
    if not is_admin(request.user):
        return Response({"detail": "Forbidden"}, status=403)

    try:
        pitch = Pitch.objects.get(id=pitch_id)
    except Pitch.DoesNotExist:
        return Response({"detail": "Pitch not found"}, status=404)

    if not pitch.tenant.is_approved:
        return Response({"detail": "Tenant is not approved yet"}, status=400)

    pitch.is_approved = True
    pitch.save()
    return Response({"ok": True, "pitch_id": str(pitch.id), "is_approved": pitch.is_approved})
