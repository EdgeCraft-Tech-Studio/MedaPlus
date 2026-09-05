from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Notification
from .pagination import DefaultPagination
from .serializers import NotificationSerializer
from .services import get_unread_count, mark_all_read, mark_notification_read


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    """
    list           GET   /notifications/                — my notifications, paginated, newest first
    retrieve       GET   /notifications/{id}/             — one notification
    read           POST  /notifications/{id}/read/          — mark one as read
    mark_all_read  POST  /notifications/mark-all-read/         — mark everything read
    unread_count   GET   /notifications/unread-count/           — badge count

    ReadOnlyModelViewSet (not GenericViewSet) because there is
    genuinely no create/update/delete surface here for a client to
    touch — notifications are only ever created server-side via
    notification.services.notify(), and the only state a client can
    change is read/unread, handled by the two dedicated actions
    below rather than a generic PATCH.
    """

    serializer_class = NotificationSerializer
    pagination_class = DefaultPagination
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # Scoping every query to the requesting user here is what
        # makes retrieve()/read() IDOR-safe for free: a notification
        # id belonging to someone else simply isn't in this queryset,
        # so DRF's get_object() 404s before mark_notification_read()'s
        # own ownership check is even reached.
        return Notification.objects.for_user(self.request.user)

    @action(detail=True, methods=["post"])
    def read(self, request, *args, **kwargs):
        notification = self.get_object()
        notification = mark_notification_read(notification=notification, user=request.user)
        return Response(NotificationSerializer(notification).data)

    @action(detail=False, methods=["post"], url_path="mark-all-read")
    def mark_all_read_action(self, request, *args, **kwargs):
        count = mark_all_read(user=request.user)
        return Response({"marked_read": count})

    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request, *args, **kwargs):
        return Response({"unread_count": get_unread_count(user=request.user)})
