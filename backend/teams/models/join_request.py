import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone

from ...core.utils.choices  import JoinRequestStatus


class TeamJoinRequestQuerySet(models.QuerySet):
    def pending(self):
        return self.filter(status=JoinRequestStatus.PENDING)

    def approved(self):
        return self.filter(status=JoinRequestStatus.APPROVED)

    def rejected(self):
        return self.filter(status=JoinRequestStatus.REJECTED)

    def for_team(self, team):
        return self.filter(team=team)

    def for_user(self, user):
        return self.filter(user=user)

    def pending_for_team_and_user(self, team, user):
        return self.for_team(team).for_user(user).pending()

    def reviewed_by_user(self, user):
        return self.filter(reviewed_by=user)


TeamJoinRequestManager = models.Manager.from_queryset(TeamJoinRequestQuerySet)


class TeamJoinRequest(models.Model):
    """A public-team discovery join request — 'User wants to join
    Team X', initiated by the user, not the owner. Distinct from
    TeamInvitation, which is initiated by the team.

    Whether the target team is even PRIVATE (and must therefore
    reject this request outright) depends on the Team row and is
    cross-model business logic — enforced in
    teams.services.join_request_service, not here. What this model
    guarantees on its own: a request can't silently end up "reviewed"
    without a review timestamp, and a user can't pile up duplicate
    pending requests for the same team.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    team = models.ForeignKey(
        "teams.Team",
        on_delete=models.CASCADE,
        related_name="join_requests",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="team_join_requests",
    )

    message = models.TextField(blank=True)

    status = models.CharField(
        max_length=10,
        choices=JoinRequestStatus.choices,
        default=JoinRequestStatus.PENDING,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="team_join_requests_reviewed",
        null=True,
        blank=True,
        help_text=(
            "Nullable via SET_NULL: if the reviewing admin's account "
            "is later deleted, the historical review (status, "
            "reviewed_at) must survive — only the 'who' is lost."
        ),
    )

    # Optimistic concurrency token. Scenario: two admins both looking
    # at the same pending request approve/reject it within the same
    # second — without this, one write silently overwrites the other
    # with no signal that a race happened.
    version = models.PositiveIntegerField(default=0)

    objects = TeamJoinRequestManager()

    class Meta:
        db_table = "teams_teamjoinrequest"
        verbose_name = "Team Join Request"
        verbose_name_plural = "Team Join Requests"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["team", "user"],
                condition=models.Q(status=JoinRequestStatus.PENDING),
                name="uniq_pending_join_request_per_team_user",
            ),
            # DB-level integrity: a PENDING request must not already
            # carry a review timestamp, and a non-PENDING request must
            # carry one. Catches the bug class of a status flip that
            # forgot to stamp reviewed_at (or vice versa) regardless
            # of which code path wrote the row.
            models.CheckConstraint(
                condition=(
                    models.Q(status=JoinRequestStatus.PENDING, reviewed_at__isnull=True)
                    | (
                        ~models.Q(status=JoinRequestStatus.PENDING)
                        & models.Q(reviewed_at__isnull=False)
                    )
                ),
                name="join_request_reviewed_at_matches_status",
            ),
        ]
        indexes = [
            models.Index(fields=["team", "status"]),
            models.Index(fields=["user", "status"]),
        ]

    def __str__(self) -> str:
        return f"{self.user} -> {self.team} ({self.status})"

    # ------------------------------------------------------------------
    # Pure predicate
    # ------------------------------------------------------------------

    @property
    def is_pending(self) -> bool:
        return self.status == JoinRequestStatus.PENDING

    # ------------------------------------------------------------------
    # Single-row state changes. Approving a request also requires
    # activating a TeamMembership under a roster-capacity lock — that
    # cross-model step lives in teams.services.join_request_service,
    # not here. This method only records the review outcome on this
    # row.
    # ------------------------------------------------------------------

    def approve(self, *, reviewed_by, save: bool = True) -> None:
        self.status = JoinRequestStatus.APPROVED
        self.reviewed_by = reviewed_by
        self.reviewed_at = timezone.now()
        if save:
            self.save(update_fields=["status", "reviewed_by", "reviewed_at"])

    def reject(self, *, reviewed_by, save: bool = True) -> None:
        self.status = JoinRequestStatus.REJECTED
        self.reviewed_by = reviewed_by
        self.reviewed_at = timezone.now()
        if save:
            self.save(update_fields=["status", "reviewed_by", "reviewed_at"])

    def cancel(self, *, save: bool = True) -> None:
        """Requester withdraws their own request. No reviewed_by —
        this wasn't reviewed by anyone, it was self-withdrawn — but
        reviewed_at is still stamped so the status/timestamp
        constraint above holds and the timeline is complete.
        """
        self.status = JoinRequestStatus.CANCELLED
        self.reviewed_at = timezone.now()
        if save:
            self.save(update_fields=["status", "reviewed_at"])
