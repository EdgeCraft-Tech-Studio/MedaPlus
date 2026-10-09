import re

from rest_framework import serializers

from .choices import GatewayProvider, PaymentMode, SupportedBank
from .models import (
    PAYER_PHONE_REQUIRED_BANKS,
    SUFFIX_REQUIRED_BANKS,
    PaymentTransaction,
    PitchOwnerBankAccount,
    PitchOwnerPaymentProfile,
)
from .services import get_bank_requirement, normalize_ethiopian_phone, payment_time_from_response

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
    # bank        = the bank / wallet the payer paid FROM (its receipt is verified)
    # pay_to_bank = which of the pitch owner's accounts was paid INTO
    #               (omit it for a same-bank payment)
    bank = serializers.ChoiceField(choices=SupportedBank.choices)
    pay_to_bank = serializers.ChoiceField(
        choices=SupportedBank.choices, required=False, allow_blank=True, default=""
    )
    screenshot = serializers.ImageField(validators=[_validate_screenshot_size])
    reference_number = serializers.RegexField(
        r"^[A-Za-z0-9\-_/]{6,64}$",
        error_messages={"invalid": "Reference number may only contain letters, digits, - _ /"},
    )
    # The payer types their FULL account number; the server keeps only the last
    # digits the bank needs (8 for CBE, 5 for BOA) and never stores the rest.
    sender_account_number = serializers.CharField(required=False, allow_blank=True, default="", max_length=40)
    account_suffix = serializers.CharField(required=False, allow_blank=True, default="")  # older clients
    phone_number = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        bank = attrs["bank"]
        attrs["pay_to_bank"] = attrs.get("pay_to_bank") or bank

        length = SUFFIX_REQUIRED_BANKS.get(bank)
        digits = re.sub(r"\D", "", attrs.get("sender_account_number") or "")
        if length and digits and len(digits) < length:
            raise serializers.ValidationError({"sender_account_number": "Please enter your full account number."})
        attrs["sender_account_number"] = digits if length else ""
        attrs["account_suffix"] = re.sub(r"\D", "", attrs.get("account_suffix") or "") if length else ""

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


# ─────────────────────────────────────────────────────────────────────────────
# Pitch owner "Payment Detail" table
# ─────────────────────────────────────────────────────────────────────────────

class OwnerPaymentRowSerializer(serializers.ModelSerializer):
    """One table row. Everything here reads relations that list_pitch_payments()
    already joined in (payer, owner_bank_account, team) - no per-row queries."""

    payer_first_name = serializers.CharField(source="payer.first_name", read_only=True)
    payer_last_name = serializers.CharField(source="payer.last_name", read_only=True)
    payer_phone = serializers.CharField(source="payer.phone", read_only=True)
    amount = serializers.SerializerMethodField()
    sender_bank = serializers.CharField(source="bank", read_only=True)
    pay_to_bank = serializers.SerializerMethodField()
    kind = serializers.SerializerMethodField()
    team_name = serializers.SerializerMethodField()
    paid_at = serializers.SerializerMethodField()
    review_reason = serializers.SerializerMethodField()

    class Meta:
        model = PaymentTransaction
        fields = [
            "id", "status", "kind", "team_name",
            "payer_first_name", "payer_last_name", "payer_phone",
            "amount", "sender_bank", "pay_to_bank", "reference_number",
            "paid_at", "submitted_at", "review_reason",
        ]
        read_only_fields = fields

    def get_amount(self, obj):
        return str(obj.verified_amount if obj.verified_amount is not None else obj.amount_expected)

    def get_pay_to_bank(self, obj):
        return obj.owner_bank_account.bank if obj.owner_bank_account_id else ""

    def get_kind(self, obj):
        if obj.solo_booking_hold_id:
            return "solo"
        if obj.team_booking_payment_id:
            return "team"
        return "booking"

    def get_team_name(self, obj):
        if not obj.team_booking_payment_id:
            return ""
        return obj.team_booking_payment.request.team.name

    def get_paid_at(self, obj):
        paid = payment_time_from_response(obj)
        return paid.isoformat() if paid else None

    def get_review_reason(self, obj):
        return obj.rejection_reason if obj.status == "needs_review" else ""


class OwnerReviewActionSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=["approve", "reject"])


class OwnerReverseVerifiedSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True, trim_whitespace=False, max_length=128)