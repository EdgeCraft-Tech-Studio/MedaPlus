import re

from rest_framework import serializers

from accounts.models import User


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# Defined here, imported by auth_serializer.py too — single source of truth.
# Never duplicate these validators across files.
# ─────────────────────────────────────────────────────────────────────────────

def validate_phone_format(phone: str) -> str:
    """
    Validates international phone number format.
    Accepts : +251912345678 / +1234567890
    Rejects : letters, short numbers, missing +

    Ethiopian numbers: +2519XXXXXXXX (12 digits total)
    """
    phone = phone.strip()
    pattern = r'^\+[1-9]\d{7,14}$'
    if not re.match(pattern, phone):
        raise serializers.ValidationError(
            'Phone number must be in international format. Example: +251912345678'
        )
    return phone




def validate_password_strength(password: str) -> str:
    """
    Enforces strong password rules:
    - Minimum 8 characters
    - At least one uppercase letter
    - At least one lowercase letter
    - At least one digit
    - At least one special character

    Imported by ChangePasswordSerializer and auth_serializer.py.
    """
    if len(password) < 8:
        raise serializers.ValidationError(
            'Password must be at least 8 characters long.'
        )
    if not re.search(r'[A-Z]', password):
        raise serializers.ValidationError(
            'Password must contain at least one uppercase letter.'
        )
    if not re.search(r'[a-z]', password):
        raise serializers.ValidationError(
            'Password must contain at least one lowercase letter.'
        )
    if not re.search(r'\d', password):
        raise serializers.ValidationError(
            'Password must contain at least one number.'
        )
    if not re.search(r'[!@#$%^&*(),.?":{}|<>]', password):
        raise serializers.ValidationError(
            'Password must contain at least one special character.'
        )
    return password


# ─────────────────────────────────────────────────────────────────────────────
# 1. USER SERIALIZER
#    Safe read-only profile data returned to the user about themselves.
#    Used as a nested serializer inside login / signup / me responses.
#    Never expose password, blocked_until, failed_attempts here.
# ─────────────────────────────────────────────────────────────────────────────

class UserSerializer(serializers.ModelSerializer):
    """
    Read-only. Returned on:
    - GET  /accounts/me/
    - Nested inside LoginSerializer response
    - Nested inside SignupSerializer response
    """

    # Model @property fields — must be declared explicitly because
    # ModelSerializer does not auto-discover Python properties.
    full_name  = serializers.SerializerMethodField()
    is_blocked = serializers.BooleanField(read_only=True)
    is_deleted = serializers.BooleanField(read_only=True)

    # profile_photo returns the full URL, not a relative path.
    # SerializerMethodField gives us control to handle null safely.
    profile_photo_url = serializers.SerializerMethodField()

    class Meta:
        model  = User
        fields = [
            # identity
            'id',
            'first_name',
            'last_name',
            'full_name',
            'username', 
            'role',     
            'phone',
            'email',

            # photo
            'profile_photo_url',
            
            'is_approved',

            # account state
            'active',
            'is_blocked',
            'is_deleted',
            'must_change_password',

            # role / access flags
            'is_staff',
            'platform_admin',

            # audit timestamps
            'last_login_at',
            'created_at',
        ]
        read_only_fields = fields   # strictly read-only, never used for writes

    def get_full_name(self, obj: User) -> str:
        """
        Safe fallback — never raises even if first/last name is blank.
        Using SerializerMethodField instead of source='full_name' because
        source= on a CharField will propagate any exception the property
        raises directly to the serializer with no fallback opportunity.
        """
        return obj.full_name or obj.phone

    def get_profile_photo_url(self, obj: User) -> str | None:
        """
        Returns the absolute URL of the profile photo.
        Returns None if no photo has been set — Flutter handles this
        by showing the initials avatar instead.

        request must be passed in serializer context to build absolute URL:
        UserSerializer(user, context={'request': request})
        """
        if not obj.profile_photo:
            return None
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(obj.profile_photo.url)
        return obj.profile_photo.url


