from django.contrib.auth import get_user_model
from rest_framework import serializers

from ..models import MembershipRole, TeamMembership
from .user_serilizer import UserSummarySerializer

User = get_user_model()


class TeamMembershipSerializer(serializers.ModelSerializer):
    """Read representation of a single roster row. This is what
    populates 'Active Members' / 'Pending' lists per §20 of the spec.
    """

    user = UserSummarySerializer(read_only=True)
    team_id = serializers.UUIDField(source="team.id", read_only=True)

    class Meta:
        model = TeamMembership
        fields = [
            "id",
            "team_id",
            "user",
            "role",
            "status",
            "source",
            "jersey_number",
            "preferred_position",
            "joined_at",
            "status_changed_at",
            "last_active_at",
            "version",
        ]
        read_only_fields = fields


class TeamMembershipRosterUpdateSerializer(serializers.ModelSerializer):
    """Input for an OWNER/ADMIN editing a member's roster metadata —
    jersey number and preferred position. Deliberately excludes
    `role` and `status`: promoting/demoting is a permission-sensitive
    action with its own audit trail requirements (see
    TeamMembershipRoleUpdateSerializer below), and leaving/removing a
    member is a state transition, not a field edit — both are kept as
    separate, explicit actions rather than folded into a generic PATCH.
    """

    version = serializers.IntegerField()

    class Meta:
        model = TeamMembership
        fields = ["jersey_number", "preferred_position", "version"]

    def validate_jersey_number(self, value):
        if value is None:
            return value
        if not (1 <= value <= 99):
            raise serializers.ValidationError(
                "Jersey number must be between 1 and 99."
            )
        return value

    def validate_version(self, value: int) -> int:
        if self.instance is not None and value != self.instance.version:
            raise serializers.ValidationError(
                "This membership was modified by someone else since you "
                "last loaded it. Refresh and try again."
            )
        return value

    def update(self, instance: TeamMembership, validated_data):
        validated_data.pop("version", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.version = instance.version + 1
        instance.save(update_fields=[*validated_data.keys(), "version", "updated_at"])
        return instance


class TeamMembershipRoleUpdateSerializer(serializers.Serializer):
    """Input for promoting a member to ADMIN or demoting them back to
    MEMBER. A plain Serializer (not ModelSerializer) because this
    isn't a general field edit — it's one specific, permission-gated
    action, and the actual role-change + permission check belongs to
    teams.services.membership_service.promote_to_admin() /
    demote_to_member(), not to this serializer or the model.
    """

    role = serializers.ChoiceField(
        choices=[MembershipRole.ADMIN, MembershipRole.MEMBER]
    )


class OwnershipTransferSerializer(serializers.Serializer):
    """Input for the owner transferring ownership to another active
    member (§6, §26). Only carries the target user id — everything
    else (verifying the target is already an active member, swapping
    roles atomically) happens in
    teams.services.membership_service.transfer_ownership().
    """

    new_owner_id = serializers.PrimaryKeyRelatedField(queryset=User.objects.all())
