from xml.dom import ValidationErr

from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from accounts.models.user import User, UserRole
from pitches.models import Tenant



def _require_admin(request):
    return request.user.is_authenticated and request.user.role == "ADMIN"



class MeView(APIView):
    
    permission_classes = [IsAuthenticated]

    def get(self, request):
        u = request.user
        return Response(
            {
                "id": str(u.id),  # UUID -> string
                "phone": u.phone,
                "role": u.role,
                "email": u.email,
                "is_superuser": u.is_superuser,
                "is_staff": u.is_staff,
                "is_approved": getattr(u, "is_approved", False),
            }
        )


class HealthView(APIView):
    
    permission_classes = [AllowAny]
    authentication_classes = []  # no need to authenticate for a health check

    def get(self, request):
        return Response({"ok": True, "service": "accounts"})


class AdminListOwnersView(APIView):
    
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _require_admin(request):
            return Response({"detail": "Forbidden"}, status=403)

        owners = User.objects.filter(role=UserRole.OWNER).values(
            "id", "phone", "email", "is_approved"
        )
        # convert UUID -> string
        owners = [
            {**o, "id": str(o["id"])}
            for o in owners
        ]
        return Response({"owners": owners})


class AdminPendingOwnersView(APIView):
    
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _require_admin(request):
            return Response({"detail": "Forbidden"}, status=403)

        owners = User.objects.filter(role=UserRole.OWNER, is_approved=False).values(
            "id", "phone", "email"
        )
        owners = [{**o, "id": str(o["id"])} for o in owners]
        return Response({"pending_owners": owners})



class AdminApproveOwnerView(APIView):

    permission_classes = [IsAuthenticated]

    def post(self, request, user_id: str):
        if not _require_admin(request):
            return Response({"detail": "Forbidden"}, status=403)

        try:
            u = User.objects.get(id=user_id)
        except (User.DoesNotExist, ValidationErr, ValueError):
            return Response({"detail": "Owner not found"}, status=404)

        if u.role != UserRole.OWNER:
            return Response({"detail": "User is not an owner"}, status=400)

        tenant, _ = Tenant.objects.get_or_create(
            owner=u,
            defaults={
                "name": f"{u.full_name}'s Business",
                "is_active": True,
                "is_approved": True,
            },
        )

        u.is_approved = True
        u.save(update_fields=["is_approved"])

        if not tenant.is_approved:
            tenant.is_approved = True
            tenant.save(update_fields=["is_approved"])

        return Response({"ok": True, "owner_id": str(u.id), "is_approved": u.is_approved})