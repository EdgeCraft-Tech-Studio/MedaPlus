import re

from rest_framework import serializers

from accounts.models import User
from accounts.serializer.user_serializer import validate_password_strength


# ─────────────────────────────────────────────────────────────────────────────
# 1. UPDATE PROFILE SERIALIZER
#    first_name and last_name only.
#    Both optional — send only what changed.
#
#    PATCH /accounts/me/
#    Body: { "first_name": "Dawit", "last_name": "Mekonnen" }
# ─────────────────────────────────────────────────────────────────────────────

class UpdateProfileSerializer(serializers.ModelSerializer):
    """
    PATCH /accounts/me/
    Updates first_name and/or last_name.
    View uses UserSerializer for response — NOT to_representation() —
    so Flutter receives the full user object not just these two fields.
    """

    first_name = serializers.CharField(
        max_length=50,
        required=False,
        help_text='User first name. Letters only. Min 2 characters.'
    )
    last_name = serializers.CharField(
        max_length=50,
        required=False,
        help_text='User last name. Letters only. Min 2 characters.'
    )

    class Meta:
        model  = User
        fields = ['first_name', 'last_name']

    def validate_first_name(self, value: str) -> str:
        value = value.strip()
        if not value:
            raise serializers.ValidationError('First name cannot be empty.')
        if len(value) < 2:
            raise serializers.ValidationError(
                'First name must be at least 2 characters.'
            )
        if not value.replace(' ', '').replace('-', '').isalpha():
            raise serializers.ValidationError(
                'First name must contain letters only. '
                'Hyphens allowed for double-barrelled names.'
            )
        return ' '.join(word.capitalize() for word in value.split())

    def validate_last_name(self, value: str) -> str:
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Last name cannot be empty.')
        if len(value) < 2:
            raise serializers.ValidationError(
                'Last name must be at least 2 characters.'
            )
        if not value.replace(' ', '').replace('-', '').isalpha():
            raise serializers.ValidationError(
                'Last name must contain letters only. '
                'Hyphens allowed for double-barrelled names.'
            )
        return ' '.join(word.capitalize() for word in value.split())

    def validate(self, attrs: dict) -> dict:
        if not attrs:
            raise serializers.ValidationError(
                'At least one field (first_name or last_name) must be provided.'
            )
        user = self.instance
        if user:
            new_first = attrs.get('first_name', user.first_name)
            new_last  = attrs.get('last_name',  user.last_name)
            if new_first == user.first_name and new_last == user.last_name:
                raise serializers.ValidationError(
                    'No changes detected. Values are identical to current values.'
                )
        return attrs

    def update(self, instance: User, validated_data: dict) -> User:
        instance.first_name = validated_data.get('first_name', instance.first_name)
        instance.last_name  = validated_data.get('last_name',  instance.last_name)
        instance.save(update_fields=['first_name', 'last_name'])
        return instance


# ─────────────────────────────────────────────────────────────────────────────
# 2. UPDATE PROFILE PHOTO SERIALIZER
#    multipart/form-data — cannot use regular JSON PATCH.
#    Validates file size (max 5MB) and type before storage.
#    Deletes old photo from S3 before saving new one.
#    Returns profile_photo_url so Flutter updates avatar immediately.
#
#    PATCH /accounts/me/photo/
#    Content-Type: multipart/form-data
#    Body: { "profile_photo": <file> }
# ─────────────────────────────────────────────────────────────────────────────

class UpdateProfilePhotoSerializer(serializers.ModelSerializer):
    """
    PATCH /accounts/me/photo/
    Accepts image file upload.
    Old photo deleted from S3 before saving new one.
    """

    profile_photo     = serializers.ImageField(
        required=True,
        help_text='Profile photo. JPEG, PNG, or WebP. Max 5MB.'
    )
    profile_photo_url = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model  = User
        fields = ['profile_photo', 'profile_photo_url']

    def get_profile_photo_url(self, obj: User) -> str | None:
        """
        Returns absolute URL of the profile photo.
        request context required — returns https://... not /media/...
        """
        if not obj.profile_photo:
            return None
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(obj.profile_photo.url)
        return obj.profile_photo.url

    def validate_profile_photo(self, image) -> object:
        """
        Validates file size and content type.
        content_type check prevents renaming .exe to .jpg and uploading.
        Minimum size check rejects corrupt or empty files.
        """
        max_size_mb   = 5
        allowed_types = ['image/jpeg', 'image/png', 'image/webp']

        if image.size > max_size_mb * 1024 * 1024:
            raise serializers.ValidationError(
                f'Profile photo must be smaller than {max_size_mb}MB. '
                f'Your file is {image.size // (1024 * 1024)}MB.'
            )
        if image.content_type not in allowed_types:
            raise serializers.ValidationError(
                f'Unsupported file type: {image.content_type}. '
                f'Only JPEG, PNG, and WebP images are accepted.'
            )
        if image.size < 1024:
            raise serializers.ValidationError(
                'File is too small to be a valid image.'
            )
        return image

    def update(self, instance: User, validated_data: dict) -> User:
        # delete old photo from S3 before saving new one
        # prevents orphaned files accumulating in storage bucket
        if instance.profile_photo:
            instance.profile_photo.delete(save=False)
        instance.profile_photo = validated_data['profile_photo']
        instance.save(update_fields=['profile_photo'])
        return instance


