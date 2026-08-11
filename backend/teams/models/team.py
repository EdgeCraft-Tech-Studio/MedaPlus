import uuid

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models.functions import Lower
from django.utils.text import slugify

from ...core.utils.choices  import AgeCategory, SkillLevel, SportType, TeamStatus, TeamVisibility

DEFAULT_MAX_ROSTER_SIZE = 25
MIN_ROSTER_SIZE = 1
MAX_ROSTER_SIZE_CAP = 50


class TeamQuerySet(models.QuerySet):
    """Query encapsulation only — every method here reads rows, it
    never mutates state or coordinates other models. If a field name
    changes, this is the only place a `.filter()` on that field
    exists outside this module.
    """

    def not_deleted(self):
        return self.filter(deleted_at__isnull=True)

    def operable(self):
        """Teams that are not soft-deleted and not suspended/archived —
        i.e. teams the rest of the product should treat as 'exists
        and works normally'.
        """
        return self.not_deleted().filter(status=TeamStatus.ACTIVE)

    def public(self):
        return self.filter(visibility=TeamVisibility.PUBLIC)

    def discoverable(self):
        """Teams eligible to appear in public discovery search."""
        return self.operable().public()

    def for_sport(self, sport: str):
        return self.filter(sport=sport)

    def in_area(self, city: str = None, area: str = None):
        qs = self
        if city:
            qs = qs.filter(city__iexact=city)
        if area:
            qs = qs.filter(area__iexact=area)
        return qs

    def owned_by(self, user):
        """Teams where `user` currently holds an ACTIVE owner membership."""
        from ...core.utils.choices  import MembershipRole, MembershipStatus

        return self.filter(
            memberships__user=user,
            memberships__role=MembershipRole.OWNER,
            memberships__status=MembershipStatus.ACTIVE,
        )

    def with_active_member_count(self):
        """Annotate each team with its live active-member count in a
        single query — use this for list views instead of touching
        the `.active_member_count` property per row, which would be
        an N+1 query.
        """
        from ...core.utils.choices  import MembershipStatus

        return self.annotate(
            active_member_count_annotated=models.Count(
                "memberships",
                filter=models.Q(memberships__status=MembershipStatus.ACTIVE),
                distinct=True,
            )
        )


class TeamManager(models.Manager.from_queryset(TeamQuerySet)):
    """Default manager excludes soft-deleted rows, matching the
    convention that `Team.objects` means 'teams that still exist'.
    Use `Team.all_objects` for admin/audit tooling that needs to see
    soft-deleted rows too.
    """

    def get_queryset(self):
        return super().get_queryset().filter(deleted_at__isnull=True)


