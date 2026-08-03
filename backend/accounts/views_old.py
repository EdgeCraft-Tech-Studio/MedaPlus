from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from backend.accounts.models.user import User, UserRole
from .serializers import RegisterSerializer
from pitches.models import Tenant

# ''' check if it is admin '''
# def _require_admin(request):
#     return request.user.is_authenticated and request.user.role == "ADMIN"

# @api_view(["GET"])
# @permission_classes([IsAuthenticated])
# def admin_list_owners(request):
#     if not _require_admin(request):
#         return Response({"detail": "Forbidden"}, status=403)

#     owners = User.objects.filter(role=UserRole.OWNER).values("id", "username", "email", "is_approved")
#     # convert ObjectId -> string
#     owners = [
#         {**o, "id": str(o["id"])}
#         for o in owners
#     ]
#     return Response({"owners": owners})

# @api_view(["GET"])
# @permission_classes([IsAuthenticated])
# def admin_pending_owners(request):
#     if not _require_admin(request):
#         return Response({"detail": "Forbidden"}, status=403)

#     owners = User.objects.filter(role=UserRole.OWNER, is_approved=False).values("id", "username", "email")
#     owners = [{**o, "id": str(o["id"])} for o in owners]
#     return Response({"pending_owners": owners})

# @api_view(["POST"])
# @permission_classes([IsAuthenticated])
# def admin_approve_owner(request, user_id: str):
#     if not _require_admin(request):
#         return Response({"detail": "Forbidden"}, status=403)
 
#     try:
#         u = User.objects.get(id=user_id)
#     except User.DoesNotExist:
#         return Response({"detail": "Owner not found"}, status=404)

#     if u.role != UserRole.OWNER:
#         return Response({"detail": "User is not an owner"}, status=400)

#     tenant, _ = Tenant.objects.get_or_create(
#         owner=u,
#         defaults={
#             "name": f"{u.username}'s Business",
#             "is_active": True,
#             "is_approved": True,
#         },
#     )

#     u.is_approved = True
#     u.save()

#     if not tenant.is_approved:
#         tenant.is_approved = True
#         tenant.save(update_fields=["is_approved"])

#     return Response({"ok": True, "owner_id": str(u.id), "is_approved": u.is_approved})

# @api_view(["GET"])
# @permission_classes([AllowAny])
# def health(request):
#     return Response({"ok": True, "service": "accounts"})


# @api_view(["GET"])
# @permission_classes([IsAuthenticated])
# def me(request):
#     u = request.user
#     return Response(
#         {
#             "id": str(u.id),  # Mongo ObjectId -> string
#             "username": u.username,
#             "role": u.role,
#             "email": u.email,
#             "is_superuser": u.is_superuser,
#             "is_staff": u.is_staff,
#             "is_approved": getattr(u, "is_approved", False),
#         }
#     )


# @api_view(["POST"])
# @permission_classes([AllowAny])
# @authentication_classes([])  # IMPORTANT: don’t try to authenticate (prevents 401 from bad tokens)
# def register(request):
#     s = RegisterSerializer(data=request.data)
#     if not s.is_valid():
#         return Response(s.errors, status=status.HTTP_400_BAD_REQUEST)

#     user = s.save()
#     return Response(
#         {
#             "id": str(user.id),
#             "username": user.username,
#             "email": user.email,
#             "role": user.role,
#         },
#         status=status.HTTP_201_CREATED,
#     )



# @api_view(["POST"])
# @permission_classes([IsAuthenticated])
# def logout(request):
#     session = getattr(request, "session_obj", None)

#     if session:
#         session.is_active = False
#         session.save(update_fields=["is_active"])

#     return Response({
#         "ok": True,
#         "message": "Logged out successfully."
#     })