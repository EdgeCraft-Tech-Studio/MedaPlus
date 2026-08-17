from datetime import timedelta

from django.contrib.auth import get_user_model
from rest_framework import serializers

from team.serializers.team import TeamListSerializer

from ..models import TeamInvitation, TeamInvitationRedemption
from .common import UserSummarySerializer

User = get_user_model()

MAX_INVITATION_TTL = timedelta(days=30)


class TeamInvitationSerializer(serializers.ModelSerializer):
    """Read representation covering all three invitation shapes
    (DIRECT / LINK / CODE). Fields irrelevant to a given type will
    simply be null — e.g. `token` is always null on a DIRECT
    invitation, `invited_user` is always null on a LINK invitation —
    rather than using three separate read serializers, since clients
    (e.g. a 'Pending Invitations' list per §20) render mixed-type
    invitations in one list and shouldn't need to branch on shape.
    """

    invited_user = UserSummarySerializer(read_only=True)
    invited_by = UserSummarySerializer(read_only=True)
    team_id = serializers.UUIDField(source="team.id", read_only=True)

    class Meta:
        model = TeamInvitation
        fields = [
            "id",
            "team_id",
            "invitation_type",
            "invited_user",
            "invited_by",
            "status",
            "max_uses",
            "redemption_count",
            "remaining_uses",
            "is_expired",
            "is_exhausted",
            "is_redeemable",
            "created_at",
            "expires_at",
            "responded_at",
        ]
        read_only_fields = fields
        # NOTE: `token` and `code` are intentionally excluded from
        # this read serializer. They're secrets — a general "list my
        # team's pending invitations" endpoint should not leak the
        # redeemable token/code to anyone who can view the list
        # (e.g. any team admin browsing pending invites shouldn't be
        # able to read out and redistribute another admin's invite
        # link). Expose them only via the dedicated share-link/QR
        # endpoint that returns the freshly created invitation.


class TeamInvitationShareSerializer(TeamInvitationSerializer):
    """Same as TeamInvitationSerializer, but WITH the token/code
    exposed. Use this ONLY as the response to the create-link/
    create-code endpoint, immediately after generation, so the
    caller (who is by definition the admin who just created it) can
    render the shareable URL/QR — never for listing existing
    invitations.
    """

    class Meta(TeamInvitationSerializer.Meta):
        fields = TeamInvitationSerializer.Meta.fields + ["token", "code"]
        read_only_fields = fields


class TeamDirectInvitationCreateSerializer(serializers.Serializer):
    """Input for Method 1 — inviting a specific, already-registered
    user (§11). A plain Serializer, not ModelSerializer: creation
    involves duplicate/already-a-member checks against OTHER models
    (TeamMembership, other pending TeamInvitations), which is exactly
    the cross-model orchestration that belongs in
    teams.services.invitation_service.create_direct_invitation(), not
    in serializer validation.
    """

    invited_user_id = serializers.PrimaryKeyRelatedField(queryset=User.objects.all())
    expires_in_days = serializers.IntegerField(
        required=False, min_value=1, max_value=MAX_INVITATION_TTL.days
    )


class TeamLinkInvitationCreateSerializer(serializers.Serializer):
    """Input for Method 2 — generating a shareable link (§12), also
    used to render the QR code for Method 3 (§13) since QR reuses the
    same token per spec. `max_uses=None` means unlimited redemptions
    until expiry/revocation.
    """

    max_uses = serializers.IntegerField(required=False, min_value=1, allow_null=True)
    expires_in_days = serializers.IntegerField(required=True, min_value=1, max_value=3)


class TeamCodeInvitationCreateSerializer(serializers.Serializer):
    """Input for Method 4 — a short human-typeable join code (§14)."""

    max_uses = serializers.IntegerField(required=False, min_value=1, allow_null=True)
    expires_in_days = serializers.IntegerField(required=True, min_value=1, max_value=3)

class TeamInvitationUpdateSerializer(serializers.Serializer):
    """Input for editing an existing LINK/CODE invitation — expiry,
    usage cap, and optionally regenerating the token/code itself
    (invalidating the old one immediately)."""

    max_uses = serializers.IntegerField(required=False, min_value=1, allow_null=True)
    expires_in_days = serializers.IntegerField(required=False, min_value=1, max_value=3)
    regenerate = serializers.BooleanField(required=False, default=False)


class InvitationRedeemByCodeSerializer(serializers.Serializer):
    """Input for a player typing a join code into the app (§14). Only
    resolves and validates the CODE's basic shape here — whether it
    actually exists, is still redeemable, and the redeeming user can
    be activated as a member is checked in
    teams.services.invitation_service against the real
    TeamInvitation row, not against this input alone.
    """

    code = serializers.CharField(max_length=20)

    def validate_code(self, value: str) -> str:
        return value.strip().upper()


class TeamInvitationRedemptionSerializer(serializers.ModelSerializer):
    """Read representation of a single redemption of a reusable
    LINK/CODE invitation — 'who used this link, and when' (see
    TeamInvitationRedemption's docstring for why this exists as its
    own model rather than overloading TeamInvitation.status).
    """

    redeemed_by = UserSummarySerializer(read_only=True)
    invitation_id = serializers.UUIDField(source="invitation.id", read_only=True)

    class Meta:
        model = TeamInvitationRedemption
        fields = ["id", "invitation_id", "redeemed_by", "redeemed_at"]
        read_only_fields = fields


# serializers/invitation.py — add this class
class InvitationPreviewSerializer(serializers.ModelSerializer):
    """Preview shown before a user commits to redeeming a link/code —
    includes the target team's basic info so the person can see what
    they're about to join.
    """

    team = TeamListSerializer(read_only=True)
    invited_by = UserSummarySerializer(read_only=True) 

    class Meta:
        model = TeamInvitation
        fields = [
            "id", "invitation_type", "team", "invited_by",
            "status", "is_expired", "is_exhausted", "is_redeemable", "expires_at",
        ]
        read_only_fields = fields



# serializers/invitation.py — add
class JoinRequestViaCodeSerializer(serializers.Serializer):
    """Input for requesting to join a team using a join code, WITHOUT
    instantly redeeming it (unlike InvitationRedeemByCodeSerializer).
    Creates a TeamJoinRequest for owner/admin review instead of
    immediate membership — the code only proves the requester knows
    about this team; it doesn't bypass approval.
    """

    code = serializers.CharField(max_length=20)
    message = serializers.CharField(
        max_length=500, required=False, allow_blank=True, default=""
    )

    def validate_code(self, value: str) -> str:
        return value.strip().upper()