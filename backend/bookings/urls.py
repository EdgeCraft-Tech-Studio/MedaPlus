from django.urls import path
from .views import health, create_booking_group, create_solo_booking_hold_view, pending_solo_booking_view

urlpatterns = [
    path("bookings/health/", health, name="bookings_health"),
    path("bookings/", create_booking_group, name="create_booking_group"),
    path("bookings/solo/", create_solo_booking_hold_view, name="create_solo_booking_hold"),
    path("bookings/solo/pending/", pending_solo_booking_view, name="pending_solo_booking"),
]