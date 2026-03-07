from rest_framework import serializers
from .models import Pitch


class PitchSerializer(serializers.ModelSerializer):
    id = serializers.SerializerMethodField()
    tenant_id = serializers.SerializerMethodField()
    tenant_name = serializers.SerializerMethodField()
    cover_image_url = serializers.SerializerMethodField()
    image_urls = serializers.SerializerMethodField()

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
            "cover_image_url",
            "image_urls",
            "is_approved",
            "is_active",
            "created_at",
        ]
        read_only_fields = fields

    def _absolute_url(self, url: str | None):
        if not url:
            return None
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(url)
        return url

    def get_id(self, obj):
        return str(obj.id) if obj.id else None

    def get_tenant_id(self, obj):
        return str(obj.tenant_id) if obj.tenant_id else None

    def get_tenant_name(self, obj):
        return obj.tenant.name if obj.tenant_id else None

    def get_cover_image_url(self, obj):
        first_image = obj.images.order_by("created_at").first()
        if not first_image or not first_image.image:
            return None
        return self._absolute_url(first_image.image.url)

    def get_image_urls(self, obj):
        urls = []
        for image in obj.images.order_by("created_at"):
            if image.image:
                urls.append(self._absolute_url(image.image.url))
        return urls


class PitchCreateSerializer(serializers.Serializer):
    tenant_id = serializers.CharField(required=False)
    owner_id = serializers.CharField(required=False)

    name = serializers.CharField(max_length=120)
    address = serializers.CharField(required=False, allow_blank=True, default="")
    latitude = serializers.FloatField()
    longitude = serializers.FloatField()

    min_hours = serializers.IntegerField(required=False, default=1)
    allow_hourly = serializers.BooleanField(required=False, default=True)
    allow_weekly = serializers.BooleanField(required=False, default=False)
    allow_monthly = serializers.BooleanField(required=False, default=False)

    hourly_price = serializers.DecimalField(max_digits=10, decimal_places=2)
    weekly_price = serializers.DecimalField(max_digits=10, decimal_places=2)
    monthly_price = serializers.DecimalField(max_digits=10, decimal_places=2)

    has_dressing_room = serializers.BooleanField(required=False, default=False)
    has_showers = serializers.BooleanField(required=False, default=False)
    has_parking = serializers.BooleanField(required=False, default=False)
    has_lighting = serializers.BooleanField(required=False, default=False)
    other_services = serializers.CharField(required=False, allow_blank=True, default="")

    slot_date = serializers.DateField(required=False)
    slot_hours = serializers.ListField(
        child=serializers.IntegerField(min_value=0, max_value=23),
        required=False,
        default=list,
    )
