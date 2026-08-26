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


class InvitationType(models.TextChoices):
    """Which of the three invitation pathways (§11-§14 of your spec)
    this row represents. DIRECT targets one searched user; LINK/CODE
    are reusable and target nobody in particular until redeemed.
    """

    DIRECT = "direct", "Direct (searched user)"
    LINK = "link", "Shareable link / QR"
    CODE = "code", "Short join code"


class InvitationStatus(models.TextChoices):
    """For DIRECT: the full lifecycle of a single-target invite. For
    reusable LINK/CODE invitations, only PENDING/CANCELLED/EXPIRED
    are ever used — ACCEPTED/DECLINED don't apply since many
    different users can redeem the same reusable invitation without
    it ever "closing."
    """

    PENDING = "pending", "Pending"
    ACCEPTED = "accepted", "Accepted"
    DECLINED = "declined", "Declined"
    CANCELLED = "cancelled", "Cancelled"
    EXPIRED = "expired", "Expired"


class JoinRequestStatus(models.TextChoices):
    """Lifecycle of a public-team join request (§16-17) — distinct
    from InvitationStatus because a join request is initiated by the
    player, not the team, and has no ACCEPTED/DECLINED states, only
    APPROVED/REJECTED (by an owner/admin) or CANCELLED (by the
    requester withdrawing it themselves).
    """

    PENDING = "pending", "Pending"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"
    CANCELLED = "cancelled", "Cancelled"



class ChatMessageType(models.TextChoices):
    """TEXT is every normal user-sent message. AUDIO is a Telegram-
    style voice note — the file itself, not text. SYSTEM is reserved
    for Telegram/Slack-style inline events ('Kebede joined the team')
    — not implemented yet, but adding the enum value now means those
    events can post into the same message stream later without a
    schema change or a second mechanism bolted on afterward.
    """
 
    TEXT = "text", "Text"
    AUDIO = "audio", "Audio"
    SYSTEM = "system", "System"
 