# ─────────────────────────────────────────────────────────────────────────────
# 2. ADMIN USER SERIALIZER
#    Extends UserSerializer with sensitive internal fields.
#    Only use inside admin-facing views gated by IsPlatformAdmin permission.
#    Never return this to regular users.
# ─────────────────────────────────────────────────────────────────────────────

class AdminUserSerializer(UserSerializer):
    """
    Returned on:
    - GET  /admin/users/{id}/          (platform admin only)
    - GET  /admin/users/               (platform admin only)
    """

    class Meta(UserSerializer.Meta):
        fields = UserSerializer.Meta.fields + [
            'failed_attempts',
            'blocked_until',
            'last_login_ip',
            'created_by_user_id',
            'deleted_at',
        ]
        read_only_fields = fields


# ─────────────────────────────────────────────────────────────────────────────
# 3. UPDATE PROFILE SERIALIZER
#    First name and last name only.
#    Phone change → PhoneChangeRequestSerializer (in auth_serializer.py)
#    Password change → ChangePasswordSerializer below
#    Photo change → UpdateProfilePhotoSerializer below
#    Email change → UpdateEmailSerializer below
# ─────────────────────────────────────────────────────────────────────────────

class UpdateProfileSerializer(serializers.ModelSerializer):
    """
    PATCH /accounts/me/
    Body: { "first_name": "Dawit", "last_name": "Mekonnen" }
    Both fields are optional — send only what changed.
    """

    first_name = serializers.CharField(
        max_length=50,
        required=False,
        help_text='User first name'
    )
    last_name = serializers.CharField(
        max_length=50,
        required=False,
        help_text='User last name'
    )

    class Meta:
        model  = User
        fields = ['first_name', 'last_name']

    def validate_first_name(self, value: str) -> str:
        value = value.strip()
        if not value.replace(' ', '').isalpha():
            raise serializers.ValidationError(
                'First name must contain letters only.'
            )
        return value.capitalize()

    def validate_last_name(self, value: str) -> str:
        value = value.strip()
        if not value.replace(' ', '').isalpha():
            raise serializers.ValidationError(
                'Last name must contain letters only.'
            )
        return value.capitalize()

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError(
                'At least one field (first_name or last_name) must be provided.'
            )
        return attrs

    def update(self, instance: User, validated_data: dict) -> User:
        instance.first_name = validated_data.get('first_name', instance.first_name)
        instance.last_name  = validated_data.get('last_name',  instance.last_name)
        instance.save(update_fields=['first_name', 'last_name'])
        return instance


# ─────────────────────────────────────────────────────────────────────────────
# 4. UPDATE PROFILE PHOTO SERIALIZER
#    Handles multipart/form-data — image uploads cannot go through a
#    regular JSON PATCH. This must be its own endpoint:
#    PATCH /accounts/me/photo/
#    Content-Type: multipart/form-data
#    Body: { "profile_photo": <file> }
#
#    Flutter's EditProfileScreen calls this after the user picks a photo
#    from the gallery or camera using image_picker.
# ─────────────────────────────────────────────────────────────────────────────

class UpdateProfilePhotoSerializer(serializers.ModelSerializer):
    """
    PATCH /accounts/me/photo/
    Accepts a single image file.
    Returns the updated profile_photo_url so Flutter can update the UI
    immediately without a separate GET /accounts/me/ call.
    """

    profile_photo = serializers.ImageField(
        required=True,
        help_text=(
            'Profile photo file. '
            'Accepted formats: JPEG, PNG, WebP. '
            'Max size enforced in view layer (5MB recommended).'
        )
    )

    # Return the new URL in the response so Flutter can update state immediately
    profile_photo_url = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model  = User
        fields = ['profile_photo', 'profile_photo_url']

    def get_profile_photo_url(self, obj: User) -> str | None:
        """Same safe URL builder as UserSerializer."""
        if not obj.profile_photo:
            return None
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(obj.profile_photo.url)
        return obj.profile_photo.url

    def validate_profile_photo(self, image):
        """
        Validate file size and type at the serializer level.
        Max 5MB — prevents users uploading 50MB RAW photos.
        """
        max_size_mb = 2
        if image.size > max_size_mb * 1024 * 1024:
            raise serializers.ValidationError(
                f'Profile photo must be smaller than {max_size_mb}MB.'
            )
        allowed_types = ['image/jpeg', 'image/png', 'image/webp']
        if image.content_type not in allowed_types:
            raise serializers.ValidationError(
                'Only JPEG, PNG, and WebP images are accepted.'
            )
        return image

    def update(self, instance: User, validated_data: dict) -> User:
        # Delete old photo from storage before saving new one
        # to avoid orphaned files accumulating in the S3 bucket.
        if instance.profile_photo:
            instance.profile_photo.delete(save=False)

        instance.profile_photo = validated_data['profile_photo']
        instance.save(update_fields=['profile_photo'])
        return instance