class Team(models.Model):
    """A football team that users can belong to, book pitches with,
    and (later) register for tournaments.

    Ownership and membership are intentionally NOT modeled here.
    'Who owns this team' is derived from TeamMembership
    (role=OWNER, status=ACTIVE); see TeamMembership and its
    `owner_must_be_active` DB constraint for why this is enforced at
    two layers, not just in application code.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    name = models.CharField(max_length=100)

    # Slug is a SEPARATE stable identity from `name`. Scenario: a team
    # renames from "Addis Lions FC" to "Bole Lions FC" six months in.
    # Every match report, booking link, and shared invite URL that
    # embedded the old name in a URL would break if the URL were
    # derived from `name` live. The slug is generated once at
    # creation and never silently changes when `name` changes —
    # renaming the slug is a deliberate, explicit action if ever
    # needed, not an automatic side effect.
    slug = models.SlugField(max_length=140, unique=True, editable=False)

    sport = models.CharField(
        max_length=20,
        choices=SportType.choices,
        default=SportType.FOOTBALL,
    )

    visibility = models.CharField(
        max_length=10,
        choices=TeamVisibility.choices,
        default=TeamVisibility.PUBLIC,
        help_text="PUBLIC teams appear in discovery and accept join requests.",
    )

    status = models.CharField(
        max_length=10,
        choices=TeamStatus.choices,
        default=TeamStatus.ACTIVE,
        help_text="ARCHIVED = owner retired the team. SUSPENDED = platform action.",
    )

    logo = models.ImageField(upload_to="teams/logos/", null=True, blank=True)
    description = models.TextField(blank=True)

    area = models.CharField(
        max_length=100,
        blank=True,
        help_text="Neighbourhood / sub-city, e.g. 'Bole'.",
    )
    city = models.CharField(max_length=100, blank=True, default="Addis Ababa")

    # Nullable, optional coordinates. Not asked for in the spec (it
    # explicitly says no exact address needed), but reserving these
    # now means 'teams within N km of me' can be added later without
    # a schema migration on a table that will already have thousands
    # of rows by then.
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)

    skill_level = models.CharField(
        max_length=20,
        choices=SkillLevel.choices,
        blank=True,
    )
    age_category = models.CharField(
        max_length=10,
        choices=AgeCategory.choices,
        default=AgeCategory.OPEN,
        blank=True,
    )

    max_roster_size = models.PositiveSmallIntegerField(
        default=DEFAULT_MAX_ROSTER_SIZE,
        validators=[
            MinValueValidator(MIN_ROSTER_SIZE),
            MaxValueValidator(MAX_ROSTER_SIZE_CAP),
        ],
        help_text="Maximum number of ACTIVE members allowed on this team.",
    )

    # Per-team feature toggles that don't warrant their own columns
    # yet (e.g. {"auto_approve_join_requests": false,
    # "allow_direct_invites": true}). Scenario this solves: without
    # this, every small per-team preference the product grows needs
    # its own migration. With it, most new toggles are a service-layer
    # default + a key added here, no schema change. Deliberately NOT
    # used for anything that needs to be queried/filtered on at scale
    # (visibility, status, sport stay as real columns) — JSON fields
    # are for opaque preferences, not for anything you'll ever filter
    # a queryset by.
    #
    # Named `preferences`, NOT `settings` — a field called `settings`
    # shadows the imported `django.conf.settings` module inside this
    # class body, silently breaking any field defined below it that
    # references `settings.AUTH_USER_MODEL` or similar. This is a
    # real footgun specific to Django's own naming, not a style choice.
    preferences = models.JSONField(default=dict, blank=True)

    # Optimistic concurrency token. Scenario: owner opens team-edit
    # screen on their phone, forgets about it, edits the same team's
    # settings from their laptop an hour later, then goes back to the
    # phone tab and submits a stale form — silently overwriting the
    # laptop edit. Every update goes through
    # `Team.objects.filter(id=id, version=expected_version).update(...,
    # version=F("version") + 1)`; a 0-row update means someone else
    # got there first, and the caller (service layer) can surface a
    # conflict instead of silently clobbering data.
    version = models.PositiveIntegerField(default=0)

    # Soft delete instead of a boolean. Scenario: `is_active=False`
    # can't distinguish "never happened" from "happened, then
    # undone" from "permanently gone" — deleted_at gives you the
    # actual timestamp for audit/recovery, and `is_deleted` below
    # reads more clearly at call sites than double-negatives like
    # `not team.is_active`.
    deleted_at = models.DateTimeField(null=True, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="teams_created",
        help_text=(
            "Audit trail of who originally created the team. NOT the "
            "current owner — ownership can be transferred and always "
            "lives on TeamMembership."
        ),
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = TeamManager()
    all_objects = models.Manager.from_queryset(TeamQuerySet)()

    class Meta:
        db_table = "teams_team"
        verbose_name = "Team"
        verbose_name_plural = "Teams"
        ordering = ["-created_at"]
        constraints = [
            # Case-insensitive uniqueness among non-deleted teams only
            # — a deleted "Addis Lions FC" must not block someone else
            # from registering that name again.
            models.UniqueConstraint(
                Lower("name"),
                condition=models.Q(deleted_at__isnull=True),
                name="uniq_team_name_ci_not_deleted",
            ),
            # DB-level backstop mirroring the validators above. Model
            # validators only run through full_clean() (e.g. via a
            # ModelForm/DRF serializer); anything that writes via
            # bulk_create, raw SQL, a data migration, or a future
            # engineer who forgets to call full_clean() would bypass
            # them. This constraint cannot be bypassed.
            models.CheckConstraint(
                condition=models.Q(max_roster_size__gte=MIN_ROSTER_SIZE)
                & models.Q(max_roster_size__lte=MAX_ROSTER_SIZE_CAP),
                name="team_max_roster_size_within_bounds",
            ),
        ]
        indexes = [
            models.Index(fields=["visibility", "status"]),
            models.Index(fields=["sport"]),
            models.Index(fields=["city", "area"]),
            models.Index(fields=["deleted_at"]),
        ]

    def __str__(self) -> str:
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = self._generate_unique_slug()
        super().save(*args, **kwargs)

    def _generate_unique_slug(self) -> str:
        """Pure data-integrity concern (guaranteeing a required unique
        field is populated before the row is written) — not business
        logic about teams. Kept minimal on purpose: no request to an
        external service, no cross-model coordination.
        """
        base = slugify(self.name)[:120] or "team"
        candidate = base
        suffix = 1
        while Team.all_objects.filter(slug=candidate).exclude(pk=self.pk).exists():
            suffix += 1
            candidate = f"{base}-{suffix}"
        return candidate

    # ------------------------------------------------------------------
    # Pure derived properties — computed only from this row's own
    # fields, or a straightforward count of directly related rows.
    # No permission checks, no side effects, no orchestration.
    # ------------------------------------------------------------------

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None

    @property
    def is_public(self) -> bool:
        return self.visibility == TeamVisibility.PUBLIC

    @property
    def is_private(self) -> bool:
        return self.visibility == TeamVisibility.PRIVATE

    @property
    def is_archived(self) -> bool:
        return self.status == TeamStatus.ARCHIVED

    @property
    def is_suspended(self) -> bool:
        return self.status == TeamStatus.SUSPENDED

    @property
    def is_operable(self) -> bool:
        """Not deleted and not archived/suspended — i.e. safe for the
        rest of the product to treat as a normal, working team.
        """
        return not self.is_deleted and self.status == TeamStatus.ACTIVE

    @property
    def active_member_count(self) -> int:
        """Live count for a single-team detail view. For list views,
        use the queryset's `.with_active_member_count()` annotation
        instead to avoid N+1 queries.
        """
        from ...core.utils.choices  import MembershipStatus

        return self.memberships.filter(status=MembershipStatus.ACTIVE).count()

    @property
    def available_slots(self) -> int:
        return max(self.max_roster_size - self.active_member_count, 0)

    @property
    def is_full(self) -> bool:
        return self.active_member_count >= self.max_roster_size

    def get_owner_membership(self):
        """Read-only lookup of the current ACTIVE owner's membership
        row. A query, not an orchestration — safe to keep on the
        model rather than duplicating this filter at every call site.
        """
        from ...core.utils.choices  import MembershipRole, MembershipStatus

        return self.memberships.filter(
            role=MembershipRole.OWNER,
            status=MembershipStatus.ACTIVE,
        ).first()

    def get_owner_user(self):
        membership = self.get_owner_membership()
        return membership.user if membership else None
