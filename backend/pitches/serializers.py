from rest_framework import serializers
from .models import Pitch


class PitchSerializer(serializers.ModelSerializer):
    """
    API output for pitches.
    Uses tenant_id (and optionally tenant_name) instead of 'owner'.
    """

    tenant_id = serializers.SerializerMethodField()
    tenant_name = serializers.SerializerMethodField()

    class Meta:
        model = Pitch
        fields = [
            "id",

            "tenant_id",
            "tenant_name",

            "name",
            "address",
            "latitude",
            "longitude",

            "min_hours",
            "allow_hourly",
            "allow_weekly",
            "allow_monthly",

            "hourly_price",
            "weekly_price",
            "monthly_price",

            "has_dressing_room",
            "has_showers",
            "has_parking",
            "has_lighting",
            "other_services",

            "is_approved",
            "is_active",
            "created_at",
        ]
        read_only_fields = fields

    def get_tenant_id(self, obj):
        return str(obj.tenant_id) if obj.tenant_id else None

    def get_tenant_name(self, obj):
        return obj.tenant.name if obj.tenant_id else None

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["id"] = str(instance.id)
        return data


class PitchCreateSerializer(serializers.Serializer):
    """
    Admin can create pitch for:
      - tenant_id (preferred) OR
      - owner_id (resolve to tenant)  OR
      - owners can create without these (uses request.user.tenant)
    """
    tenant_id = serializers.CharField(required=False)
    owner_id = serializers.CharField(required=False)

    name = serializers.CharField(max_length=120)
    address = serializers.CharField(required=False, allow_blank=True, default="")
    latitude = serializers.FloatField()
    longitude = serializers.FloatField()

    # Booking rules
    min_hours = serializers.IntegerField(required=False, default=1)
    allow_hourly = serializers.BooleanField(required=False, default=True)
    allow_weekly = serializers.BooleanField(required=False, default=False)
    allow_monthly = serializers.BooleanField(required=False, default=False)

    # Pricing
    hourly_price = serializers.DecimalField(max_digits=10, decimal_places=2)
    weekly_price = serializers.DecimalField(max_digits=10, decimal_places=2)
    monthly_price = serializers.DecimalField(max_digits=10, decimal_places=2)

    # Amenities / services
    has_dressing_room = serializers.BooleanField(required=False, default=False)
    has_showers = serializers.BooleanField(required=False, default=False)
    has_parking = serializers.BooleanField(required=False, default=False)
    has_lighting = serializers.BooleanField(required=False, default=False)
    other_services = serializers.CharField(required=False, allow_blank=True, default="")

    # Slots for a single day
    slot_date = serializers.DateField(required=False)
    slot_hours = serializers.ListField(
        child=serializers.IntegerField(min_value=0, max_value=23),
        required=False,
        default=list,
    )
