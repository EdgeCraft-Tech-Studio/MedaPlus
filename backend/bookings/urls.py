from django.urls import path
from .views import health

urlpatterns = [
    path("bookings/health/", health, name="bookings_health"),
]
