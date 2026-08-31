from django.urls import path
from .views import (
    health,
    pitches_list_create,
    admin_pending_pitches,
    admin_approve_pitch,
    pitch_detail,
    owner_dashboard_stats,
    owner_pitch_detail_stats,
    admin_platform_stats,
    admin_delete_pitch,
    admin_delete_owner,
)

urlpatterns = [
    path("pitches/health/", health),
    path("pitches/owner/stats/", owner_dashboard_stats),
    path("pitches/", pitches_list_create),
    path("pitches/<str:pitch_id>/owner-stats/", owner_pitch_detail_stats),
    path("pitches/<str:pitch_id>/", pitch_detail),
    path("admin/stats/", admin_platform_stats),
    path("admin/pitches/pending/", admin_pending_pitches),
    path("admin/pitches/<str:pitch_id>/approve/", admin_approve_pitch),
    path("admin/pitches/<str:pitch_id>/delete/", admin_delete_pitch),
    path("admin/owners/<str:owner_id>/delete/", admin_delete_owner),
]