from django.urls import path
from .views import (
    health,
    pitches_list_create,
    admin_pending_pitches,
    admin_approve_pitch,
    pitch_detail,
)

urlpatterns = [
    path("pitches/health/", health),
    path("pitches/", pitches_list_create),
    path("pitches/<str:pitch_id>/", pitch_detail),
    path("admin/pitches/pending/", admin_pending_pitches),
    path("admin/pitches/<str:pitch_id>/approve/", admin_approve_pitch),
]
