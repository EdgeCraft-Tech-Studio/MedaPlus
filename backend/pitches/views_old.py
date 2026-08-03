from datetime import datetime, time, timedelta

from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from backend.accounts.models.user import UserRole
from bookings.models import Slot, SlotStatus
from .models import Tenant, Pitch
from .serializers import PitchSerializer, PitchCreateSerializer


def is_admin(u) -> bool:
    return u.is_authenticated and u.role == UserRole.ADMIN


def is_owner(u) -> bool:
    return u.is_authenticated and u.role == UserRole.OWNER


@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    return Response({"ok": True, "service": "pitches"})


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def pitches_list_create(request):
    """
    GET:
      - ADMIN: all pitches
      - OWNER: only their tenant pitches
      - PLAYER: only approved pitches whose tenant is approved+active

    POST:
      - OWNER: create pitch under their tenant (pitch becomes pending approval)
      - ADMIN: create pitch for tenant_id OR owner_id (owner_id resolves to tenant)
    """
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
            # PLAYER
            qs = Pitch.objects.filter(
                is_active=True,
                is_approved=True,
                tenant__is_active=True,
                tenant__is_approved=True,
            ).order_by("-created_at")

        return Response({"pitches": PitchSerializer(qs, many=True).data})

    # ------------------------
    # CREATE
    # ------------------------
    s = PitchCreateSerializer(data=request.data)
    if not s.is_valid():
        return Response(s.errors, status=status.HTTP_400_BAD_REQUEST)
    data = s.validated_data

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
                owner_user = u.__class__.objects.get(id=owner_id)
            except u.__class__.DoesNotExist:
                return Response({"detail": "Owner not found."}, status=404)

            tenant, _ = Tenant.objects.get_or_create(
                owner=owner_user,
                defaults={
                    "name": f"{owner_user.username}'s Business",
                    "is_active": True,
                    "is_approved": bool(getattr(owner_user, "is_approved", False)),
                },
            )

        else:
            return Response({"detail": "Admin must provide tenant_id or owner_id."}, status=400)

    elif is_owner(u):
        if not hasattr(u, "tenant"):
            return Response({"detail": "Owner does not have a tenant record yet."}, status=400)
        tenant = u.tenant

    else:
        return Response({"detail": "Forbidden"}, status=403)

    # Create pitch (pending approval)
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

        is_approved=False,
        is_active=True,
    )

    # Optionally create hourly slots for a given day
    slot_date = data.get("slot_date") or timezone.localdate()
    slot_hours = data.get("slot_hours") or []
    tz = timezone.get_current_timezone()

    for h in slot_hours:
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

    return Response({"pitch": PitchSerializer(pitch).data}, status=status.HTTP_201_CREATED)


# --------------------------
# ADMIN: Approvals
# --------------------------

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_pending_pitches(request):
    if not is_admin(request.user):
        return Response({"detail": "Forbidden"}, status=403)

    qs = Pitch.objects.filter(is_approved=False, is_active=True).order_by("-created_at")
    return Response({"pending_pitches": PitchSerializer(qs, many=True).data})


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
