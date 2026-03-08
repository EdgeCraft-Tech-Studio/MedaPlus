from rest_framework import serializers
from pitches.models import BookingType


class BookingSelectionSerializer(serializers.Serializer):
    start_iso = serializers.DateTimeField()
    end_iso = serializers.DateTimeField()


class BookingCreateSerializer(serializers.Serializer):
    pitch_id = serializers.CharField()
    booking_type = serializers.ChoiceField(choices=BookingType.choices)
    selections = BookingSelectionSerializer(many=True)
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    manual_cash = serializers.BooleanField(required=False, default=False)
    booked_for_name = serializers.CharField(required=False, allow_blank=True, default="")
