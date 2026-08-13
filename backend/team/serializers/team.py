from rest_framework import serializers

from ..models import Team
from .common import UserSummarySerializer


class TeamListSerializer(serializers.ModelSerializer):
    """Compact representation for team discovery/list endpoints."""

    class Meta:
        model = Team
        fields = [
            "id", "slug", "name", "sport", "visibility", "status",
            "city", "area", "skill_level", "age_category", "logo",
            "max_roster_size", "active_member_count", "available_slots",
            "is_full", "created_at",
        ]
        read_only_fields = fields


class TeamMyListSerializer(TeamListSerializer):
    """Used by /teams/my/ — adds the current user's role on each team."""

    role = serializers.CharField(source="my_role", read_only=True)

    class Meta(TeamListSerializer.Meta):
        fields = TeamListSerializer.Meta.fields + ["role"]


class TeamDetailSerializer(serializers.ModelSerializer):
    """Full representation for a single team — used by both the public
    `retrieve` action and the owner/admin-only `dashboard` action.
    `my_role` is None for `retrieve` callers who aren't members, and
    always 'owner' or 'admin' for `dashboard` callers (enforced in the
    view, not here — this serializer just reports what it finds).
    """

    owner = serializers.SerializerMethodField()
    my_role = serializers.SerializerMethodField()

    class Meta:
        model = Team
        fields = [
            "id", "slug", "name", "sport", "visibility", "status",
            "logo", "description", "city", "area", "latitude", "longitude",
            "skill_level", "age_category", "preferred_days", "play_time",
            "max_roster_size", "active_member_count", "available_slots",
            "is_full", "is_public", "is_private", "is_operable",
            "preferences", "owner", "my_role", "version",
            "created_at", "updated_at",
        ]
        read_only_fields = fields

    def get_owner(self, team: Team):
        owner_user = team.get_owner_user()
        if owner_user is None:
            return None
        return UserSummarySerializer(owner_user).data

    def get_my_role(self, team: Team):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return None
        membership = team.memberships.active().for_user(request.user).first()
        return membership.role if membership else None


class TeamCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Team
        fields = [
            "id", "name", "logo", "description", "sport", "area",
            "skill_level", "preferred_days", "play_time", "age_category",
            "max_roster_size", "visibility",
        ]
        read_only_fields = ["id"]

    def validate_preferred_days(self, value):
        valid = {"mon", "tue", "wed", "thu", "fri", "sat", "sun"}
        if not isinstance(value, list) or not set(value).issubset(valid):
            raise serializers.ValidationError("Invalid day code.")
        return value

    def create(self, validated_data):
        request = self.context.get("request")
        if request is None:
            raise serializers.ValidationError("Request context is required.")
        from ..services import create_team
        return create_team(created_by=request.user, **validated_data)


class TeamUpdateSerializer(serializers.ModelSerializer):
    version = serializers.IntegerField()

    class Meta:
        model = Team
        fields = [
            "name", "logo", "description", "area", "city",
            "skill_level", "age_category", "version",
        ]

    def validate_version(self, value: int) -> int:
        if self.instance is not None and value != self.instance.version:
            raise serializers.ValidationError(
                "This team was modified by someone else since you last "
                "loaded it. Refresh and try again."
            )
        return value

    def update(self, instance: Team, validated_data):
        validated_data.pop("version", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.version = instance.version + 1
        instance.save(update_fields=[*validated_data.keys(), "version", "updated_at"])
        return instance