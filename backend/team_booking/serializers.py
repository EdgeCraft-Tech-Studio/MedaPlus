from rest_framework import serializers

from .models import TeamBookingConfirmation, TeamBookingPayment, TeamBookingRequest


class TeamBookingRequestCreateSerializer(serializers.Serializer):
    pitch_id = serializers.CharField()
    pitch_name = serializers.CharField(required=False, allow_blank=True)
    team_id = serializers.UUIDField()
    booking_type = serializers.ChoiceField(choices=["HOURLY", "WEEKLY", "MONTHLY"])
    selections = serializers.ListField(child=serializers.DictField(), allow_empty=False)
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    price_per_member = serializers.DecimalField(max_digits=10, decimal_places=2)
    total_price = serializers.DecimalField(max_digits=10, decimal_places=2)


class TeamBookingRequestSerializer(serializers.ModelSerializer):
    team_name = serializers.CharField(source="team.name", read_only=True)
    team_slug = serializers.CharField(source="team.slug", read_only=True)
    confirmed_count = serializers.SerializerMethodField()
    total_count = serializers.SerializerMethodField()

    class Meta:
        model = TeamBookingRequest
        fields = [
            "id", "pitch_id", "pitch_name", "team_id", "team_name", "team_slug",
            "booking_type", "selections", "notes", "price_per_member", "total_price",
            "status", "expires_at", "created_at",
            "confirmed_count", "total_count",
        ]
        read_only_fields = fields

    def get_confirmed_count(self, obj):
        return obj.confirmations.filter(status="confirmed").count()

    def get_total_count(self, obj):
        return obj.confirmations.count()


class PendingConfirmationSerializer(serializers.ModelSerializer):
    """What AppShell's polling endpoint returns — enough info to
    render the blocking modal in one round-trip.
    """

    request_id = serializers.UUIDField(source="request.id")
    pitch_name = serializers.CharField(source="request.pitch_name")
    team_name = serializers.CharField(source="request.team.name")
    selections = serializers.JSONField(source="request.selections")
    price_per_member = serializers.DecimalField(
        source="request.price_per_member", max_digits=10, decimal_places=2
    )
    expires_at = serializers.DateTimeField(source="request.expires_at")

    class Meta:
        model = TeamBookingConfirmation
        fields = [
            "id", "request_id", "pitch_name", "team_name",
            "selections", "price_per_member", "expires_at",
        ]
        read_only_fields = fields


class PendingOwnerActionMemberSerializer(serializers.Serializer):
    id = serializers.CharField()
    name = serializers.CharField()
    profile_photo_url = serializers.CharField(allow_null=True)


class PendingPaymentSerializer(serializers.ModelSerializer):
    request_id = serializers.UUIDField(source="request.id") 
    pitch_name = serializers.CharField(source="request.pitch_name")
    team_name = serializers.CharField(source="request.team.name")
    payment_expires_at = serializers.DateTimeField(source="request.payment_expires_at")

    class Meta:
        model = TeamBookingPayment
        fields = ["id", "request_id", "pitch_name", "team_name", "amount", "payment_expires_at"]
        read_only_fields = fields


class TeamBookingRequestListItemSerializer(serializers.ModelSerializer):
    team_name = serializers.CharField(source="team.name", read_only=True)
    team_logo = serializers.CharField(source="team.logo", read_only=True, allow_null=True)
    confirmed_count = serializers.SerializerMethodField()
    total_count = serializers.SerializerMethodField()

    class Meta:
        model = TeamBookingRequest
        fields = [
            "id", "team_id", "team_name", "team_logo", "pitch_name",
            "status", "confirmed_count", "total_count", "created_at", "expires_at",
        ]
        read_only_fields = fields

    def get_confirmed_count(self, obj):
        return obj.confirmations.filter(status="confirmed").count()

    def get_total_count(self, obj):
        return obj.confirmations.count()



