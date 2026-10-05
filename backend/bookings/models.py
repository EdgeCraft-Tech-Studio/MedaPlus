
import uuid

from django.db import models
from django.conf import settings
from django.utils import timezone
from pitches.models import Pitch, BookingType


class SlotStatus(models.TextChoices):
    AVAILABLE = "AVAILABLE", "Available"
    BLOCKED = "BLOCKED", "Blocked"
    BOOKED = "BOOKED", "Booked"


class Slot(models.Model):
    """
    Represents a bookable time chunk (usually 1 hour) for a pitch.
    Owners/Admin create slots, players book them.
    """
    pitch = models.ForeignKey(Pitch, on_delete=models.CASCADE, related_name="slots")
    start_dt = models.DateTimeField()
    end_dt = models.DateTimeField()
    status = models.CharField(max_length=20, choices=SlotStatus.choices, default=SlotStatus.AVAILABLE)

    # Optional: who blocked/booked it (helpful for audit)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="updated_slots",
    )
    manual_booked_name = models.CharField(max_length=120, blank=True, default="")
    manual_booked_phone = models.CharField(max_length=30, blank=True, default="")
    manual_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)  # NEW
    manual_close_reason = models.CharField(max_length=255, blank=True, default="")  # NEW: owner-entered reason when a free slot is closed (SlotStatus.BLOCKED)
   
    held_until = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["pitch", "start_dt"]),
            models.Index(fields=["status"]),
        ]
        ordering = ["start_dt"]

    def __str__(self):
        return f"{self.pitch.name} | {self.start_dt} - {self.end_dt} ({self.status})"


class BookingStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    CONFIRMED = "CONFIRMED", "Confirmed"
    CANCELLED = "CANCELLED", "Cancelled"


class Booking(models.Model):
    """
    Booking record.
    For HOURLY: start_dt/end_dt represent the booked time.
    For WEEKLY/MONTHLY: start_dt/end_dt represent the first occurrence (later we add recurrence config).
    """
    pitch = models.ForeignKey(Pitch, on_delete=models.CASCADE, related_name="bookings")
    player = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="bookings")

    booking_type = models.CharField(max_length=20, choices=BookingType.choices, default=BookingType.HOURLY)

    start_dt = models.DateTimeField()
    end_dt = models.DateTimeField()

    # Link booking to the slot (for hourly bookings this is very useful).
    # If a booking spans multiple slots later, we can change to ManyToMany.
    slot = models.ForeignKey(
        Slot,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="booking",
    )

    status = models.CharField(max_length=20, choices=BookingStatus.choices, default=BookingStatus.PENDING)

    total_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    # Useful UX field (show to user/staff)
    booking_code = models.CharField(max_length=12, blank=True, default="")
    booked_for_name = models.CharField(max_length=120, blank=True, default="") 
    booked_for_phone = models.CharField(max_length=30, blank=True, default="") 

    notes = models.CharField(max_length=255, blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["pitch", "start_dt"]),
            models.Index(fields=["player", "created_at"]),
            models.Index(fields=["status"]),
        ]
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.pitch.name} | {self.player.username} | {self.start_dt} ({self.status})"




class SoloBookingStatus(models.TextChoices):
    PAYMENT_PENDING = "PAYMENT_PENDING", "Payment Pending"
    BOOKED = "BOOKED", "Booked"
    UNAVAILABLE = "UNAVAILABLE", "Pitch Unavailable"
    CANCELLED = "CANCELLED", "Cancelled"
    EXPIRED = "EXPIRED", "Expired"


class SoloBookingHold(models.Model):
    """A single player's own booking attempt, gated behind real
    payment — the player-equivalent of TeamBookingRequest, just
    without a confirm-with-teammates phase (payment starts
    immediately on creation, since there's only one payer). No real
    Booking row exists until payment is VERIFIED; see
    bookings.services.finalize_solo_booking.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    pitch = models.ForeignKey(Pitch, on_delete=models.CASCADE, related_name="solo_booking_holds")
    player = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="solo_booking_holds")

    booking_type = models.CharField(max_length=20, choices=BookingType.choices, default=BookingType.HOURLY)
    selections = models.JSONField(default=list)
    notes = models.CharField(max_length=255, blank=True, default="")

    price_per_slot = models.DecimalField(max_digits=10, decimal_places=2)
    total_price = models.DecimalField(max_digits=10, decimal_places=2)

    status = models.CharField(max_length=20, choices=SoloBookingStatus.choices, default=SoloBookingStatus.PAYMENT_PENDING)
    payment_expires_at = models.DateTimeField()
    final_booking_code = models.CharField(max_length=12, blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["player", "status"]),
            models.Index(fields=["status", "payment_expires_at"]),
        ]
        ordering = ["-created_at"]

    def __str__(self):
        return f"SoloBookingHold({self.pitch.name} / {self.player_id} / {self.status})"

    @property
    def is_payment_expired(self) -> bool:
        return timezone.now() >= self.payment_expires_at