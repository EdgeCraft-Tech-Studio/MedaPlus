import logging
from typing import Optional

from django.utils import timezone
from rest_framework.exceptions import PermissionDenied

from .models import Notification

logger = logging.getLogger(__name__)


def _get_device_tokens(user) -> list:
    """
    ASSUMPTION — VERIFY AGAINST YOUR REAL MODEL, THEN DELETE THIS
    COMMENT. Guessing accounts.DeviceToken has a `user` FK and a
    `token` field holding the raw FCM registration string, and that
    every row for a user is currently valid (no is_active/revoked
    flag to filter on). This is the ONLY function in this file that
    knows anything about DeviceToken's shape — if the real model
    differs, this is the one place to fix, nothing else here changes.
    """
    from accounts.models import DeviceToken

    return list(DeviceToken.objects.filter(user=user).values_list("token", flat=True))


try:
    import firebase_admin  # noqa: F401
    _FIREBASE_INSTALLED = True
except ImportError:
    _FIREBASE_INSTALLED = False


def _send_push_for_notification(notification: Notification) -> None:
    """Fire-and-forget: failures here are logged, never raised past
    this function — see notify()'s docstring for why a push failure
    must never take the in-app Notification row down with it.

    Skips cleanly (one debug line, no traceback) when firebase_admin
    isn't installed — expected in local/dev environments that don't
    have push configured yet. Install `firebase-admin` and configure
    credentials when you're ready to enable real push.
    """
    if not _FIREBASE_INSTALLED:
        logger.debug("Push skipped for %s: firebase_admin not installed.", notification.id)
        return

    from firebase_admin import messaging

    from .firebase import ensure_firebase_initialized

    tokens = _get_device_tokens(notification.recipient)
    if not tokens:
        return  # no registered devices — nothing to push, not an error

    ensure_firebase_initialized()

    # FCM's data payload requires every value to be a string — a raw
    # int/bool/None in `notification.data` would otherwise fail the
    # send silently or error, depending on SDK version.
    string_data = {str(k): str(v) for k, v in notification.data.items()}
    string_data["notification_type"] = notification.notification_type
    string_data["notification_id"] = str(notification.id)

    message = messaging.MulticastMessage(
        notification=messaging.Notification(title=notification.title, body=notification.body),
        data=string_data,
        tokens=tokens,
    )
    response = messaging.send_each_for_multicast(message)
    notification.mark_push_sent()

    if response.failure_count:
        # A failed token here is often a stale/uninstalled-app token.
        # Worth eventually pruning those from DeviceToken — not done
        # here, since that write needs the real DeviceToken shape
        # too (same caveat as _get_device_tokens above).
        logger.warning(
            "FCM: %s/%s deliveries failed for notification %s",
            response.failure_count, len(tokens), notification.id,
        )


def notify(
    *,
    recipient,
    notification_type: str,
    title: str,
    body: str = "",
    data: Optional[dict] = None,
    send_push: bool = True,
) -> Notification:
    """THE entry point every other app's service calls when
    something notification-worthy happens — e.g. from
    team.services.invitation_service.create_direct_invitation():

        notify(
            recipient=invited_user,
            notification_type=NotificationType.TEAM_INVITATION_RECEIVED,
            title="New team invitation",
            body=f"{invited_by.username} invited you to join {team.name}",
            data={"team_id": str(team.id), "team_slug": team.slug, "invitation_id": str(invitation.id)},
        )

    The in-app Notification row is ALWAYS created, even if the push
    fails or Firebase isn't configured at all — a user should still
    see it in their notification list either way. Push is attempted
    as a side effect, wrapped so it can never roll back or block on
    the actual notification existing. This is also why `notify()` is
    NOT wrapped in @transaction.atomic with the push call inside it:
    an atomic block would have no effect on an external HTTP call to
    Firebase anyway, and wrapping just the DB write in one adds
    nothing since it's already a single, already-atomic INSERT.
    """
    notification = Notification.objects.create(
        recipient=recipient,
        notification_type=notification_type,
        title=title,
        body=body,
        data=data or {},
    )

    if send_push:
        try:
            _send_push_for_notification(notification)
        except Exception:
            logger.exception("Push send failed for notification %s", notification.id)

    return notification


def mark_notification_read(*, notification: Notification, user) -> Notification:
    """The view's queryset already scopes lookups to the requesting
    user's own notifications (so a wrong id 404s before this is ever
    called) — this check is defense-in-depth, matching the same
    belt-and-braces pattern used elsewhere (e.g. send_text_message's
    length check duplicating what the serializer already enforces),
    not the only thing standing between a user and someone else's
    notification.
    """
    if notification.recipient_id != user.id:
        raise PermissionDenied("You can only mark your own notifications as read.")
    notification.mark_read()
    return notification


def mark_all_read(*, user) -> int:
    """Bulk .update() rather than looping mark_read() per row — one
    UPDATE query instead of N, and correctness doesn't need the
    per-row 'already read, skip' guard mark_read() has, since this
    only ever touches rows already filtered to unread().
    """
    now = timezone.now()
    return Notification.objects.for_user(user).unread().update(is_read=True, read_at=now)


def get_unread_count(*, user) -> int:
    """Trivial compared to chat's unread-count aggregation — each
    Notification row carries its own is_read flag directly, so this
    is a single indexed COUNT, no cross-table subquery needed.
    """
    return Notification.objects.for_user(user).unread().count()
