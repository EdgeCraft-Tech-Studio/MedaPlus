from rest_framework import serializers

from ..models import Team
from .user_serilizer import UserSummarySerializer


class TeamListSerializer(serializers.ModelSerializer):
    """Compact representation for team discovery/list endpoints.
    Excludes description/settings/coordinates — those belong on the
    detail view, not a paginated list of 50 teams.
    """

    # `active_member_count`, `available_slots`, `is_full` and
    # `is_public` are plain @property attributes on the Team model
    # (not real DB columns). DRF's ModelSerializer auto-detects any
    # name in `fields` that isn't a model field but IS an attribute
    # on the model class, and maps it to a read-only field for you —
    # no explicit SerializerMethodField needed for simple properties.
    class Meta:
        model = Team
        fields = [
            "id",
            "slug",
            "name",
            "sport",
            "visibility",
            "status",
            "city",
            "area",
            "skill_level",
            "age_category",
            "logo",
            "max_roster_size",
            "active_member_count",
            "available_slots",
            "is_full",
            "created_at",
        ]
        read_only_fields = fields


class TeamDetailSerializer(serializers.ModelSerializer):
    """Full representation for a single team's detail page."""

    owner = serializers.SerializerMethodField()

    class Meta:
        model = Team
        fields = [
            "id",
            "slug",
            "name",
            "sport",
            "visibility",
            "status",
            "logo",
            "description",
            "city",
            "area",
            "latitude",
            "longitude",
            "skill_level",
            "age_category",
            "max_roster_size",
            "active_member_count",
            "available_slots",
            "is_full",
            "is_public",
            "is_private",
            "is_operable",
            "preferences",
            "owner",
            "version",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_owner(self, team: Team):
        """`get_owner_user()` is a regular method (not a @property),
        so it can't be auto-mapped the way the simple properties
        above are — DRF would try to serialize the bound method
        object itself. SerializerMethodField is the correct tool
        whenever the computed value needs a method call or, as here,
        needs to be run through another serializer.
        """
        owner_user = team.get_owner_user()
        if owner_user is None:
            return None
        return UserSummarySerializer(owner_user).data


class TeamCreateSerializer(serializers.ModelSerializer):
    """Input validation for team creation. Deliberately a
    ModelSerializer (for free field-level validation derived from the
    model — e.g. `max_roster_size`'s Min/MaxValueValidator) but with
    `create()` overridden to call the service layer instead of
    `Team.objects.create()`, because creating a team also requires
    creating the owner's TeamMembership atomically — that's cross-
    model orchestration and belongs in
    teams.services.team_service.create_team(), not here.
    """

    class Meta:
        model = Team
        fields = [
            "name",
            "sport",
            "visibility",
            "logo",
            "description",
            "area",
            "city",
            "skill_level",
            "age_category",
            "max_roster_size",
        ]

    def validate_name(self, value: str) -> str:
        """Format/UX validation only: trims whitespace and rejects a
        name that's blank once trimmed. Case-insensitive DUPLICATE
        checking is intentionally NOT duplicated here — the
        `uniq_team_name_ci_not_deleted` DB constraint is the actual
        source of truth; re-implementing it here would mean two
        places to keep in sync. A duplicate name still surfaces as a
        clean 400 to the client because the view's exception handler
        translates the resulting IntegrityError, not because this
        serializer pre-checked it.
        """
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Team name cannot be blank.")
        return value

    def create(self, validated_data):
        request = self.context["request"]
        from ..services import create_team

        return create_team(created_by=request.user, **validated_data)


class TeamUpdateSerializer(serializers.ModelSerializer):
    """Input validation for editing team settings (§22 of the spec).
    Requires the client to send back the `version` it last read, so a
    stale edit (someone else updated the team in between) is rejected
    instead of silently overwritten — see Team.version's docstring.

    Does NOT allow changing `visibility`, `status`, or
    `max_roster_size` here even though they're editable in principle —
    those have side effects worth their own dedicated actions
    (changing visibility affects discovery immediately; changing
    max_roster_size interacts with the roster-capacity lock; status
    changes like archive/suspend have different permission rules than
    "edit my team's description"). Keeping this serializer to purely
    cosmetic fields avoids a giant do-everything PATCH endpoint.
    """

    version = serializers.IntegerField()

    class Meta:
        model = Team
        fields = [
            "name",
            "logo",
            "description",
            "area",
            "city",
            "skill_level",
            "age_category",
            "version",
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
