from rest_framework import serializers

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    """Read-only. This is the ONLY serializer in this file on
    purpose: notifications are created exclusively by
    notification.services.notify(), called from team/chat/match's own
    services when something happens — there is no endpoint where a
    client POSTs a new Notification, so no create serializer exists
    to accidentally expose that.

    'Mark as read' (single or bulk) doesn't need a serializer either
    — same pattern already used for chat's mark-read action: the
    endpoint takes no input body, just flips state and returns 204 or
    the updated row. A serializer whose entire job would be validating
    an empty request body isn't pulling its weight.

    `recipient` is deliberately NOT included — every list this
    serializer renders is already scoped to `request.user`'s own
    notifications (enforced in the view's queryset), so repeating
    "this is yours" on every single row is pure noise.
    """

    class Meta:
        model = Notification
        fields = [
            "id",
            "notification_type",
            "title",
            "body",
            "data",
            "is_read",
            "read_at",
            "created_at",
        ]
        read_only_fields = fields