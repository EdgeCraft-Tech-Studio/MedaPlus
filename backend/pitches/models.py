from django.db import models
from django.conf import settings
from datetime import time

class Tenant(models.Model):
    """
    A pitch business / organization (owned by an OWNER user).
    One owner -> one tenant (for now).
    """
    name = models.CharField(max_length=120)
    owner = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="tenant",
    )
    phone = models.CharField(max_length=30, blank=True, default="")
    is_active = models.BooleanField(default=True)

    # Admin approval before tenant becomes visible publicly
    is_approved = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class BookingType(models.TextChoices):
    HOURLY = "HOURLY", "Hourly"
    WEEKLY = "WEEKLY", "Weekly"
    MONTHLY = "MONTHLY", "Monthly"


class SportType(models.TextChoices):
    FOOTBALL = "FOOTBALL", "Football"
    BASKETBALL = "BASKETBALL", "Basketball"


class Pitch(models.Model):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="pitches")
    name = models.CharField(max_length=120)

    # Location
    latitude = models.FloatField()
    longitude = models.FloatField()
    address = models.CharField(max_length=255, blank=True, default="")
    sport_type = models.CharField(
        max_length=20,
        choices=SportType.choices,
        default=SportType.FOOTBALL,
    )

    # Booking rules
    min_hours = models.PositiveIntegerField(default=1)
    allow_hourly = models.BooleanField(default=True)
    allow_weekly = models.BooleanField(default=False)
    allow_monthly = models.BooleanField(default=False)

    # Pricing
    hourly_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    weekly_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)   # once per week
    monthly_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)  # 4x per month (once per week)

    # Opening/Closing Time
    opening_time = models.TimeField(default=time(8, 0))
    closing_time = models.TimeField(default=time(22, 0))

    # Amenities / services
    has_dressing_room = models.BooleanField(default=False)
    has_showers = models.BooleanField(default=False)
    has_parking = models.BooleanField(default=False)
    has_lighting = models.BooleanField(default=False)
    other_services = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Comma-separated services (e.g., referee, water, ball rental).",
    )

    # Admin approval before pitch appears to players
    is_approved = models.BooleanField(default=False)

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.tenant.name})"


class PitchImage(models.Model):
    pitch = models.ForeignKey(Pitch, on_delete=models.CASCADE, related_name="images")
    image = models.FileField(upload_to="pitch_images/")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Image for {self.pitch.name}"
