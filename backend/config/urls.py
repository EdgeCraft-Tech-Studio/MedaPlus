from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path, include

from accounts.views.auth_view import ForgotPasswordVerifyOTPView, ForgotPasswordView, HomeDataView, LoginView, LogoutView, ResendOTPView, ResetPasswordView, SignupVerifyOTPView, SignupView, TokenRefreshsView
from accounts.views.otp_view import OTPStatusView
from accounts.views.pages_view import AdminApproveOwnerView, AdminListOwnersView, AdminPendingOwnersView, MeView

urlpatterns = [
    path("admin/", admin.site.urls),

    # path("api/auth/me/", me, name="auth_me"),
    # path("api/auth/health/", health, name="auth_health"),
    path(
        'api/auth/register/',
        SignupView.as_view(),
        name='auth_register',
    ),


    path(
        'api/auth/register/verify/',
        SignupVerifyOTPView.as_view(),
        name='auth-signup-verify',
    ),


    path(
        'api/auth/login/',
        LoginView.as_view(),
        name='auth-login',
    ),

    
    path(
        'api/auth/me/',
        MeView.as_view(),
        name='auth_me',
    ),

    path(
        'api/auth/home/',
        HomeDataView.as_view(),
        name='auth-home',
    ),

    path(
        'api/auth/logout/',
        LogoutView.as_view(),
        name='auth-logout',
    ),

    path(
        'api/auth/forgot-password/',
        ForgotPasswordView.as_view(),
        name='auth-forgot-password',
    ),

    path(
        'api/auth/forgot-password/verify/',
        ForgotPasswordVerifyOTPView.as_view(),
        name='auth-forgot-password-verify',
    ),

    path(
        'api/auth/reset-password/',
        ResetPasswordView.as_view(),
        name='auth-reset-password',
    ),

    path(
        'api/auth/refresh/',
        TokenRefreshsView.as_view(),
        name='auth-token-refresh',
    ),


    path(
        'api/otp/resend/',
        ResendOTPView.as_view(),
        name='otp-resend',
    ),

    path(
        'api/otp/status/',
        OTPStatusView.as_view(),
        name='otp-status',
    ),

    path(
        "api/admin/owners/pending/",
        AdminPendingOwnersView.as_view(),
        name='otp-owenr-pending',
        ),

    path(
            "api/admin/owners/",
            AdminListOwnersView.as_view(),
            name='otp-owenrs',
    ),

    path(
                "api/admin/owners/<str:user_id>/approve/",
                AdminApproveOwnerView.as_view(),
                name='otp-owenrs-approve',
        ),
    
 
    path("api/", include("pitches.urls")),
    path("api/", include("team.urls")),
    # path("api/", include("bookings.urls")),

    # path("api/admin/owners/", admin_list_owners),
    # path("api/admin/owners/pending/", admin_pending_owners), 
    # path("api/admin/owners/<str:user_id>/approve/", admin_approve_owner),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
