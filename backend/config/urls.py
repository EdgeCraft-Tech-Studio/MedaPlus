from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path, include
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from accounts.views import me, health, logout, register
from accounts.views import admin_list_owners, admin_pending_owners, admin_approve_owner

urlpatterns = [
    path("admin/", admin.site.urls),

    path("api/auth/login/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/auth/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/auth/me/", me, name="auth_me"),
    path("api/auth/health/", health, name="auth_health"),
    path("api/auth/logout/", logout, name="auth_logout"),
    path("api/auth/register/", register, name="auth_register"),

    path("api/", include("pitches.urls")),
    path("api/", include("bookings.urls")),

    path("api/admin/owners/", admin_list_owners),
    path("api/admin/owners/pending/", admin_pending_owners),
    path("api/admin/owners/<str:user_id>/approve/", admin_approve_owner),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
