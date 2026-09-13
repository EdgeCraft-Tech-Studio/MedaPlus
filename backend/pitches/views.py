from datetime import datetime, time, timedelta
import json
from django.contrib.auth import get_user_model
from django.db.models.aggregates import Sum
from django.utils import timezone 
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from accounts.models.user import UserRole
from bookings.models import BookingStatus, Slot, SlotStatus
from .models import Tenant, Pitch, PitchImage
from .serializers import AlreadyBookedSlotSerializer, PitchSerializer, PitchCreateSerializer, PitchUpdateSerializer

from collections import defaultdict
from django.shortcuts import get_object_or_404
from bookings.models import Booking, Slot, SlotStatus
from decimal import Decimal

User = get_user_model()





def is_admin(u) -> bool:
    return u.is_authenticated and u.role == UserRole.ADMIN


def is_owner(u) -> bool:
    return u.is_authenticated and u.role == UserRole.OWNER


WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _monday_of(d):
    return d - timedelta(days=d.weekday())





def _hour_label(h, end_h):
    ref = timezone.localdate()
    start_str = datetime.combine(ref, time(hour=h)).strftime("%I:%M %p")
    end_str = "12:00 AM" if end_h == 24 else datetime.combine(ref, time(hour=end_h)).strftime("%I:%M %p")
    return f"{start_str} - {end_str}"


def _serialize_existing_bookings(pitch: Pitch, user):
    if not (is_admin(user) or (is_owner(user) and hasattr(user, "tenant") and pitch.tenant_id == user.tenant.id)):
        return []

    today = timezone.localdate()
    from_dt = timezone.make_aware(datetime.combine(today, time.min), timezone.get_current_timezone())
    to_dt = from_dt + timedelta(days=28)

    qs = Booking.objects.filter(
        pitch=pitch,
        start_dt__gte=from_dt,
        start_dt__lt=to_dt,
    ).order_by("start_dt")

    items = []
    for b in qs:
        items.append(
            {
                "id": str(b.id),
                "start_iso": b.start_dt.isoformat(),
                "end_iso": b.end_dt.isoformat(),
                "label": f"{timezone.localtime(b.start_dt).strftime('%a %d %b, %I:%M %p')} - {timezone.localtime(b.end_dt).strftime('%I:%M %p')}",
                "status": b.status,
                "booking_code": b.booking_code,
                "total_price": str(b.total_price),
                "booked_by": getattr(b.player, "username", "") if b.player_id else "",
                "notes": b.notes or "",
            }
        )
    return items


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


def _apply_already_booked_slots(request, pitch, actor):
    """Parses the 'already_booked_slots' form field (a JSON string, since
    this rides along with multipart form data) and marks each described
    hour range as BOOKED with the given name/phone attached. Returns an
    error Response if the payload is malformed or invalid, else None.

    Expected shape:
      [{"date": "2026-09-05", "start_hour": 8, "end_hour": 10,
        "name": "Abebe Kebede", "phone": "0911..."}, ...]
    """
    raw = request.data.get("already_booked_slots", "")
    if not raw:
        return None

    try:
        items = json.loads(raw)
    except (TypeError, ValueError):
        return Response({"already_booked_slots": ["Invalid format."]}, status=400)

    if not isinstance(items, list):
        return Response({"already_booked_slots": ["Expected a list."]}, status=400)

    serializer = AlreadyBookedSlotSerializer(data=items, many=True)
    if not serializer.is_valid():
        return Response({"already_booked_slots": serializer.errors}, status=400)

    tz = timezone.get_current_timezone()
    for item in serializer.validated_data:
        start_naive = datetime.combine(item["date"], time(hour=item["start_hour"]))
        if item["end_hour"] == 24:
            end_naive = datetime.combine(item["date"] + timedelta(days=1), time(hour=0))
        else:
            end_naive = datetime.combine(item["date"], time(hour=item["end_hour"]))

        start_dt = timezone.make_aware(start_naive, tz)
        end_dt = timezone.make_aware(end_naive, tz)

        Slot.objects.update_or_create(
            pitch=pitch,
            start_dt=start_dt,
            defaults={
                "end_dt": end_dt,
                "status": SlotStatus.BOOKED,
                "updated_by": actor,
                "manual_booked_name": item["name"],
                "manual_booked_phone": item.get("phone", ""),
            },
        )
    return None


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


