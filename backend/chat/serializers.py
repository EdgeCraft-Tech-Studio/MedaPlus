from rest_framework import serializers

from team.serializers.common import UserSummarySerializer

from core.utils.choices import ChatMessageType
from .models import (
    MAX_AUDIO_DURATION_SECONDS,
    MAX_MESSAGE_LENGTH,
    TeamChatMessage,
)


class TeamChatMessageSerializer(serializers.ModelSerializer):
  
    sender = UserSummarySerializer(read_only=True)
    team_id = serializers.UUIDField(source="team.id", read_only=True)
    content = serializers.SerializerMethodField()
    audio_url = serializers.SerializerMethodField()

    class Meta:
        model = TeamChatMessage
        fields = [
            "id",
            "team_id",
            "sender",
            "message_type",
            "content",
            "audio_url",
            "audio_duration_seconds",
            "audio_mime_type",
            "audio_file_size_bytes",
            "is_deleted",
            "is_system_message",
            "is_audio_message",
            "edited_at",
            "created_at",
        ]
        read_only_fields = fields

    def get_content(self, obj: TeamChatMessage):
      
        if obj.is_deleted:
            return None
        return obj.content

    def get_audio_url(self, obj: TeamChatMessage):
      
        if obj.is_deleted or not obj.audio_file:
            return None
        from django.urls import reverse

        path = reverse(
            "chat:message-audio-file",
            kwargs={"team_slug": obj.team.slug, "pk": obj.id},
        )
        request = self.context.get("request")
        return request.build_absolute_uri(path) if request else path


class ChatTextMessageCreateSerializer(serializers.Serializer):
  

    content = serializers.CharField(max_length=MAX_MESSAGE_LENGTH)

    def validate_content(self, value: str) -> str:
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Message content cannot be blank.")
        return value


class ChatAudioMessageCreateSerializer(serializers.Serializer):
   
    audio_file = serializers.FileField()
    audio_duration_seconds = serializers.IntegerField(
        min_value=1, max_value=MAX_AUDIO_DURATION_SECONDS
    )

    def validate_audio_file(self, value):
        content_type = getattr(value, "content_type", "") or ""
        if not content_type.startswith("audio/"):
            raise serializers.ValidationError(
                "Uploaded file does not look like an audio file."
            )
        return value