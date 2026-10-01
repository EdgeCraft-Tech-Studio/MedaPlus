from rest_framework.permissions import BasePermission


class IsPlatformAdmin(BasePermission):
    message = "Only a platform admin can do this."

    def has_permission(self, request, view) -> bool:
        return bool(request.user and getattr(request.user, "platform_admin", False))
