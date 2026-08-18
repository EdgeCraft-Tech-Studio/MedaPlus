from django.urls import path
from .views import health, create_booking_group

urlpatterns = [
    path("bookings/health/", health, name="bookings_health"),
    path("bookings/", create_booking_group, name="create_booking_group"), 
]
