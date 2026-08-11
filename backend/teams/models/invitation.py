import secrets
import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone

from ...core.utils.choices  import InvitationStatus, InvitationType


def generate_invite_token() -> str:
    """URL-safe, non-guessable token for LINK-type invitations (also
    used to render the QR code — QR is a rendering of the same link,
    not a separate mechanism, per spec §13).
    """
    return secrets.token_urlsafe(32)


def generate_join_code() -> str:
    """Short human-typeable code suffix, e.g. '82KF'. Any team-name
    prefix ('LIONS-82KF') is a presentation concern for the service
    layer; this only guarantees the random suffix's entropy.
    """
    return secrets.token_hex(4).upper()


class TeamInvitationQuerySet(models.QuerySet):
    def pending(self):
        return self.filter(status=InvitationStatus.PENDING)

    def direct(self):
        return self.filter(invitation_type=InvitationType.DIRECT)

    def reusable(self):
        """LINK/CODE invitations — the ones that can be redeemed by
        more than one person, as opposed to DIRECT which targets
        exactly one user.
        """
        return self.filter(
            invitation_type__in=[InvitationType.LINK, InvitationType.CODE]
        )

    def for_team(self, team):
        return self.filter(team=team)

    def for_invited_user(self, user):
        return self.filter(invited_user=user)

    def pending_for_team_and_user(self, team, user):
        return self.for_team(team).for_invited_user(user).pending()

    def not_yet_expired(self):
        now = timezone.now()
        return self.filter(models.Q(expires_at__isnull=True) | models.Q(expires_at__gte=now))

    def past_expiry(self):
        return self.pending().filter(
            expires_at__isnull=False, expires_at__lt=timezone.now()
        )

    def by_token(self, token: str):
        return self.filter(token=token)

    def by_code(self, code: str):
        return self.filter(code=code)


TeamInvitationManager = models.Manager.from_queryset(TeamInvitationQuerySet)