def _merge_contiguous_bookings(bookings):
    """
    Merge bookings for the same pitch that run back-to-back into a single
    displayed range (e.g. 8:00-10:00 + 10:00-12:00 -> 8:00-12:00), while
    keeping bookings that have a gap between them separate
    (e.g. 8:00-10:00 and 11:00-12:00 stay as two entries).

    `bookings` must already be sorted by start_dt and belong to one pitch.
    Each merged group also collects the distinct "booked_by" names involved.
    """
    merged = []
    for b in bookings:
        booked_by = getattr(b.player, "username", "") if b.player_id else ""
        if merged and b.start_dt <= merged[-1]["end_dt"]:
            # Contiguous (or overlapping) with the previous booking on this pitch.
            last = merged[-1]
            if b.end_dt > last["end_dt"]:
                last["end_dt"] = b.end_dt
            if booked_by and booked_by not in last["booked_by_list"]:
                last["booked_by_list"].append(booked_by)
        else:
            merged.append({
                "start_dt": b.start_dt,
                "end_dt": b.end_dt,
                "booked_by_list": [booked_by] if booked_by else [],
            })
    return merged


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
        sport_type=data.get("sport_type", "FOOTBALL"),
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

    already_booked_error = _apply_already_booked_slots(request, pitch, u)
    if already_booked_error is not None:
        return already_booked_error

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

        return Response(
            {
                "pitch": PitchSerializer(pitch, context={"request": request}).data,
                "daily_weekly_days": _build_next_7_days(pitch),
                "monthly_weeks": _build_monthly_weeks(pitch),
                "existing_bookings": _serialize_existing_bookings(pitch, request.user),
            }
        )

    if not _can_edit_pitch(request.user, pitch):
        return Response({"detail": "Forbidden"}, status=403)

    serializer = PitchUpdateSerializer(data=request.data, partial=True)
    if not serializer.is_valid():
        return Response(serializer.errors, status=400)

    data = serializer.validated_data

    for field in [
        "name",
        "address",
        "sport_type",
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

    # ------------------------
    # IMAGES: surgical update, not wipe-and-replace
    # ------------------------
    # The frontend sends:
    #   - "removed_image_ids": ids of existing PitchImage rows the user removed
    #   - "images": newly picked files to add
    # Anything not mentioned in either list is left completely untouched.
    removed_image_ids = request.data.getlist("removed_image_ids")
    if removed_image_ids:
        pitch.images.filter(id__in=removed_image_ids).delete()

    new_images = request.FILES.getlist("images")
    for uploaded_file in new_images:
        PitchImage.objects.create(pitch=pitch, image=uploaded_file)

    already_booked_error = _apply_already_booked_slots(request, pitch, request.user)
    if already_booked_error is not None:
        return already_booked_error

    return Response(
        {
            "pitch": PitchSerializer(pitch, context={"request": request}).data,
            "message": "Pitch updated successfully.",
        }
    )


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


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def owner_dashboard_stats(request):
    u = request.user
    if not is_owner(u):
        return Response({"detail": "Forbidden"}, status=403)

    tenant, _ = Tenant.objects.get_or_create(
        owner=u,
        defaults={
            "name": f"{u.username}'s Business",
            "is_active": True,
            "is_approved": bool(getattr(u, "is_approved", False)),
        },
    )

    pitches = Pitch.objects.filter(tenant=tenant)

    total_revenue = Decimal("0")
    total_bookings = 0
    active_count = 0
    pending_count = 0
    pitch_stats = []

    tz = timezone.get_current_timezone()
    today = timezone.localdate()
    day_start = timezone.make_aware(datetime.combine(today, time.min), tz)
    day_end = day_start + timedelta(days=1)
    now = timezone.localtime()

    today_bookings = []
    today_free = []

    for p in pitches:
        bookings_qs = Booking.objects.filter(pitch=p, status=BookingStatus.CONFIRMED)
        p_revenue = bookings_qs.aggregate(total=Sum("total_price"))["total"] or Decimal("0")
        p_bookings = bookings_qs.count()

        total_revenue += p_revenue
        total_bookings += p_bookings

        if p.is_approved and p.is_active:
            active_count += 1
        elif not p.is_approved:
            pending_count += 1

        pitch_stats.append({
            "pitch_id": str(p.id),
            "name": p.name,
            "revenue": str(p_revenue),
            "bookings_count": p_bookings,
            "is_approved": p.is_approved,
            "is_active": p.is_active,
        })

        # Only bookable pitches make sense for "today's bookings" / "free" —
        # an unapproved or inactive pitch was never actually open for booking.
        if not (p.is_approved and p.is_active):
            continue

        # ---- Today's bookings for this pitch, merged when back-to-back ----
        todays_bookings_qs = Booking.objects.filter(
            pitch=p,
            status=BookingStatus.CONFIRMED,
            start_dt__lt=day_end,
            end_dt__gt=day_start,
        ).order_by("start_dt")

        merged = _merge_contiguous_bookings(list(todays_bookings_qs))

        for m in merged:
            start_local = timezone.localtime(m["start_dt"])
            end_local = timezone.localtime(m["end_dt"])
            today_bookings.append({
                "pitch_id": str(p.id),
                "pitch_name": p.name,
                "time_label": f"{start_local.strftime('%I:%M %p')} - {end_local.strftime('%I:%M %p')}",
                "start_iso": m["start_dt"].isoformat(),
                "end_iso": m["end_dt"].isoformat(),
                "booked_by": ", ".join(m["booked_by_list"]) if m["booked_by_list"] else "",
            })

        # ---- Free windows for this pitch today, inside opening hours ----
        # Skip pitches whose closing time has already passed today.
        open_dt = timezone.make_aware(datetime.combine(today, p.opening_time), tz)
        close_dt = timezone.make_aware(datetime.combine(today, p.closing_time), tz)

        if open_dt < close_dt and close_dt > now:
            cursor = max(open_dt, now)
            for m in merged:
                b_start = max(m["start_dt"], open_dt)
                b_end = min(m["end_dt"], close_dt)
                if b_start > cursor:
                    today_free.append({
                        "pitch_id": str(p.id),
                        "pitch_name": p.name,
                        "time_label": f"{timezone.localtime(cursor).strftime('%I:%M %p')} - {timezone.localtime(b_start).strftime('%I:%M %p')}",
                        "start_iso": cursor.isoformat(),
                        "end_iso": b_start.isoformat(),
                    })
                if b_end > cursor:
                    cursor = b_end
            if cursor < close_dt:
                today_free.append({
                    "pitch_id": str(p.id),
                    "pitch_name": p.name,
                    "time_label": f"{timezone.localtime(cursor).strftime('%I:%M %p')} - {timezone.localtime(close_dt).strftime('%I:%M %p')}",
                    "start_iso": cursor.isoformat(),
                    "end_iso": close_dt.isoformat(),
                })

    today_bookings.sort(key=lambda x: x["start_iso"])
    today_free.sort(key=lambda x: x["start_iso"])

    return Response({
        "total_pitches": pitches.count(),
        "active_pitches": active_count,
        "pending_pitches": pending_count,
        "total_revenue": str(total_revenue),
        "total_bookings": total_bookings,
        "pitch_stats": pitch_stats,
        "today_bookings": today_bookings,
        "today_free": today_free,
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def owner_pitch_detail_stats(request, pitch_id: str):
    pitch = get_object_or_404(Pitch, id=pitch_id)

    if not _can_edit_pitch(request.user, pitch):
        return Response({"detail": "Forbidden"}, status=403)

    now = timezone.now()
    today = timezone.localdate()

    week_start = today - timedelta(days=today.weekday())
    week_start_dt = timezone.make_aware(datetime.combine(week_start, time.min), timezone.get_current_timezone())

    month_start_dt = timezone.make_aware(datetime.combine(today.replace(day=1), time.min), timezone.get_current_timezone())
    year_start_dt = timezone.make_aware(datetime.combine(today.replace(month=1, day=1), time.min), timezone.get_current_timezone())

    def revenue_since(dt):
        return Booking.objects.filter(
            pitch=pitch, status=BookingStatus.CONFIRMED, start_dt__gte=dt
        ).aggregate(total=Sum("total_price"))["total"] or Decimal("0")

    def bookings_since(dt):
        return Booking.objects.filter(
            pitch=pitch, status=BookingStatus.CONFIRMED, start_dt__gte=dt
        ).count()

    all_bookings = Booking.objects.filter(pitch=pitch, status=BookingStatus.CONFIRMED)

    return Response({
        "pitch": PitchSerializer(pitch, context={"request": request}).data,
        "earnings_week": str(revenue_since(week_start_dt)),
        "earnings_month": str(revenue_since(month_start_dt)),
        "earnings_year": str(revenue_since(year_start_dt)),
        "bookings_1m": bookings_since(now - timedelta(days=30)),
        "bookings_3m": bookings_since(now - timedelta(days=90)),
        "bookings_6m": bookings_since(now - timedelta(days=180)),
        "bookings_1y": bookings_since(now - timedelta(days=365)),
        "total_bookings": all_bookings.count(),
        "total_earnings": str(all_bookings.aggregate(total=Sum("total_price"))["total"] or Decimal("0")),
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def owner_pitch_booking_history(request, pitch_id: str):
    """Paginated, newest-first booking history for one pitch — real
    in-app Booking rows plus manually-entered pre-platform bookings
    (Slots marked BOOKED with a manual_booked_name), unioned into one
    timeline so the owner can see both in one place, 10 per page.
    """
    pitch = get_object_or_404(Pitch, id=pitch_id)
    if not _can_edit_pitch(request.user, pitch):
        return Response({"detail": "Forbidden"}, status=403)

    try:
        page = max(int(request.query_params.get("page", 1)), 1)
    except ValueError:
        page = 1
    page_size = 10

    entries = []

    bookings_qs = Booking.objects.filter(pitch=pitch).select_related("player").order_by("-start_dt")
    for b in bookings_qs:
        player = b.player
        full_name = ""
        if player is not None:
            full_name = f"{getattr(player, 'first_name', '')} {getattr(player, 'last_name', '')}".strip()
        entries.append({
            "id": f"booking:{b.id}",
            "kind": "booking",
            "start_iso": b.start_dt.isoformat(),
            "end_iso": b.end_dt.isoformat(),
            "time_label": (
                f"{timezone.localtime(b.start_dt).strftime('%d %b %Y, %I:%M %p')} - "
                f"{timezone.localtime(b.end_dt).strftime('%I:%M %p')}"
            ),
            "booking_type": b.booking_type,
            "total_price": str(b.total_price),
            "status": b.status,
            "notes": b.notes or "",
            "booked_by": {
                "type": "individual",
                "name": full_name or (getattr(player, "username", "") if player else "Unknown"),
                "first_name": getattr(player, "first_name", "") if player else "",
                "last_name": getattr(player, "last_name", "") if player else "",
                "username": getattr(player, "username", "") if player else "",
                "email": (getattr(player, "email", "") or None) if player else None,
                "phone": (getattr(player, "phone", "") or None) if player else None,
            },
            "_sort": b.start_dt,
        })

    manual_qs = (
        Slot.objects.filter(pitch=pitch, status=SlotStatus.BOOKED)
        .exclude(manual_booked_name="")
        .order_by("-start_dt")
    )
    for s in manual_qs:
        entries.append({
            "id": f"slot:{s.id}",
            "kind": "manual",
            "start_iso": s.start_dt.isoformat(),
            "end_iso": s.end_dt.isoformat(),
            "time_label": (
                f"{timezone.localtime(s.start_dt).strftime('%d %b %Y, %I:%M %p')} - "
                f"{timezone.localtime(s.end_dt).strftime('%I:%M %p')}"
            ),
            "booking_type": None,
            "total_price": None,
            "status": "MANUAL",
            "notes": "",
            "booked_by": {
                "type": "manual",
                "name": s.manual_booked_name,
                "first_name": "",
                "last_name": "",
                "username": "",
                "email": None,
                "phone": s.manual_booked_phone or None,
            },
            "_sort": s.start_dt,
        })

    entries.sort(key=lambda e: e["_sort"], reverse=True)
    for e in entries:
        e.pop("_sort")

    total = len(entries)
    total_pages = max((total + page_size - 1) // page_size, 1)
    page = min(page, total_pages)
    start = (page - 1) * page_size
    page_items = entries[start:start + page_size]

    return Response({
        "results": page_items,
        "page": page,
        "total_pages": total_pages,
        "total_count": total,
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_platform_stats(request):
    if not is_admin(request.user):
        return Response({"detail": "Forbidden"}, status=403)

    owners_qs = User.objects.filter(role=UserRole.OWNER)
    total_owners = owners_qs.count()
    approved_owners = owners_qs.filter(is_approved=True).count()
    pending_owners = total_owners - approved_owners

    pitches_qs = Pitch.objects.all()
    total_pitches = pitches_qs.count()
    approved_pitches = pitches_qs.filter(is_approved=True).count()
    pending_pitches = total_pitches - approved_pitches
    active_pitches = pitches_qs.filter(is_active=True).count()
    football_pitches = pitches_qs.filter(sport_type="FOOTBALL").count()
    basketball_pitches = pitches_qs.filter(sport_type="BASKETBALL").count()

    confirmed_bookings = Booking.objects.filter(status=BookingStatus.CONFIRMED)
    total_bookings = confirmed_bookings.count()
    total_revenue = confirmed_bookings.aggregate(total=Sum("total_price"))["total"] or Decimal("0")

    pitch_stats = []
    for p in pitches_qs.select_related("tenant", "tenant__owner").order_by("-created_at"):
        p_bookings = Booking.objects.filter(pitch=p, status=BookingStatus.CONFIRMED)
        p_revenue = p_bookings.aggregate(total=Sum("total_price"))["total"] or Decimal("0")
        pitch_stats.append({
            "pitch_id": str(p.id),
            "name": p.name,
            "sport_type": p.sport_type,
            "owner_username": p.tenant.owner.username if p.tenant_id else "",
            "tenant_name": p.tenant.name if p.tenant_id else "",
            "revenue": str(p_revenue),
            "bookings_count": p_bookings.count(),
            "is_approved": p.is_approved,
            "is_active": p.is_active,
        })

    owner_stats = []
    for o in owners_qs.select_related("tenant"):
        tenant = getattr(o, "tenant", None)
        owner_pitches = Pitch.objects.filter(tenant=tenant) if tenant else Pitch.objects.none()
        o_bookings = Booking.objects.filter(pitch__in=owner_pitches, status=BookingStatus.CONFIRMED)
        o_revenue = o_bookings.aggregate(total=Sum("total_price"))["total"] or Decimal("0")
        owner_stats.append({
            "owner_id": str(o.id),
            "username": o.username,
            "email": getattr(o, "email", ""),
            "is_approved": bool(getattr(o, "is_approved", False)),
            "pitch_count": owner_pitches.count(),
            "revenue": str(o_revenue),
        })

    return Response({
        "total_owners": total_owners,
        "approved_owners": approved_owners,
        "pending_owners": pending_owners,
        "total_pitches": total_pitches,
        "approved_pitches": approved_pitches,
        "pending_pitches": pending_pitches,
        "active_pitches": active_pitches,
        "football_pitches": football_pitches,
        "basketball_pitches": basketball_pitches,
        "total_bookings": total_bookings,
        "total_revenue": str(total_revenue),
        "pitch_stats": pitch_stats,
        "owner_stats": owner_stats,
    })


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def admin_delete_pitch(request, pitch_id: str):
    if not is_admin(request.user):
        return Response({"detail": "Forbidden"}, status=403)
    try:
        pitch = Pitch.objects.get(id=pitch_id)
    except Pitch.DoesNotExist:
        return Response({"detail": "Pitch not found"}, status=404)
    pitch.delete()
    return Response({"ok": True})


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def admin_delete_owner(request, owner_id: str):
    if not is_admin(request.user):
        return Response({"detail": "Forbidden"}, status=403)
    try:
        owner = User.objects.get(id=owner_id, role=UserRole.OWNER)
    except User.DoesNotExist:
        return Response({"detail": "Owner not found"}, status=404)
    owner.delete()
    return Response({"ok": True})



@api_view(["GET"])
@permission_classes([IsAuthenticated])
def owner_pitch_weekly_grid(request, pitch_id: str):
    """Returns a booking grid for a pitch over an explicit date range:
    ?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD (both inclusive). If neither
    is given, defaults to the current Mon-Sun week. If only date_from is
    given, returns that single day. Also supports ?name=, ?start_hour=,
    ?end_hour= for filtering.
    """
    pitch = get_object_or_404(Pitch, id=pitch_id)
    if not _can_edit_pitch(request.user, pitch):
        return Response({"detail": "Forbidden"}, status=403)

    tz = timezone.get_current_timezone()

    date_from_raw = request.query_params.get("date_from")
    date_to_raw = request.query_params.get("date_to")

    if date_from_raw:
        try:
            date_from = datetime.strptime(date_from_raw, "%Y-%m-%d").date()
        except ValueError:
            return Response({"detail": "Invalid date_from."}, status=400)
    else:
        date_from = _monday_of(timezone.localdate())

    if date_to_raw:
        try:
            date_to = datetime.strptime(date_to_raw, "%Y-%m-%d").date()
        except ValueError:
            return Response({"detail": "Invalid date_to."}, status=400)
    else:
        # No explicit date_to: if the caller also didn't give date_from,
        # this is the "no filter at all" default -> show the full week.
        # If they DID give date_from but no date_to, they want that one
        # single day only.
        date_to = date_from if date_from_raw else date_from + timedelta(days=6)

    if date_to < date_from:
        date_from, date_to = date_to, date_from

    # Safety cap so a mistaken huge range can't blow up the grid/query.
    MAX_RANGE_DAYS = 31
    if (date_to - date_from).days > MAX_RANGE_DAYS - 1:
        date_to = date_from + timedelta(days=MAX_RANGE_DAYS - 1)

    range_start_dt = timezone.make_aware(datetime.combine(date_from, time.min), tz)
    range_end_dt = timezone.make_aware(datetime.combine(date_to + timedelta(days=1), time.min), tz)

    name_filter = (request.query_params.get("name") or "").strip().lower()

    try:
        min_hour = int(request.query_params.get("start_hour", pitch.opening_time.hour))
    except (TypeError, ValueError):
        min_hour = pitch.opening_time.hour
    try:
        max_hour = int(request.query_params.get("end_hour", pitch.closing_time.hour))
    except (TypeError, ValueError):
        max_hour = pitch.closing_time.hour

    min_hour = max(min_hour, pitch.opening_time.hour)
    max_hour = min(max_hour, pitch.closing_time.hour)
    if max_hour <= min_hour:
        min_hour, max_hour = pitch.opening_time.hour, pitch.closing_time.hour

    num_days = (date_to - date_from).days + 1
    days = []
    for i in range(num_days):
        d = date_from + timedelta(days=i)
        days.append({
            "date": d.isoformat(),
            "weekday": WEEKDAY_NAMES[d.weekday()],
            "weekday_short": WEEKDAY_NAMES[d.weekday()][:3],
            "display_date": d.strftime("%d %b"),
        })
    hours = [
        {"start_hour": h, "end_hour": h + 1, "label": _hour_label(h, h + 1)}
        for h in range(min_hour, max_hour)
    ]

    cells = {}

    bookings_qs = Booking.objects.filter(
        pitch=pitch, status=BookingStatus.CONFIRMED,
        start_dt__gte=range_start_dt, start_dt__lt=range_end_dt,
    ).select_related("player")

    for b in bookings_qs:
        local_start = timezone.localtime(b.start_dt)
        booker_name = b.booked_for_name or (
            f"{getattr(b.player, 'first_name', '')} {getattr(b.player, 'last_name', '')}".strip()
            or getattr(b.player, "username", "Unknown")
        )
        if name_filter and name_filter not in booker_name.lower():
            continue
        key = f"{local_start.date().isoformat()}_{local_start.hour}"
        cells[key] = {
            "status": "booked",
            "kind": "manual" if b.booked_for_name else "individual",
            "name": booker_name,
            "amount": str(b.total_price),
            "time_label": f"{local_start.strftime('%I:%M %p')} - {timezone.localtime(b.end_dt).strftime('%I:%M %p')}",
            "phone": b.booked_for_phone or getattr(b.player, "phone", None),
            "email": None if b.booked_for_name else getattr(b.player, "email", None),
            "date": local_start.date().isoformat(),
        }

    manual_qs = Slot.objects.filter(
        pitch=pitch, status=SlotStatus.BOOKED,
        start_dt__gte=range_start_dt, start_dt__lt=range_end_dt,
    ).exclude(manual_booked_name="")

    for s in manual_qs:
        local_start = timezone.localtime(s.start_dt)
        key = f"{local_start.date().isoformat()}_{local_start.hour}"
        if key in cells:
            continue
        if name_filter and name_filter not in s.manual_booked_name.lower():
            continue
        cells[key] = {
            "status": "booked",
            "kind": "manual",
            "name": s.manual_booked_name,
            "amount": str(s.manual_price) if s.manual_price is not None else None,
            "time_label": f"{local_start.strftime('%I:%M %p')} - {timezone.localtime(s.end_dt).strftime('%I:%M %p')}",
            "phone": s.manual_booked_phone or None,
            "email": None,
            "date": local_start.date().isoformat(),
        }

    return Response({
        "date_from": date_from.isoformat(),
        "date_to": date_to.isoformat(),
        "days": days,
        "hours": hours,
        "cells": cells,
    })



@api_view(["POST"])
@permission_classes([IsAuthenticated])
def owner_grid_book_slot(request, pitch_id: str):
    """Lets a pitch owner (or admin) fill in a single free grid cell by
    hand — e.g. someone who paid in person. Ownership rule: an OWNER
    account may only do this on a pitch belonging to their own tenant
    (see _can_edit_pitch below — same guard used everywhere else an
    owner mutates a pitch)."""
    pitch = get_object_or_404(Pitch, id=pitch_id)

    if not _can_edit_pitch(request.user, pitch):
        return Response({"detail": "You can only manage bookings on your own pitch."}, status=403)

    date_str = request.data.get("date")
    start_hour = request.data.get("start_hour")
    name = (request.data.get("name") or "").strip()
    phone = (request.data.get("phone") or "").strip()
    price = request.data.get("price")

    if not date_str or start_hour is None or not name:
        return Response({"detail": "date, start_hour and name are required."}, status=400)

    try:
        day = datetime.strptime(date_str, "%Y-%m-%d").date()
        start_hour = int(start_hour)
    except (ValueError, TypeError):
        return Response({"detail": "Invalid date or start_hour."}, status=400)

    if day < timezone.localdate():
        return Response({"detail": "You can't book a date in the past."}, status=400)

    if not (pitch.opening_time.hour <= start_hour < pitch.closing_time.hour):
        return Response({"detail": "That hour is outside the pitch's open hours."}, status=400)

    tz = timezone.get_current_timezone()
    start_dt = timezone.make_aware(datetime.combine(day, time(hour=start_hour)), tz)
    end_dt = start_dt + timedelta(hours=1)

    if start_dt <= timezone.localtime():
        return Response({"detail": "That time has already passed."}, status=400)

    slot, _ = Slot.objects.get_or_create(
        pitch=pitch, start_dt=start_dt, end_dt=end_dt,
        defaults={"status": SlotStatus.AVAILABLE},
    )
    if slot.status != SlotStatus.AVAILABLE:
        return Response({"detail": "That slot is no longer free."}, status=409)

    price_dec = None
    if price not in (None, ""):
        try:
            price_dec = Decimal(str(price))
        except Exception:
            return Response({"detail": "Invalid price."}, status=400)

    slot.status = SlotStatus.BOOKED
    slot.updated_by = request.user
    slot.manual_booked_name = name
    slot.manual_booked_phone = phone
    slot.manual_price = price_dec
    slot.save()

    return Response({
        "ok": True,
        "cell": {
            "status": "booked",
            "kind": "manual",
            "name": name,
            "amount": str(price_dec) if price_dec is not None else None,
            "time_label": f"{timezone.localtime(start_dt).strftime('%I:%M %p')} - {timezone.localtime(end_dt).strftime('%I:%M %p')}",
            "phone": phone or None,
            "email": None,
            "date": day.isoformat(),
        },
    }, status=201)