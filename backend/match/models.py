import uuid

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import F, Q

from .choices import MatchParticipantStatus, MatchStatus


class MatchQuerySet(models.QuerySet):
    def open(self):
        return self.filter(status=MatchStatus.OPEN)

    def confirmed(self):
        return self.filter(status=MatchStatus.CONFIRMED)

    def joinable(self):
        """OPEN matches. Doesn't pre-filter out full ones — capacity
        is checked under a lock at join time, same reasoning as team
        roster capacity.
        """
        return self.open()

    def for_team(self, team):
        return self.filter(creator_team=team)

    def overlapping(self, *, start_time, end_time):
        """Standard interval-overlap test: two ranges overlap iff
        each starts before the other ends. Used by the conflict
        checks in services.py — kept here as query encapsulation so
        the overlap condition is defined in exactly one place.
        """
        return self.filter(start_time__lt=end_time, end_time__gt=start_time)


MatchManager = models.Manager.from_queryset(MatchQuerySet)


class Match(models.Model):
    """A team leaving slots open for outside players to fill a game
    it couldn't fill on its own. Tracked via MatchParticipant rows.
    Joining a match never touches TeamMembership — playing in a game
    a team posted does not make you a team member.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    status = models.CharField(
        max_length=10, choices=MatchStatus.choices, default=MatchStatus.OPEN
    )

    creator_team = models.ForeignKey(
        "team.Team",
        on_delete=models.CASCADE,
        related_name="created_matches",
    )

    pitch = models.ForeignKey(
        "pitches.Pitch",
        on_delete=models.PROTECT,
        related_name="matches",
        help_text="Location is derived through this FK, not stored on Match directly.",
    )

    start_time = models.DateTimeField()
    end_time = models.DateTimeField()

    description = models.TextField(blank=True)

    slots_needed = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1)],
    )
    price_per_slot = models.DecimalField(
        max_digits=10, decimal_places=2,
        validators=[MinValueValidator(0)],
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="matches_created_by_me",
    )
    confirmed_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = MatchManager()

    class Meta:
        db_table = "match_match"
        ordering = ["start_time"]
        constraints = [
            models.CheckConstraint(
                condition=Q(end_time__gt=F("start_time")),
                name="match_end_after_start",
            ),
        ]
        indexes = [
            models.Index(fields=["status", "start_time"]),
            models.Index(fields=["creator_team", "status"]),
            models.Index(fields=["pitch", "start_time"]),
        ]

    def __str__(self) -> str:
        return f"{self.creator_team.name} open match @ {self.start_time:%Y-%m-%d %H:%M}"

    @property
    def is_open(self) -> bool:
        return self.status == MatchStatus.OPEN

    @property
    def confirmed_participant_count(self) -> int:
        return self.participants.filter(status=MatchParticipantStatus.CONFIRMED).count()

    @property
    def available_slots(self):
        return max(self.slots_needed - self.confirmed_participant_count, 0)


class MatchParticipantQuerySet(models.QuerySet):
    def active(self):
        return self.filter(
            status__in=[MatchParticipantStatus.RESERVED, MatchParticipantStatus.CONFIRMED]
        )

    def confirmed(self):
        return self.filter(status=MatchParticipantStatus.CONFIRMED)

    def for_match(self, match):
        return self.filter(match=match)

    def for_user(self, user):
        return self.filter(user=user)


MatchParticipantManager = models.Manager.from_queryset(MatchParticipantQuerySet)


class MatchParticipant(models.Model):
    """One outside player's claim on a match slot. `amount_due`
    snapshots `match.price_per_slot` at join time so a later price
    edit never retroactively changes what an already-joined player
    owes.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    match = models.ForeignKey(Match, on_delete=models.CASCADE, related_name="participants")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="match_participations"
    )
    status = models.CharField(
        max_length=10, choices=MatchParticipantStatus.choices,
        default=MatchParticipantStatus.RESERVED,
    )
    amount_due = models.DecimalField(max_digits=10, decimal_places=2)
    joined_at = models.DateTimeField(auto_now_add=True)
    status_changed_at = models.DateTimeField(null=True, blank=True)

    objects = MatchParticipantManager()

    class Meta:
        db_table = "match_match_participant"
        ordering = ["joined_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["match", "user"],
                condition=Q(status__in=[MatchParticipantStatus.RESERVED, MatchParticipantStatus.CONFIRMED]),
                name="uniq_active_participant_per_match_user",
            ),
        ]
        indexes = [
            models.Index(fields=["match", "status"]),
            models.Index(fields=["user", "status"]),
        ]

    def __str__(self) -> str:
        return f"{self.user_id} @ {self.match_id} ({self.status})"

    @property
    def is_active(self) -> bool:
        return self.status in (MatchParticipantStatus.RESERVED, MatchParticipantStatus.CONFIRMED)