class TeamInvitation(models.Model):
    """An invitation is NOT membership — it represents 'Team X invited
    User Y', or for LINK/CODE, 'Team X issued a redeemable invite'.

    Two shapes share this model, distinguished by `invitation_type`
    and enforced at the DB level by the `invitation_fields_match_type`
    constraint below:

    - DIRECT: targets exactly one user (`invited_user` set at
      creation). Single redemption — `status` moves straight from
      PENDING to ACCEPTED/DECLINED/CANCELLED/EXPIRED and that's the
      end of its life.
    - LINK / CODE: targets nobody in particular. `invited_user` stays
      NULL forever. `token`/`code` is redeemable by any number of
      different users — see TeamInvitationRedemption — until it hits
      `max_uses`, expires, or is cancelled. `status` on a reusable
      invitation only ever reflects PENDING (open) / CANCELLED /
      EXPIRED; ACCEPTED/DECLINED are meaningless for it and belong to
      individual TeamInvitationRedemption rows instead.

    This model does not decide whether a redemption should be allowed
    right now (expired? exhausted? user already a member?) — that is
    read via the properties below, but ACTING on that read (locking
    the team row, creating the membership, writing the redemption
    row) is cross-model orchestration and belongs to the service
    layer.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    team = models.ForeignKey(
        "teams.Team",
        on_delete=models.CASCADE,
        related_name="invitations",
    )

    invitation_type = models.CharField(
        max_length=10,
        choices=InvitationType.choices,
    )

    # Only ever set for DIRECT. NULL for LINK/CODE by construction —
    # see the type/field CheckConstraint below.
    invited_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="team_invitations_received",
        null=True,
        blank=True,
    )
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="team_invitations_sent",
    )

    token = models.CharField(max_length=64, unique=True, null=True, blank=True)
    code = models.CharField(max_length=20, unique=True, null=True, blank=True)

    status = models.CharField(
        max_length=10,
        choices=InvitationStatus.choices,
        default=InvitationStatus.PENDING,
    )

    # NULL = unlimited redemptions until expiry/cancellation.
    # Meaningless for DIRECT (which is inherently single-use via its
    # own status field) — left NULL there by convention.
    max_uses = models.PositiveIntegerField(null=True, blank=True)

    # Denormalized counter mirroring COUNT(redemptions). Kept in sync
    # by the service layer under a row lock (same pattern as roster
    # capacity), not by a model method, since incrementing this AND
    # creating a TeamInvitationRedemption row is one atomic operation
    # across two models. Existing here lets `remaining_uses` below
    # answer instantly without a COUNT query on every read.
    redemption_count = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    # Only meaningful for DIRECT — the moment it was accepted/
    # declined/cancelled. For reusable LINK/CODE invitations this
    # stays NULL while status=PENDING and is only set if the whole
    # invitation is cancelled/expired (not on each redemption).
    responded_at = models.DateTimeField(null=True, blank=True)

    objects = TeamInvitationManager()

    class Meta:
        db_table = "teams_teaminvitation"
        verbose_name = "Team Invitation"
        verbose_name_plural = "Team Invitations"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["team", "invited_user"],
                condition=models.Q(
                    status=InvitationStatus.PENDING,
                    invitation_type=InvitationType.DIRECT,
                ),
                name="uniq_pending_direct_invite_per_team_user",
            ),
            # DB-level backstop for the type/field shape described in
            # the class docstring. Without this, nothing stops a
            # LINK invitation being saved with invited_user set and
            # no token, or a DIRECT invitation with a token — a bug
            # that model validators alone would miss on bulk_create,
            # raw SQL, or a future data migration.
            models.CheckConstraint(
                condition=(
                    models.Q(
                        invitation_type=InvitationType.DIRECT,
                        invited_user__isnull=False,
                        token__isnull=True,
                        code__isnull=True,
                    )
                    | models.Q(
                        invitation_type=InvitationType.LINK,
                        invited_user__isnull=True,
                        token__isnull=False,
                        code__isnull=True,
                    )
                    | models.Q(
                        invitation_type=InvitationType.CODE,
                        invited_user__isnull=True,
                        token__isnull=True,
                        code__isnull=False,
                    )
                ),
                name="invitation_fields_match_type",
            ),
            models.CheckConstraint(
                condition=models.Q(max_uses__isnull=True) | models.Q(max_uses__gte=1),
                name="invitation_max_uses_positive_or_unlimited",
            ),
            # Backstop against redemption_count ever being recorded
            # past max_uses, even though the real race is prevented
            # by a row lock in the service layer at write time.
            models.CheckConstraint(
                condition=models.Q(max_uses__isnull=True)
                | models.Q(redemption_count__lte=models.F("max_uses")),
                name="invitation_redemption_count_within_max_uses",
            ),
        ]
        indexes = [
            models.Index(fields=["token"]),
            models.Index(fields=["code"]),
            models.Index(fields=["team", "status"]),
            models.Index(fields=["invited_user", "status"]),
            models.Index(fields=["status", "expires_at"]),
        ]

    def __str__(self) -> str:
        target = self.invited_user or f"[{self.invitation_type} invite]"
        return f"{self.team} -> {target} ({self.status})"

    # ------------------------------------------------------------------
    # Pure predicates — derived only from this row's own fields.
    # ------------------------------------------------------------------

    @property
    def is_direct(self) -> bool:
        return self.invitation_type == InvitationType.DIRECT

    @property
    def is_reusable(self) -> bool:
        return self.invitation_type in (InvitationType.LINK, InvitationType.CODE)

    @property
    def is_pending(self) -> bool:
        return self.status == InvitationStatus.PENDING

    @property
    def is_expired(self) -> bool:
        return bool(
            self.is_pending
            and self.expires_at
            and self.expires_at < timezone.now()
        )

    @property
    def remaining_uses(self):
        """None means unlimited. Only meaningful for reusable
        invitations; DIRECT invitations don't use this concept.
        """
        if self.max_uses is None:
            return None
        return max(self.max_uses - self.redemption_count, 0)

    @property
    def is_exhausted(self) -> bool:
        return self.max_uses is not None and self.redemption_count >= self.max_uses

    @property
    def is_redeemable(self) -> bool:
        """Whether this invitation could still be accepted right now,
        purely from its own fields. Does NOT check team roster
        capacity or whether the redeeming user is already a member —
        those require querying other models and are checked by the
        service layer at the moment of redemption.
        """
        return self.is_pending and not self.is_expired and not self.is_exhausted

    # ------------------------------------------------------------------
    # Single-row state changes only. Redeeming an invitation (creating
    # a TeamInvitationRedemption, incrementing redemption_count,
    # activating a TeamMembership) touches three models atomically and
    # belongs entirely to the service layer — not represented here.
    # ------------------------------------------------------------------

    def mark_accepted(self, *, save: bool = True) -> None:
        """DIRECT invitations only — a single, final acceptance."""
        self.status = InvitationStatus.ACCEPTED
        self.responded_at = timezone.now()
        if save:
            self.save(update_fields=["status", "responded_at"])

    def mark_declined(self, *, save: bool = True) -> None:
        self.status = InvitationStatus.DECLINED
        self.responded_at = timezone.now()
        if save:
            self.save(update_fields=["status", "responded_at"])

    def mark_cancelled(self, *, save: bool = True) -> None:
        self.status = InvitationStatus.CANCELLED
        self.responded_at = timezone.now()
        if save:
            self.save(update_fields=["status", "responded_at"])

    def mark_expired(self, *, save: bool = True) -> None:
        self.status = InvitationStatus.EXPIRED
        self.responded_at = timezone.now()
        if save:
            self.save(update_fields=["status", "responded_at"])


class TeamInvitationRedemption(models.Model):
    """One row per user who redeemed a reusable (LINK/CODE)
    TeamInvitation. Exists because the earlier, simpler design treated
    every invitation as single-use — which doesn't match how
    invite links actually get used in practice (one link, shared
    once, opened by several different players over days). This model
    is what lets a single TeamInvitation stay open and be redeemed by
    many different users, each producing their own TeamMembership,
    while still being individually auditable ("who used this link,
    and when").

    Deliberately NOT created for DIRECT invitations — a DIRECT
    invitation's own `status`/`responded_at` already fully describe
    its single acceptance event, so a redemption row would be pure
    duplication for that type.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    invitation = models.ForeignKey(
        TeamInvitation,
        on_delete=models.CASCADE,
        related_name="redemptions",
    )
    redeemed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="team_invitation_redemptions",
    )
    redeemed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "teams_teaminvitationredemption"
        verbose_name = "Team Invitation Redemption"
        verbose_name_plural = "Team Invitation Redemptions"
        ordering = ["-redeemed_at"]
        constraints = [
            # Scanning the same QR twice, or double-tapping the same
            # link, must not create two redemption rows or count
            # twice against max_uses for the same person.
            models.UniqueConstraint(
                fields=["invitation", "redeemed_by"],
                name="uniq_redemption_per_invitation_user",
            ),
        ]
        indexes = [
            models.Index(fields=["invitation"]),
            models.Index(fields=["redeemed_by"]),
        ]

    def __str__(self) -> str:
        return f"{self.redeemed_by} redeemed {self.invitation_id}"
