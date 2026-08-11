import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone

from ...core.utils.choices  import MembershipRole, MembershipSource, MembershipStatus, PreferredPosition


class TeamMembershipQuerySet(models.QuerySet):
    """Query encapsulation only. No mutation, no cross-model
    coordination — that belongs in the service layer.
    """

    def active(self):
        return self.filter(status=MembershipStatus.ACTIVE)

    def left(self):
        return self.filter(status=MembershipStatus.LEFT)

    def removed(self):
        return self.filter(status=MembershipStatus.REMOVED)

    def owners(self):
        return self.filter(role=MembershipRole.OWNER)

    def admins(self):
        return self.filter(role=MembershipRole.ADMIN)

    def management(self):
        """OWNER + ADMIN, i.e. everyone with roster-management rights.
        Kept as a named query rather than callers writing
        `role__in=[...]` everywhere the concept 'can manage the roster'
        is needed.
        """
        return self.filter(role__in=[MembershipRole.OWNER, MembershipRole.ADMIN])

    def for_team(self, team):
        return self.filter(team=team)

    def for_user(self, user):
        return self.filter(user=user)

    def active_for_team(self, team):
        return self.for_team(team).active()

    def active_for_user(self, user):
        return self.for_user(user).active()

    def by_source(self, source: str):
        return self.filter(source=source)


TeamMembershipManager = models.Manager.from_queryset(TeamMembershipQuerySet)


