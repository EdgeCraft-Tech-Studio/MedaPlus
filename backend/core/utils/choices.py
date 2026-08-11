from django.db import models


class SportType(models.TextChoices):
    """Only FOOTBALL is used today. Kept as a choices field (not a
    separate Sport table) because there is no per-sport configuration
    yet. If sports later need their own attributes (squad size rules,
    match duration, position lists), promote this to a real Sport
    model and swap the CharField for a ForeignKey.
    """

    FOOTBALL = "football", "Football"


class TeamVisibility(models.TextChoices):
    PUBLIC = "public", "Public"
    PRIVATE = "private", "Private"


class TeamStatus(models.TextChoices):
    """Distinct from `visibility`. Visibility controls discoverability;
    status controls whether the team is operable at all.

    Scenario this exists for: an owner archiving their own team (they
    stopped playing) is a completely different event from a moderator
    suspending a team for abuse/reported behaviour. Collapsing both
    into a single `is_active` boolean would make it impossible to
    tell those two cases apart later, or to build separate flows
    (owner can un-archive; only staff can un-suspend).
    """

    ACTIVE = "active", "Active"
    ARCHIVED = "archived", "Archived"
    SUSPENDED = "suspended", "Suspended"


class SkillLevel(models.TextChoices):
    BEGINNER = "beginner", "Beginner"
    INTERMEDIATE = "intermediate", "Intermediate"
    ADVANCED = "advanced", "Advanced"
    PROFESSIONAL = "professional", "Professional"


class AgeCategory(models.TextChoices):
    OPEN = "open", "Open"
    U18 = "u18", "Under 18"
    U21 = "u21", "Under 21"
    ADULT = "adult", "Adult"
    OTHER = "other", "Other"


class MembershipRole(models.TextChoices):
    OWNER = "owner", "Owner"
    ADMIN = "admin", "Admin"
    MEMBER = "member", "Member"


class MembershipStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    LEFT = "left", "Left"
    REMOVED = "removed", "Removed"


class MembershipSource(models.TextChoices):
    """How this membership row came to exist. The spec requires
    distinguishing 'search existing user', 'link', 'QR', 'code', and
    'public join request' as different pathways (§11-§17) — that
    distinction is worthless if it evaporates the moment membership
    goes ACTIVE. Keeping origin on the row itself means questions
    like 'what fraction of our roster came from join requests vs
    direct invites' don't require joining across tables whose rows
    may since have been pruned or lost their linkage.
    """

    TEAM_CREATION = "team_creation", "Created the team"
    DIRECT_INVITATION = "direct_invitation", "Accepted a direct invitation"
    LINK_INVITATION = "link_invitation", "Accepted a link invitation"
    CODE_INVITATION = "code_invitation", "Accepted a code invitation"
    JOIN_REQUEST = "join_request", "Approved public join request"
    OWNERSHIP_TRANSFER = "ownership_transfer", "Became owner via transfer"


class PreferredPosition(models.TextChoices):
    """Optional, football-specific. Not required by the roster spec,
    but a 'team roster' for football without positions is unusual
    enough in real products that it's worth reserving the field now —
    adding it later means an app-wide migration touching every
    existing membership row; adding it now as nullable costs nothing.
    """

    GOALKEEPER = "gk", "Goalkeeper"
    DEFENDER = "def", "Defender"
    MIDFIELDER = "mid", "Midfielder"
    FORWARD = "fwd", "Forward"
