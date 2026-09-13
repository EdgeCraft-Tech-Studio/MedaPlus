from rest_framework import serializers

from .models import Match, MatchParticipant


class MatchSerializer(serializers.ModelSerializer):
    creator_team_id = serializers.UUIDField(source="creator_team.id", read_only=True)
    creator_team_name = serializers.CharField(source="creator_team.name", read_only=True)
    pitch_id = serializers.CharField(source="pitch.id", read_only=True)

    class Meta:
        model = Match
        fields = [
            "id",
            "status",
            "creator_team_id",
            "creator_team_name",
            "pitch_id",
            "start_time",
            "end_time",
            "description",
            "slots_needed",
            "price_per_slot",
            "confirmed_participant_count",
            "available_slots",
            "confirmed_at",
            "created_at",
        ]
        read_only_fields = fields


class MatchCreateSerializer(serializers.Serializer):
    pitch_id = serializers.CharField()
    start_time = serializers.DateTimeField()
    end_time = serializers.DateTimeField()
    description = serializers.CharField(required=False, allow_blank=True, default="")
    slots_needed = serializers.IntegerField(min_value=1)
    price_per_slot = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0)

    def validate(self, attrs):
        if attrs["end_time"] <= attrs["start_time"]:
            raise serializers.ValidationError("end_time must be after start_time.")
        return attrs


class MatchUpdateSerializer(serializers.Serializer):
    start_time = serializers.DateTimeField(required=False)
    end_time = serializers.DateTimeField(required=False)
    description = serializers.CharField(required=False, allow_blank=True)
    slots_needed = serializers.IntegerField(min_value=1, required=False)
    price_per_slot = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0, required=False)


class MatchParticipantSerializer(serializers.ModelSerializer):
    from team.serializers.common import UserSummarySerializer

    user = UserSummarySerializer(read_only=True)
    match_id = serializers.UUIDField(source="match.id", read_only=True)

    class Meta:
        model = MatchParticipant
        fields = ["id", "match_id", "user", "status", "amount_due", "joined_at", "status_changed_at"]
        read_only_fields = fields