class TeamMembership(models.Model):
    """The actual relationship between a User and a Team.

    Single source of truth for who belongs to a team (status=ACTIVE),
    what role they have, and full historical membership. LEFT/REMOVED
    rows are kept, never deleted — needed for match history,
    tournament history, payments, and auditing.

    This model deliberately does NOT decide *whether* a transition is
    allowed (e.g. "can this user leave without transferring
    ownership") — that requires knowing about other memberships on
    the same team and belongs in the service layer. What lives here
    are named, single-row state changes plus the field-level
    invariants a single row can enforce on its own.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    team = models.ForeignKey(
        "teams.Team",
        on_delete=models.CASCADE,
        related_name="memberships",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="team_memberships",
    )

    role = models.CharField(
        max_length=10,
        choices=MembershipRole.choices,
        default=MembershipRole.MEMBER,
    )
    status = models.CharField(
        max_length=10,
        choices=MembershipStatus.choices,
        default=MembershipStatus.ACTIVE,
    )

    # How this row came to exist. See MembershipSource docstring for
    # the scenario this protects against (losing the invite/join-
    # request pathway once membership is active).
    source = models.CharField(
        max_length=20,
        choices=MembershipSource.choices,
        default=MembershipSource.TEAM_CREATION,
    )

    # Optional, football-specific roster metadata. Nullable so
    # non-football sports (or teams that don't care) are unaffected.
    jersey_number = models.PositiveSmallIntegerField(null=True, blank=True)
    preferred_position = models.CharField(
        max_length=3,
        choices=PreferredPosition.choices,
        blank=True,
    )

    joined_at = models.DateTimeField(default=timezone.now)
    status_changed_at = models.DateTimeField(null=True, blank=True)

    # Scenario: a team wants to show "last seen 3 weeks ago" on a
    # roster, or auto-flag members who've gone dormant before a
    # tournament. Nullable and update-elsewhere (services layer) —
    # the model just reserves the column.
    last_active_at = models.DateTimeField(null=True, blank=True)

    # Optimistic concurrency token — same rationale as Team.version.
    # Concretely here: two admins simultaneously click "promote to
    # admin" and "remove" on the same membership row within the same
    # second. Without a version check, one write silently wins with
    # no signal that a conflicting action just happened.
    version = models.PositiveIntegerField(default=0)

    updated_at = models.DateTimeField(auto_now=True)

    objects = TeamMembershipManager()

    class Meta:
        db_table = "teams_teammembership"
        verbose_name = "Team Membership"
        verbose_name_plural = "Team Memberships"
        ordering = ["-joined_at"]
        constraints = [
            # A user can only have ONE active membership per team —
            # stops a "left and rejoined" user from ending up with
            # two simultaneous ACTIVE rows for the same team.
            models.UniqueConstraint(
                fields=["team", "user"],
                condition=models.Q(status=MembershipStatus.ACTIVE),
                name="uniq_active_membership_per_team_user",
            ),
            # A team can only have ONE active owner at a time.
            models.UniqueConstraint(
                fields=["team"],
                condition=models.Q(
                    role=MembershipRole.OWNER,
                    status=MembershipStatus.ACTIVE,
                ),
                name="uniq_active_owner_per_team",
            ),
            # Two ACTIVE players on the same team cannot wear the same
            # number. Scoped to ACTIVE + non-null so past (LEFT/
            # REMOVED) members freeing up "#10" doesn't require any
            # cleanup, and members with no jersey number assigned yet
            # don't collide with each other.
            models.UniqueConstraint(
                fields=["team", "jersey_number"],
                condition=models.Q(
                    status=MembershipStatus.ACTIVE,
                    jersey_number__isnull=False,
                ),
                name="uniq_active_jersey_number_per_team",
            ),
            # Defense-in-depth DB backstop: an OWNER row must be
            # ACTIVE. This does NOT guarantee a team always HAS an
            # active owner (that's a cross-row invariant the DB can't
            # express and belongs to the service layer's
            # transfer_ownership flow) — it only guarantees that IF a
            # row claims to be the owner, it cannot simultaneously
            # claim to be LEFT or REMOVED. Catches the specific bug
            # class of "someone called mark_left()/mark_removed() on
            # an owner row directly, skipping the transfer step."
            models.CheckConstraint(
                condition=~models.Q(role=MembershipRole.OWNER)
                | models.Q(status=MembershipStatus.ACTIVE),
                name="owner_membership_must_be_active",
            ),
        ]
        indexes = [
            models.Index(fields=["team", "status"]),
            models.Index(fields=["user", "status"]),
            models.Index(fields=["team", "source"]),
        ]

    def __str__(self) -> str:
        return f"{self.user} @ {self.team} ({self.role}/{self.status})"

    # ------------------------------------------------------------------
    # Pure predicates — read-only, derived from this row's own fields.
    # ------------------------------------------------------------------

    @property
    def is_active(self) -> bool:
        return self.status == MembershipStatus.ACTIVE

    @property
    def is_owner(self) -> bool:
        return self.role == MembershipRole.OWNER

    @property
    def is_admin(self) -> bool:
        return self.role == MembershipRole.ADMIN

    @property
    def has_management_permissions(self) -> bool:
        """Whether this membership's role grants roster-management
        rights, IF it is also active. This is a pure fact about the
        row ("what does OWNER/ADMIN + ACTIVE mean"), not a permission
        *decision* — it doesn't check the row against anything else,
        so it stays a model property rather than service logic.
        """
        return self.is_active and self.role in (
            MembershipRole.OWNER,
            MembershipRole.ADMIN,
        )

    # ------------------------------------------------------------------
    # Named, single-row state changes. Each sets exactly the fields
    # that transition implies and nothing else — no validation of
    # whether the transition SHOULD be allowed given other rows
    # (e.g. "is this the last owner"), since that requires knowledge
    # outside this row and belongs to the service layer.
    # ------------------------------------------------------------------

    def mark_left(self, *, save: bool = True) -> None:
        self.status = MembershipStatus.LEFT
        self.status_changed_at = timezone.now()
        if save:
            self.save(update_fields=["status", "status_changed_at", "updated_at"])

    def mark_removed(self, *, save: bool = True) -> None:
        self.status = MembershipStatus.REMOVED
        self.status_changed_at = timezone.now()
        if save:
            self.save(update_fields=["status", "status_changed_at", "updated_at"])

    def set_role(self, role: str, *, save: bool = True) -> None:
        self.role = role
        if save:
            self.save(update_fields=["role", "updated_at"])

    def touch_last_active(self, *, save: bool = True) -> None:
        self.last_active_at = timezone.now()
        if save:
            self.save(update_fields=["last_active_at"])