# ─────────────────────────────────────────────────────────────────────────────
# 3. UPDATE EMAIL SERIALIZER
#    Email is optional on this platform — phone is primary auth.
#    Validates format and uniqueness.
#    Excludes current user from uniqueness check — avoids false conflict
#    if user re-submits their own email.
#
#    PATCH /accounts/me/email/
#    Body: { "email": "user@example.com" }
# ─────────────────────────────────────────────────────────────────────────────

class UpdateEmailSerializer(serializers.ModelSerializer):
    """
    PATCH /accounts/me/email/
    Updates optional email field.
    View uses UserSerializer for response so Flutter gets full user object.
    """

    email = serializers.EmailField(
        required=True,
        max_length=254,  # RFC 5321 max email length
        help_text='Valid email. Must be unique across all active users.'
    )

    class Meta:
        model  = User
        fields = ['email']

    def validate_email(self, value: str) -> str:
        value        = value.strip().lower()
        current_user = self.context['request'].user

        # check not identical to current email
        if current_user.email and current_user.email.lower() == value:
            raise serializers.ValidationError(
                'This is already your current email address.'
            )

        # check uniqueness — exclude current user
        conflict = (
            User.objects
            .filter(email=value, deleted_at__isnull=True)
            .exclude(id=current_user.id)
            .exists()
        )
        if conflict:
            raise serializers.ValidationError(
                'This email address is already in use by another account.'
            )

        return value

    def update(self, instance: User, validated_data: dict) -> User:
        instance.email = validated_data['email']
        instance.save(update_fields=['email'])
        return instance


# ─────────────────────────────────────────────────────────────────────────────
# 4. CHANGE PASSWORD SERIALIZER
#    Requires current password to prevent unauthorized changes.
#    Validates new password strength.
#    Confirms new password matches.
#    On success: view calls profile_service.change_password() which
#    updates password and revokes all other active sessions.
#
#    POST /accounts/me/change-password/
#    Body: {
#        "current_password": "...",
#        "new_password": "...",
#        "confirm_password": "..."
#    }
# ─────────────────────────────────────────────────────────────────────────────

class ChangePasswordSerializer(serializers.Serializer):
    """
    POST /accounts/me/change-password/
    Validates password change input.
    Actual password update and session revocation in profile_service.
    """

    current_password = serializers.CharField(
        write_only=True,
        required=True,
        style={'input_type': 'password'},
        help_text='Current account password.'
    )
    new_password = serializers.CharField(
        write_only=True,
        required=True,
        style={'input_type': 'password'},
        help_text='New password. Must meet strength requirements.'
    )
    confirm_password = serializers.CharField(
        write_only=True,
        required=True,
        style={'input_type': 'password'},
        help_text='Must match new_password exactly.'
    )

    def validate_current_password(self, value: str) -> str:
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError('Current password is incorrect.')
        return value

    def validate_new_password(self, value: str) -> str:
        return validate_password_strength(value)

    def validate(self, attrs: dict) -> dict:
        if attrs['new_password'] != attrs['confirm_password']:
            raise serializers.ValidationError({
                'confirm_password': 'Passwords do not match.'
            })
        # use check_password not string compare — works against the hash
        user = self.context['request'].user
        if user.check_password(attrs['new_password']):
            raise serializers.ValidationError({
                'new_password': 'New password must be different from current password.'
            })
        return attrs


# ─────────────────────────────────────────────────────────────────────────────
# 5. UPDATE FCM TOKEN SERIALIZER
#    Validates FCM token format before storing in DeviceToken.
#    Same validation rules as DeviceInfoMixin.validate_fcm_token()
#    so token quality is consistent whether token arrives at login
#    or post-login via this endpoint.
#
#    PATCH /accounts/me/fcm-token/
#    Body: { "fcm_token": "firebase-token-string" }
# ─────────────────────────────────────────────────────────────────────────────

class UpdateFCMTokenSerializer(serializers.Serializer):
    """
    PATCH /accounts/me/fcm-token/
    Validates and accepts a new Firebase FCM token.
    Called by Flutter after Firebase initializes post-login,
    or whenever Firebase rotates the token.
    """

    fcm_token = serializers.CharField(
        required=True,
        help_text=(
            'Firebase Cloud Messaging token from firebase_messaging package. '
            'Min 100 characters. Alphanumeric, hyphens, underscores, colons only.'
        )
    )

    def validate_fcm_token(self, value: str) -> str:
        value = value.strip()

        if not value:
            raise serializers.ValidationError('FCM token cannot be empty.')

        # reject placeholder values developers accidentally send
        blocked = {
            'null', 'undefined', 'none', 'fcm_token',
            'token', 'test', 'dummy'
        }
        if value.lower() in blocked:
            raise serializers.ValidationError(
                'FCM token appears to be a placeholder. Send a real Firebase token.'
            )

        # real FCM tokens are always at least 100 characters
        if len(value) < 100:
            raise serializers.ValidationError(
                'FCM token appears invalid — too short to be a real Firebase token.'
            )

        # FCM tokens only contain alphanumeric, hyphens, underscores, colons
        if not re.match(r'^[a-zA-Z0-9\-_:]+$', value):
            raise serializers.ValidationError(
                'FCM token contains invalid characters.'
            )

        return value