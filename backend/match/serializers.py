from rest_framework import serializers

from team.serializers.common import UserSummarySerializer

from .choices import MatchType
from .models import Match, MatchParticipant


class MatchSerializer(serializers.ModelSerializer):
    """Read representation covering both match shapes — irrelevant
    fields for a given type are simply null, same reasoning as
    TeamInvitationSerializer covering DIRECT/LINK/CODE in one shape.
    """

    creator_team_id = serializers.UUIDField(source="creator_team.id", read_only=True)
    creator_team_name = serializers.CharField(source="creator_team.name", read_only=True)
    opponent_team_id = serializers.UUIDField(source="opponent_team.id", read_only=True, allow_null=True)
    opponent_team_name = serializers.CharField(source="opponent_team.name", read_only=True, allow_null=True)
    pitch_id = serializers.CharField(source="pitch.id", read_only=True)

    class Meta:
        model = Match
        fields = [
            "id",
            "match_type",
            "status",
            "creator_team_id",
            "creator_team_name",
            "opponent_team_id",
            "opponent_team_name",
            "pitch_id",
            "start_time",
            "end_time",
            "description",
            "total_price",
            "price_per_team",
            "slots_needed",
            "price_per_slot",
            "confirmed_participant_count",
            "available_slots",
            "confirmed_at",
            "created_at",
        ]
        read_only_fields = fields


class MatchCreateSerializer(serializers.Serializer):
    """One serializer for both match types, not two separate ones —
    the type-specific field set here is small enough (2-3 fields
    either way) that splitting it into TeamVsTeamCreateSerializer /
    OpenSlotsCreateSerializer would be more ceremony than it's worth.
    Shape is validated in `validate()`; the actual creation — including
    the schedule-conflict check — happens in match.services.create_match(),
    not here.
    """

    match_type = serializers.ChoiceField(choices=MatchType.choices)
    pitch_id = serializers.IntegerField()
    start_time = serializers.DateTimeField()
    end_time = serializers.DateTimeField()
    description = serializers.CharField(required=False, allow_blank=True, default="")

    total_price = serializers.DecimalField(
        max_digits=10, decimal_places=2, min_value=0, required=False, allow_null=True
    )
    slots_needed = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    price_per_slot = serializers.DecimalField(
        max_digits=10, decimal_places=2, min_value=0, required=False, allow_null=True
    )

    def validate(self, attrs):
        if attrs["end_time"] <= attrs["start_time"]:
            raise serializers.ValidationError("end_time must be after start_time.")

        if attrs["match_type"] == MatchType.TEAM_VS_TEAM:
            if attrs.get("total_price") is None:
                raise serializers.ValidationError({"total_price": "Required for a team-vs-team match."})
            if attrs.get("slots_needed") is not None or attrs.get("price_per_slot") is not None:
                raise serializers.ValidationError(
                    "slots_needed/price_per_slot don't apply to a team-vs-team match."
                )
        else:  # OPEN_SLOTS
            if attrs.get("slots_needed") is None or attrs.get("price_per_slot") is None:
                raise serializers.ValidationError(
                    "slots_needed and price_per_slot are both required for an open-slots match."
                )
            if attrs.get("total_price") is not None:
                raise serializers.ValidationError(
                    {"total_price": "Doesn't apply to an open-slots match."}
                )
        return attrs


class MatchUpdateSerializer(serializers.Serializer):
    """Same field set as create, all optional (partial update). Only
    valid while the match is still OPEN — enforced in the service,
    not here.
    """

    start_time = serializers.DateTimeField(required=False)
    end_time = serializers.DateTimeField(required=False)
    description = serializers.CharField(required=False, allow_blank=True)
    total_price = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0, required=False)
    slots_needed = serializers.IntegerField(min_value=1, required=False)
    price_per_slot = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0, required=False)


class AcceptChallengeSerializer(serializers.Serializer):
    """Which of the acting user's own teams is accepting — needed
    because a manager may run more than one team.
    """

    accepting_team_id = serializers.UUIDField()


class MatchParticipantSerializer(serializers.ModelSerializer):
    user = UserSummarySerializer(read_only=True)
    match_id = serializers.UUIDField(source="match.id", read_only=True)

    class Meta:
        model = MatchParticipant
        fields = ["id", "match_id", "user", "status", "amount_due", "joined_at", "status_changed_at"]
        read_only_fields = fields
