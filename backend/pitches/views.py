from datetime import datetime, time, timedelta

from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from accounts.models import UserRole
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
      - ADMIN: create pitch for any tenant (optional, if you pass tenant_id)
    """
    u = request.user

    # ------------------------
    # LIST
    # ------------------------
    if request.method == "GET":
        if is_admin(u):
            qs = Pitch.objects.all().order_by("-created_at")
        elif is_owner(u):
            if not hasattr(u, "tenant"):
                return Response({"detail": "Owner does not have a tenant record yet."}, status=400)
            qs = Pitch.objects.filter(tenant=u.tenant).order_by("-created_at")
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

    if is_admin(u) and data.get("tenant_id"):
        # Admin can create pitch for any tenant
        try:
            tenant = Tenant.objects.get(id=data["tenant_id"])
        except Tenant.DoesNotExist:
            return Response({"detail": "Tenant not found"}, status=404)

    elif is_owner(u):
        if not hasattr(u, "tenant"):
            return Response({"detail": "Owner does not have a tenant record yet."}, status=400)
        tenant = u.tenant

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

        # approval workflow
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
    """
    Admin sees pitches waiting for approval.
    """
    if not is_admin(request.user):
        return Response({"detail": "Forbidden"}, status=403)

    qs = Pitch.objects.filter(is_approved=False, is_active=True).order_by("-created_at")
    return Response({"pending_pitches": PitchSerializer(qs, many=True).data})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def admin_approve_pitch(request, pitch_id: str):
    """
    Approve a pitch. Only possible if its tenant is approved.
    """
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
