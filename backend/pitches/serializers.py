from rest_framework import serializers
from .models import Pitch

class PitchSerializer(serializers.ModelSerializer):
    class Meta:
        model = Pitch
        fields = [
            "id",
            "owner",
            "name",
            "address",
            "latitude",
            "longitude",
            "hourly_price",
            "weekly_price",
            "monthly_price",
            "has_dressing_room",
            "has_showers",
            "other_services",
            "is_approved",
            "is_active",
            "created_at",
        ]
        read_only_fields = ["id", "owner", "is_approved", "is_active", "created_at"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["id"] = str(instance.id)
        data["owner"] = str(instance.owner_id)
        return data


class PitchCreateSerializer(serializers.Serializer):
    # Admin can optionally pass owner_id
    owner_id = serializers.CharField(required=False)

    name = serializers.CharField(max_length=120)
    address = serializers.CharField(required=False, allow_blank=True)
    latitude = serializers.FloatField()
    longitude = serializers.FloatField()

    hourly_price = serializers.DecimalField(max_digits=10, decimal_places=2)
    weekly_price = serializers.DecimalField(max_digits=10, decimal_places=2)
    monthly_price = serializers.DecimalField(max_digits=10, decimal_places=2)

    has_dressing_room = serializers.BooleanField(required=False, default=False)
    has_showers = serializers.BooleanField(required=False, default=False)
    other_services = serializers.CharField(required=False, allow_blank=True, default="")

    # Slots for a single day
    slot_date = serializers.DateField(required=False)  # default: today if not given
    slot_hours = serializers.ListField(
        child=serializers.IntegerField(min_value=0, max_value=23),
        required=False,
        default=list,
    )
