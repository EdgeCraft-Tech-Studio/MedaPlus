from rest_framework import serializers

from .choices import GatewayProvider, PaymentMode, SupportedBank
from .models import (
    PAYER_PHONE_REQUIRED_BANKS,
    SUFFIX_REQUIRED_BANKS,
    PaymentTransaction,
    PitchOwnerBankAccount,
    PitchOwnerPaymentProfile,
)
from .services import get_bank_requirement, normalize_ethiopian_phone

MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024


def _validate_screenshot_size(file):
    if file.size > MAX_SCREENSHOT_BYTES:
        raise serializers.ValidationError("Image must be 8 MB or smaller.")
    return file


class PitchOwnerBankAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = PitchOwnerBankAccount
        fields = [
            "id", "bank", "account_holder_name", "account_number",
            "phone_number", "is_active", "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class PaymentInfoBankAccountSerializer(PitchOwnerBankAccountSerializer):
    """Adds what the payer's form must ask for when paying into this
    account, so the frontend never hardcodes per-bank rules.
    """

    requirements = serializers.SerializerMethodField()

    class Meta(PitchOwnerBankAccountSerializer.Meta):
        fields = PitchOwnerBankAccountSerializer.Meta.fields + ["requirements"]
        read_only_fields = fields

    def get_requirements(self, obj):
        return get_bank_requirement(obj.bank)


class BankRequirementSerializer(serializers.Serializer):
    bank = serializers.CharField()
    label = serializers.CharField()
    supported = serializers.BooleanField()
    requires_account_suffix = serializers.BooleanField()
    account_suffix_length = serializers.IntegerField(allow_null=True)
    account_suffix_help = serializers.CharField(allow_blank=True)
    requires_phone_number = serializers.BooleanField()
    phone_number_help = serializers.CharField(allow_blank=True)


class PitchOwnerPaymentProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = PitchOwnerPaymentProfile
        fields = ["id", "payment_mode", "gateway_provider", "configured_at"]
        read_only_fields = fields


class ConfigurePaymentProfileSerializer(serializers.Serializer):
    payment_mode = serializers.ChoiceField(choices=PaymentMode.choices)
    gateway_provider = serializers.ChoiceField(
        choices=GatewayProvider.choices, required=False, allow_blank=True, default=""
    )
    gateway_merchant_ref = serializers.CharField(required=False, allow_blank=True, default="")


class UpsertBankAccountSerializer(serializers.Serializer):
    bank = serializers.ChoiceField(choices=SupportedBank.choices)
    account_holder_name = serializers.CharField(max_length=150)
    account_number = serializers.CharField(required=False, allow_blank=True, default="")
    phone_number = serializers.CharField(required=False, allow_blank=True, default="")


class PaymentInfoSerializer(serializers.Serializer):
    payment_mode = serializers.CharField()
    bank_accounts = PaymentInfoBankAccountSerializer(many=True)
    amount_due = serializers.CharField(required=False, default="")

class PaymentTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentTransaction
        fields = [
            "id", "booking_id", "status", "payment_mode", "bank", "reference_number",
            "amount_expected", "verified_amount", "verified_transaction_at",
            "rejection_reason", "submitted_at", "processed_at",
        ]
        read_only_fields = fields


class PaymentTransactionAdminSerializer(PaymentTransactionSerializer):
    class Meta(PaymentTransactionSerializer.Meta):
        fields = PaymentTransactionSerializer.Meta.fields + [
            "payer_id", "pitch_owner_id", "verify_request_id", "verify_response",
            "account_suffix", "payer_phone_number",
        ]
        read_only_fields = fields


class ExtractReceiptDataSerializer(serializers.Serializer):
    screenshot = serializers.ImageField(validators=[_validate_screenshot_size])
    bank_hint = serializers.ChoiceField(
        choices=SupportedBank.choices, required=False, allow_blank=True, default=""
    )


class ExtractedReceiptDataSerializer(serializers.Serializer):
    raw_text = serializers.CharField(allow_blank=True)
    suggested_bank = serializers.CharField(allow_blank=True)
    suggested_reference_number = serializers.CharField(allow_blank=True)
    other_candidates = serializers.ListField(child=serializers.CharField())
    confidence = serializers.CharField()


class SubmitManualBankPaymentSerializer(serializers.Serializer):
    bank = serializers.ChoiceField(choices=SupportedBank.choices)
    screenshot = serializers.ImageField(validators=[_validate_screenshot_size])
    reference_number = serializers.RegexField(
        r"^[A-Za-z0-9\-_/]{6,64}$",
        error_messages={"invalid": "Reference number may only contain letters, digits, - _ /"},
    )
    account_suffix = serializers.CharField(required=False, allow_blank=True, default="")
    phone_number = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        bank = attrs["bank"]
        if bank == SupportedBank.ZEMEN:
            raise serializers.ValidationError(
                {"bank": "This bank is not supported for direct verification yet."}
            )

        if bank in SUFFIX_REQUIRED_BANKS:
            length = SUFFIX_REQUIRED_BANKS[bank]
            suffix = (attrs.get("account_suffix") or "").strip()
            if not (suffix.isdigit() and len(suffix) == length):
                raise serializers.ValidationError({"account_suffix": f"Enter exactly {length} digits."})
            attrs["account_suffix"] = suffix
        else:
            attrs["account_suffix"] = ""

        if bank in PAYER_PHONE_REQUIRED_BANKS:
            phone = normalize_ethiopian_phone(attrs.get("phone_number") or "")
            if not phone:
                raise serializers.ValidationError(
                    {"phone_number": "Enter a valid Ethiopian phone number."}
                )
            attrs["phone_number"] = phone
        else:
            attrs["phone_number"] = ""

        attrs["reference_number"] = attrs["reference_number"].strip().upper()
        return attrs


class ResolveReviewSerializer(serializers.Serializer):
    approve = serializers.BooleanField()
    note = serializers.CharField(min_length=3)