# ─────────────────────────────────────────────────────────────────────────────
# 5. UPDATE EMAIL SERIALIZER
#    Flutter EditProfileScreen has the "Not connected" email field.
#    Email is optional on this platform (phone is primary auth) but
#    useful for receipts and account recovery.
#    PATCH /accounts/me/email/
# ─────────────────────────────────────────────────────────────────────────────

class UpdateEmailSerializer(serializers.ModelSerializer):
    """
    PATCH /accounts/me/email/
    Body: { "email": "user@example.com" }
    Validates uniqueness against existing active users.
    """

    email = serializers.EmailField(
        required=True,
        help_text='Valid email address. Must be unique across all active users.'
    )

    class Meta:
        model  = User
        fields = ['email']

    def validate_email(self, value: str) -> str:
        value = value.strip().lower()

        # Check uniqueness — exclude the current user so they can
        # re-submit their own existing email without a false conflict.
        current_user = self.context['request'].user
        exists = (
            User.objects
            .filter(email=value, deleted_at__isnull=True)
            .exclude(id=current_user.id)
            .exists()
        )
        if exists:
            raise serializers.ValidationError(
                'This email address is already in use by another account.'
            )
        return value

    def update(self, instance: User, validated_data: dict) -> User:
        instance.email = validated_data['email']
        instance.save(update_fields=['email'])
        return instance


# ─────────────────────────────────────────────────────────────────────────────
# 6. CHANGE PASSWORD SERIALIZER
#    Flutter Settings screen → Security section → Change Password.
#    Requires current password to prevent unauthorized changes
#    if the user left their screen unlocked.
#    POST /accounts/me/change-password/
# ─────────────────────────────────────────────────────────────────────────────

class ChangePasswordSerializer(serializers.Serializer):
    """
    POST /accounts/me/change-password/
    Body: { "current_password": "...", "new_password": "...", "confirm_password": "..." }

    On success:
    - Password is updated
    - must_change_password is cleared
    - All other active sessions are revoked (user must re-login on other devices)
    - Session revocation happens in the view/service layer, not here
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
        help_text='New password — must meet strength requirements.'
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
            raise serializers.ValidationError(
                'Current password is incorrect.'
            )
        return value

    def validate_new_password(self, value: str) -> str:
        # Reuse the shared helper — single source of truth for rules
        return validate_password_strength(value)

    def validate(self, attrs: dict) -> dict:
        if attrs['new_password'] != attrs['confirm_password']:
            raise serializers.ValidationError({
                'confirm_password': 'New password and confirmation do not match.'
            })
        if attrs['new_password'] == attrs['current_password']:
            raise serializers.ValidationError({
                'new_password': 'New password must be different from the current password.'
            })
        return attrs

    def save(self, **kwargs) -> User:
        """
        Updates password and clears must_change_password flag.
        The view layer is responsible for calling
        UserSession.revoke_all_for_user() after this returns,
        to invalidate all other active sessions.
        """
        user = self.context['request'].user
        user.set_password(self.validated_data['new_password'])
        user.must_change_password = False
        user.save(update_fields=['password', 'must_change_password'])
        return user