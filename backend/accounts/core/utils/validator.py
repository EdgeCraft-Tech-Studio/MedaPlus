import re
from rest_framework import serializers



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
