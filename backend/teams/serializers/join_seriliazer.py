from rest_framework import serializers

from ..models import TeamJoinRequest
from .user_serilizer import UserSummarySerializer

MAX_JOIN_REQUEST_MESSAGE_LENGTH = 500


class TeamJoinRequestSerializer(serializers.ModelSerializer):
    """Read representation for a join request — populates both the
    requester's 'my pending requests' view and the owner/admin's
    'Join Requests' review queue (§20).
    """

    user = UserSummarySerializer(read_only=True)
    reviewed_by = UserSummarySerializer(read_only=True)
    team_id = serializers.UUIDField(source="team.id", read_only=True)

    class Meta:
        model = TeamJoinRequest
        fields = [
            "id",
            "team_id",
            "user",
            "message",
            "status",
            "created_at",
            "reviewed_at",
            "reviewed_by",
            "version",
        ]
        read_only_fields = fields


class TeamJoinRequestCreateSerializer(serializers.Serializer):
    """Input for a player requesting to join a PUBLIC team (§16-17).
    A plain Serializer, not ModelSerializer: whether this request is
    even allowed depends on the target Team's visibility and the
    requester's existing membership/request state — cross-model
    checks that belong in
    teams.services.join_request_service.create_join_request(),
    including the private-team rejection required by §18.
    """

    message = serializers.CharField(
        max_length=MAX_JOIN_REQUEST_MESSAGE_LENGTH,
        required=False,
        allow_blank=True,
        default="",
    )

    def validate_message(self, value: str) -> str:
        return value.strip()
