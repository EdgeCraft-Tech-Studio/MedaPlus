from django.db import models


class MatchType(models.TextChoices):
    TEAM_VS_TEAM = "team_vs_team", "Team vs Team"
    OPEN_SLOTS = "open_slots", "Open Slots"


class MatchStatus(models.TextChoices):
    OPEN = "open", "Open"
    CONFIRMED = "confirmed", "Confirmed"
    COMPLETED = "completed", "Completed"
    CANCELLED = "cancelled", "Cancelled"


class MatchParticipantStatus(models.TextChoices):
    RESERVED = "reserved", "Reserved"
    CONFIRMED = "confirmed", "Confirmed"
    CANCELLED = "cancelled", "Cancelled"
