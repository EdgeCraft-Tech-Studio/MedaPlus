from django.contrib.auth import get_user_model
from rest_framework import serializers

User = get_user_model()


class UserSummarySerializer(serializers.ModelSerializer):
    """Minimal, read-only representation of a user for embedding
    inside team/membership/invitation payloads. Deliberately NOT the
    full user profile serializer — nobody requesting a team roster
    needs a teammate's email or auth internals.

    NOTE: `username` is assumed here as the display field. If your
    custom User model doesn't have `username` (e.g. it's phone-number
    only auth), replace the `fields` list below with whatever your
    User model actually exposes (e.g. `phone_number`, `full_name`).
    This file only needs a one-line edit to match your actual model.
    """

    class Meta:
        model = User
        fields = ["id", "username", "first_name", "last_name"]
        read_only_fields = fields
