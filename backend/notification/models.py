import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone

from .choices import NotificationType


class NotificationQuerySet(models.QuerySet):
    """Query encapsulation only — no mutation here. Mirrors the
    convention used across team/chat/match: filters named once,
    reused everywhere instead of raw `.filter(...)` scattered around.
    """

    def for_user(self, user):
        return self.filter(recipient=user)

    def unread(self):
        return self.filter(is_read=False)

    def read(self):
        return self.filter(is_read=True)

    def of_type(self, notification_type: str):
        return self.filter(notification_type=notification_type)

    def pending_push(self):
        """Rows that haven't had a push attempt yet — what the
        service-layer push-sender (next round) will query to find
        work to do.
        """
        return self.filter(push_sent=False)


NotificationManager = models.Manager.from_queryset(NotificationQuerySet)


class Notification(models.Model):
    """One row per notification delivered to one user — the in-app
    'bell icon' list on both Flutter and React, and (via a service
    that reads this same row) the source of what gets pushed through
    FCM. `recipient` is always a single user; there is no 'broadcast
    to many' shape here — a service creating a team-wide notification
    (e.g. 'new join request' to every admin) creates one row per
    recipient, not one row with many recipients, so each person's
    read state is genuinely independent of everyone else's.

    Notifications are created ONLY by other services (team, chat,
    match) calling notification.services.notify() — there is
    deliberately no public "create a notification for another user"
    API endpoint. The only user-facing writes on this model are
    marking rows read, which don't need a serializer at all (see
    serializers.py's docstring).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )

    notification_type = models.CharField(max_length=30, choices=NotificationType.choices)

    title = models.CharField(max_length=200)
    body = models.TextField(blank=True)

    # Flexible deep-link payload — see the module-level design note
    # in choices.py / this file's class docstring for why this is a
    # JSONField rather than per-target FKs. Expected shape is
    # per-`notification_type` (e.g. TEAM_INVITATION_RECEIVED carries
    # {"team_id": ..., "team_slug": ..., "invitation_id": ...};
    # CHAT_MESSAGE_RECEIVED carries {"team_id": ..., "team_slug": ...,
    # "message_id": ...}) — documented per-type in the service layer
    # that constructs each one, not enforced here as a DB-level shape
    # constraint (JSONField shape validation varies too much by type
    # to usefully express as one constraint).
    data = models.JSONField(default=dict, blank=True)

    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)

    # Whether an FCM push was attempted for this notification, and
    # when — separate from is_read (a user can read something in-app
    # without a push ever having been sent, e.g. app was already open).
    push_sent = models.BooleanField(default=False)
    push_sent_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    objects = NotificationManager()

    class Meta:
        db_table = "notification_notification"
        ordering = ["-created_at"]
        indexes = [
            # The hot path: "my notifications, unread first/only,
            # newest first" — both the list screen and the unread-
            # count badge hit this exact shape.
            models.Index(fields=["recipient", "is_read", "created_at"]),
            models.Index(fields=["notification_type"]),
        ]

    def __str__(self) -> str:
        return f"{self.notification_type} -> {self.recipient_id}"

    def mark_read(self, *, save: bool = True) -> None:
        if self.is_read:
            return
        self.is_read = True
        self.read_at = timezone.now()
        if save:
            self.save(update_fields=["is_read", "read_at"])

    def mark_push_sent(self, *, save: bool = True) -> None:
        self.push_sent = True
        self.push_sent_at = timezone.now()
        if save:
            self.save(update_fields=["push_sent", "push_sent_at"])