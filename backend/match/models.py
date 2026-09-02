import uuid

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import F, Q

from .choices import MatchParticipantStatus, MatchStatus, MatchType


class MatchQuerySet(models.QuerySet):
    def open(self):
        return self.filter(status=MatchStatus.OPEN)

    def confirmed(self):
        return self.filter(status=MatchStatus.CONFIRMED)

    def team_vs_team(self):
        return self.filter(match_type=MatchType.TEAM_VS_TEAM)

    def open_slots(self):
        return self.filter(match_type=MatchType.OPEN_SLOTS)

    def open_challenges(self):
        """OPEN team_vs_team matches with no opponent yet."""
        return self.team_vs_team().open().filter(opponent_team__isnull=True)

    def joinable(self):
        """OPEN open_slots matches. Doesn't pre-filter out full ones —
        capacity is checked under a lock at join time, same reasoning
        as team roster capacity.
        """
        return self.open_slots().open()

    def for_team(self, team):
        return self.filter(Q(creator_team=team) | Q(opponent_team=team))

    def overlapping(self, *, start_time, end_time):
        """Standard interval-overlap test: two ranges overlap iff
        each starts before the other ends. Used by the conflict
        checks in services.py — kept here as query encapsulation
        so the overlap condition is defined in exactly one place.
        """
        return self.filter(start_time__lt=end_time, end_time__gt=start_time)


MatchManager = models.Manager.from_queryset(MatchQuerySet)


class Match(models.Model):
    """A proposed or confirmed game at a specific pitch and time.
    Two shapes share this model, picked at creation via `match_type`
    and enforced by the `match_fields_match_type` DB constraint:

    - TEAM_VS_TEAM: `creator_team` posts it, `opponent_team` stays
      NULL until another team accepts. `total_price` is the full
      pitch cost, split 50/50 (see `price_per_team`).
    - OPEN_SLOTS: `creator_team` needs `slots_needed` outside players
      at `price_per_slot` each, tracked via MatchParticipant rows.
      Joining a match never touches TeamMembership — playing in a
      game a team posted does not make you a team member.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    match_type = models.CharField(max_length=15, choices=MatchType.choices)
    status = models.CharField(
        max_length=10, choices=MatchStatus.choices, default=MatchStatus.OPEN
    )

    creator_team = models.ForeignKey(
        "team.Team",
        on_delete=models.CASCADE,
        related_name="created_matches",
    )
    opponent_team = models.ForeignKey(
        "team.Team",
        on_delete=models.SET_NULL,
        related_name="challenged_matches",
        null=True,
        blank=True,
        help_text="TEAM_VS_TEAM only. NULL until another team accepts.",
    )

    # ASSUMPTION FLAGGED: app label 'pitches', model name 'Pitch'.
    # Confirmed 'pitches' exists in your INSTALLED_APPS; the model
    # name itself is a guess. If wrong, this is a one-line string fix
    # here — nothing else in this file depends on Pitch's actual
    # fields, so a wrong guess doesn't cascade into a rebuild.
    pitch = models.ForeignKey(
        "pitches.Pitch",
        on_delete=models.PROTECT,
        related_name="matches",
        help_text="Location is derived through this FK, not stored on Match directly.",
    )

    start_time = models.DateTimeField()
    end_time = models.DateTimeField()

    description = models.TextField(blank=True)

    # --- TEAM_VS_TEAM only ---
    total_price = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        validators=[MinValueValidator(0)],
    )

    # --- OPEN_SLOTS only ---
    slots_needed = models.PositiveSmallIntegerField(
        null=True, blank=True, validators=[MinValueValidator(1)],
    )
    price_per_slot = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
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
                condition=(
                    Q(match_type=MatchType.TEAM_VS_TEAM, total_price__isnull=False,
                      slots_needed__isnull=True, price_per_slot__isnull=True)
                    | Q(match_type=MatchType.OPEN_SLOTS, total_price__isnull=True,
                        slots_needed__isnull=False, price_per_slot__isnull=False)
                ),
                name="match_fields_match_type",
            ),
            models.CheckConstraint(
                condition=~Q(opponent_team=F("creator_team")),
                name="match_opponent_not_self",
            ),
            models.CheckConstraint(
                condition=Q(end_time__gt=F("start_time")),
                name="match_end_after_start",
            ),
        ]
        indexes = [
            models.Index(fields=["status", "start_time"]),
            models.Index(fields=["match_type", "status"]),
            models.Index(fields=["creator_team", "status"]),
            models.Index(fields=["opponent_team", "status"]),
            models.Index(fields=["pitch", "start_time"]),
        ]

    def __str__(self) -> str:
        if self.match_type == MatchType.TEAM_VS_TEAM:
            opp = self.opponent_team.name if self.opponent_team else "[open]"
            return f"{self.creator_team.name} vs {opp} @ {self.start_time:%Y-%m-%d %H:%M}"
        return f"{self.creator_team.name} open match @ {self.start_time:%Y-%m-%d %H:%M}"

    @property
    def is_team_vs_team(self) -> bool:
        return self.match_type == MatchType.TEAM_VS_TEAM

    @property
    def is_open_slots(self) -> bool:
        return self.match_type == MatchType.OPEN_SLOTS

    @property
    def is_open(self) -> bool:
        return self.status == MatchStatus.OPEN

    @property
    def price_per_team(self):
        return None if self.total_price is None else self.total_price / 2

    @property
    def confirmed_participant_count(self) -> int:
        return self.participants.filter(status=MatchParticipantStatus.CONFIRMED).count()

    @property
    def available_slots(self):
        if self.slots_needed is None:
            return None
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
    """One outside player's claim on an OPEN_SLOTS match slot.
    `amount_due` snapshots `match.price_per_slot` at join time so a
    later price edit never retroactively changes what an already-
    joined player owes.
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