class TeamBookingRequestLiveDetailSerializer(serializers.ModelSerializer):
    team_name = serializers.CharField(source="team.name", read_only=True)
    team_logo = serializers.CharField(source="team.logo", read_only=True, allow_null=True)
    confirmed_members = serializers.SerializerMethodField()
    declined_members = serializers.SerializerMethodField()
    pending_members = serializers.SerializerMethodField()
    paid_members = serializers.SerializerMethodField()
    unpaid_members = serializers.SerializerMethodField()

    class Meta:
        model = TeamBookingRequest
        fields = [
            "id", "team_id", "team_name", "team_logo", "pitch_id", "pitch_name",
            "booking_type", "selections", "status", "price_per_member", "total_price",
            "expires_at", "payment_expires_at", "payment_round", "final_booking_code",
            "confirmed_members", "declined_members", "pending_members",
            "paid_members", "unpaid_members",
        ]
        read_only_fields = fields

    def _serialize_user(self, user):
        full = f"{getattr(user, 'first_name', '')} {getattr(user, 'last_name', '')}".strip()
        return {
            "id": str(user.id),
            "name": full or getattr(user, "username", "Player"),
            "profile_photo_url": getattr(user, "profile_photo_url", None),
        }

    def get_confirmed_members(self, obj):
        return [
            self._serialize_user(c.member)
            for c in obj.confirmations.select_related("member")
            if c.status == "confirmed"
        ]

    def get_declined_members(self, obj):
        return [
            self._serialize_user(c.member)
            for c in obj.confirmations.select_related("member")
            if c.status == "declined"
        ]

    def get_pending_members(self, obj):
        return [
            self._serialize_user(c.member)
            for c in obj.confirmations.select_related("member")
            if c.status == "pending"
        ]

    def get_paid_members(self, obj):
        """Live during the payment phase — visible even before the
        window closes, per the requirement that the owner can check
        who's paid at any point during the countdown, not just after.
        """
        latest = obj.payment_round
        return [
            self._serialize_user(p.payer)
            for p in obj.payments.select_related("payer").filter(
                round=latest, status__in=["paid", "covered_by_owner"]
            )
        ]

    def get_unpaid_members(self, obj):
        latest = obj.payment_round
        return [
            self._serialize_user(p.payer)
            for p in obj.payments.select_related("payer").filter(round=latest, status="pending")
        ]


class ConfirmationDetailSerializer(serializers.ModelSerializer):
    request_id = serializers.UUIDField(source="request.id")
    pitch_name = serializers.CharField(source="request.pitch_name")
    team_name = serializers.CharField(source="request.team.name")
    selections = serializers.JSONField(source="request.selections")
    price_per_member = serializers.DecimalField(
        source="request.price_per_member", max_digits=10, decimal_places=2
    )
    expires_at = serializers.DateTimeField(source="request.expires_at")
    can_respond = serializers.SerializerMethodField()
    my_status = serializers.CharField(source="status")

    class Meta:
        model = TeamBookingConfirmation
        fields = [
            "id", "request_id", "pitch_name", "team_name",
            "selections", "price_per_member", "expires_at",
            "can_respond", "my_status",
        ]
        read_only_fields = fields

    def get_can_respond(self, obj):
        return self.context.get("can_respond", False)


class PaymentDetailSerializer(serializers.ModelSerializer):
    request_id = serializers.UUIDField(source="request.id")
    pitch_name = serializers.CharField(source="request.pitch_name")
    team_name = serializers.CharField(source="request.team.name")
    payment_expires_at = serializers.DateTimeField(source="request.payment_expires_at")
    can_pay = serializers.SerializerMethodField()
    my_status = serializers.CharField(source="status")

    class Meta:
        model = TeamBookingPayment
        fields = [
            "id", "request_id", "pitch_name", "team_name",
            "amount", "payment_expires_at", "can_pay", "my_status",
        ]
        read_only_fields = fields

    def get_can_pay(self, obj):
        return self.context.get("can_pay", False)