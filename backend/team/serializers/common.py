from django.contrib.auth import get_user_model
from rest_framework import serializers

User = get_user_model()


class UserSummarySerializer(serializers.ModelSerializer):
    """Minimal, read-only representation of a user for embedding
    inside team/membership/invitation payloads.
    """

    profile_photo_url = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "first_name", "last_name", "profile_photo_url"]
        read_only_fields = fields

    def get_profile_photo_url(self, obj: User) -> str | None:
        if not obj.profile_photo:
            return None
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(obj.profile_photo.url)
        return obj.profile_photo.url