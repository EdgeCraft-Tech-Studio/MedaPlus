from rest_framework import serializers
from .models import Pitch, PitchImage


class PitchImageSerializer(serializers.ModelSerializer):
    id = serializers.SerializerMethodField()
    url = serializers.SerializerMethodField()

    class Meta:
        model = PitchImage
        fields = ["id", "url"]

    def get_id(self, obj):
        return str(obj.id)

    def get_url(self, obj):
        if not obj.image:
            return None
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(obj.image.url)
        return obj.image.url


class PitchSerializer(serializers.ModelSerializer):
    id = serializers.SerializerMethodField()
    tenant_id = serializers.SerializerMethodField()
    tenant_name = serializers.SerializerMethodField()
    opening_time_label = serializers.SerializerMethodField()
    closing_time_label = serializers.SerializerMethodField()
    cover_image_url = serializers.SerializerMethodField()
    image_urls = serializers.SerializerMethodField()
    images = serializers.SerializerMethodField()

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
            "opening_time",
             "sport_type", 
            "closing_time",
            "opening_time_label",
            "closing_time_label",
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
            "images",
            "is_approved",
            "is_active",
            "created_at",
        ]
        read_only_fields = fields

    def _absolute_url(self, url):
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

    def get_opening_time_label(self, obj):
        return obj.opening_time.strftime("%I:%M %p") if obj.opening_time else None

    def get_closing_time_label(self, obj):
        return obj.closing_time.strftime("%I:%M %p") if obj.closing_time else None

    def get_cover_image_url(self, obj):
        first_image = obj.images.order_by("created_at").first()
        if not first_image or not first_image.image:
            return None
        return self._absolute_url(first_image.image.url)

    def get_image_urls(self, obj):
        # Kept for backward compatibility with any code still reading plain
        # URL strings. New code (the edit form) should use "images" instead,
        # since these ids are required to delete a single photo precisely.
        urls = []
        for image in obj.images.order_by("created_at"):
            if image.image:
                urls.append(self._absolute_url(image.image.url))
        return urls

    def get_images(self, obj):
        qs = obj.images.order_by("created_at")
        return PitchImageSerializer(qs, many=True, context=self.context).data


class AlreadyBookedSlotSerializer(serializers.Serializer):
    """One historical/manual booking entered by the owner — a slot that
    was already taken before the pitch went on the platform, so it needs
    to show up as unavailable and be attributed to someone.
    """

    date = serializers.DateField()
    start_hour = serializers.IntegerField(min_value=0, max_value=23)
    end_hour = serializers.IntegerField(min_value=1, max_value=24)
    name = serializers.CharField(max_length=120)
    phone = serializers.CharField(max_length=30, required=False, allow_blank=True, default="")

    def validate_name(self, value):
        if not value.strip():
            raise serializers.ValidationError("Name is required for an already-booked slot.")
        return value.strip()

    def validate(self, attrs):
        if attrs["end_hour"] <= attrs["start_hour"]:
            raise serializers.ValidationError("End time must be after start time.")
        return attrs




class PitchCreateSerializer(serializers.Serializer):
    tenant_id = serializers.CharField(required=False)
    owner_id = serializers.CharField(required=False)

    name = serializers.CharField(max_length=120)
    address = serializers.CharField(required=False, allow_blank=True, default="")

    sport_type = serializers.ChoiceField(
        choices=["FOOTBALL", "BASKETBALL"], required=False, default="FOOTBALL"
    )
    latitude = serializers.FloatField()
    longitude = serializers.FloatField()

    opening_time = serializers.TimeField(input_formats=["%H:%M"])
    closing_time = serializers.TimeField(input_formats=["%H:%M"])

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

    def validate(self, attrs):
        opening_time = attrs.get("opening_time")
        closing_time = attrs.get("closing_time")

        if opening_time and closing_time and opening_time >= closing_time:
            raise serializers.ValidationError(
                {"closing_time": "Closing time must be later than opening time."}
            )

        return attrs

class PitchUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120, required=False)
    address = serializers.CharField(required=False, allow_blank=True)
    latitude = serializers.FloatField(required=False)
    longitude = serializers.FloatField(required=False)
    sport_type = serializers.ChoiceField(
        choices=["FOOTBALL", "BASKETBALL"], required=False
    )

    opening_time = serializers.TimeField(input_formats=["%H:%M"], required=False)
    closing_time = serializers.TimeField(input_formats=["%H:%M"], required=False)

    min_hours = serializers.IntegerField(required=False, min_value=1)
    allow_hourly = serializers.BooleanField(required=False)
    allow_weekly = serializers.BooleanField(required=False)
    allow_monthly = serializers.BooleanField(required=False)

    hourly_price = serializers.DecimalField(max_digits=10, decimal_places=2, required=False)
    weekly_price = serializers.DecimalField(max_digits=10, decimal_places=2, required=False)
    monthly_price = serializers.DecimalField(max_digits=10, decimal_places=2, required=False)

    has_dressing_room = serializers.BooleanField(required=False)
    has_showers = serializers.BooleanField(required=False)
    has_parking = serializers.BooleanField(required=False)
    has_lighting = serializers.BooleanField(required=False)
    other_services = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        opening_time = attrs.get("opening_time")
        closing_time = attrs.get("closing_time")

        if opening_time and closing_time and opening_time >= closing_time:
            raise serializers.ValidationError(
                {"closing_time": "Closing time must be later than opening time."}
            )

        return attrs