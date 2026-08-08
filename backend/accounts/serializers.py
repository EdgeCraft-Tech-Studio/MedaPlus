from rest_framework import serializers
from accounts.models.user import User, UserRole
from pitches.models import Tenant

class RegisterSerializer(serializers.Serializer):
    username = serializers.CharField(min_length=3, max_length=150)
    email = serializers.EmailField(required=False, allow_blank=True)
    password = serializers.CharField(min_length=6, write_only=True)
    role = serializers.ChoiceField(choices=[UserRole.OWNER, UserRole.PLAYER])

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("Username already exists.")
        return value

    def validate_email(self, value):
        if value and User.objects.filter(email=value).exists():
            raise serializers.ValidationError("Email already exists.")
        return value

    def create(self, validated_data):
        role = validated_data["role"]

        user = User.objects.create_user(
            username=validated_data["username"],
            email=validated_data.get("email", ""),
            password=validated_data["password"],
        )

        user.role = role
        # Players are approved immediately; owners require admin approval
        user.is_approved = (role == UserRole.PLAYER)
        user.save()

        if role == UserRole.OWNER:
            Tenant.objects.get_or_create(
                owner=user,
                defaults={
                    "name": f"{user.username}'s Business",
                    "is_active": True,
                    "is_approved": False,
                },
            )

        return user
