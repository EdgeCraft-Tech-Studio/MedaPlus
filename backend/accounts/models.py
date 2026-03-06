from django.contrib.auth.models import AbstractUser
from django.db import models

class UserRole(models.TextChoices):
    ADMIN = "ADMIN", "Admin"
    OWNER = "OWNER", "Pitch Owner"
    PLAYER = "PLAYER", "Player"

class User(AbstractUser):
    role = models.CharField(max_length=20, choices=UserRole.choices, default=UserRole.PLAYER)

    # Owners must be approved by admin before their pitches show publicly
    is_approved = models.BooleanField(default=False)

    def save(self, *args, **kwargs):
        if self.is_superuser:
            self.role = UserRole.ADMIN
            self.is_approved = True
        super().save(*args, **kwargs)
