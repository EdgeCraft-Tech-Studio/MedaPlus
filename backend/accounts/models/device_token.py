import uuid

from django.db import models, transaction
from django.utils import timezone

from core.utils.base import TimeStampedModel
from core.utils.constant import DeviceType


# ─────────────────────────────────────────────
# QUERYSET
# ─────────────────────────────────────────────

class DeviceTokenQuerySet(models.QuerySet):

    def active(self):
        """Tokens that are active and not expired."""
        return self.filter(is_active=True)

    def for_user(self, user_id):
        """All device tokens for a specific user."""
        return self.filter(user_id=user_id)

    def active_for_user(self, user_id):
        """
        Active tokens for a user.
        Used by FCM service to know which devices to push to.
        """
        return self.active().filter(user_id=user_id)

    def by_device_id(self, device_id: str):
        """Find token by device fingerprint."""
        return self.filter(device_id=device_id)

    def by_fcm_token(self, fcm_token: str):
        """Find by raw FCM token. Used to prevent duplicates."""
        return self.filter(fcm_token=fcm_token)

    def stale(self, days: int = 60):
        """
        Tokens not updated in N days.
        FCM tokens expire or become invalid over time.
        Called by Celery to clean up dead tokens.

        NOTE: tokens where last_used_at=None are intentionally excluded —
        those are brand new tokens that have never received a notification.
        They are handled separately by the orphaned token cleanup task,
        not by this stale check. PostgreSQL NULL does not match __lt,
        so the exclusion happens automatically at the database level.
        """
        cutoff = timezone.now() - timezone.timedelta(days=days)
        return self.filter(last_used_at__lt=cutoff, is_active=True)


# ─────────────────────────────────────────────
# MANAGER
# ─────────────────────────────────────────────

class DeviceTokenManager(models.Manager):

    def get_queryset(self):
        return DeviceTokenQuerySet(self.model, using=self._db)

    def active(self):
        return self.get_queryset().active()

    def for_user(self, user_id):
        return self.get_queryset().for_user(user_id)

    def active_for_user(self, user_id):
        return self.get_queryset().active_for_user(user_id)

    def by_device_id(self, device_id: str):
        return self.get_queryset().by_device_id(device_id)

    def by_fcm_token(self, fcm_token: str):
        return self.get_queryset().by_fcm_token(fcm_token)

    def stale(self, days: int = 60):
        return self.get_queryset().stale(days)


# ─────────────────────────────────────────────
# MODEL
# ─────────────────────────────────────────────

class DeviceToken(TimeStampedModel):
    """
    Stores Firebase FCM tokens per device per user.

    PURPOSE:
    Flutter sends an FCM token on every login.
    We store it here so the notification service knows
    which device to push to when events happen
    (outbid, auction won, auction ending soon etc).

    One user can have multiple active tokens
    if they use multiple devices.

    One device can only have one active token at a time —
    enforced by unique_active_token_per_device constraint.
    """

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
        db_index=True
    )

    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='device_tokens',
        db_index=True,
        help_text='User this FCM token belongs to.'
    )

    session = models.OneToOneField(
        'accounts.UserSession',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='device_token',
        help_text=(
            'Session this token was registered with. '
            'SET_NULL (not CASCADE) is intentional — when a session is '
            'revoked the token becomes orphaned and is cleaned up by '
            'Celery rather than being hard-deleted immediately, giving '
            'in-flight notifications a chance to complete.'
        )
    )

    fcm_token = models.TextField(
    help_text=(
        'Raw Firebase Cloud Messaging token sent by Flutter on login. '
        'FCM tokens can be long — use TextField not CharField.'
    )
)

    device_id = models.CharField(
        max_length=255,
        db_index=True,
        help_text=(
            'Device fingerprint from Flutter. '
            'Same device_id used in UserSession. '
            'Links token to a specific physical device.'
        )
    )

    device_name = models.CharField(
        max_length=150,
        null=True,
        blank=True,
        help_text='Human readable device name. Example: Samsung Galaxy S22.'
    )

    device_type = models.CharField(
        max_length=20,
        choices=DeviceType.choices,
        default=DeviceType.MOBILE,
        help_text='mobile / desktop / web.'
    )

    is_active = models.BooleanField(
        default=True,
        db_index=True,
        help_text=(
            'False when session is revoked or FCM reports token as invalid. '
            'Inactive tokens are skipped by notification service.'
        )
    )

    deactivated_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text='When this token was deactivated.'
    )

    deactivated_reason = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        help_text=(
            'Why token was deactivated. '
            'Examples: session_revoked, fcm_invalid, user_logout, replaced_by_new_token.'
        )
    )

    last_used_at = models.DateTimeField(
        null=True,
        blank=True,
        db_index=True,
        help_text=(
            'Last time a notification was successfully sent to this token. '
            'Null on brand new tokens — those are handled by orphan cleanup, '
            'not by the stale() queryset. '
            'Used by Celery to detect and deactivate genuinely stale tokens.'
        )
    )

    objects = DeviceTokenManager()

    class Meta:
        db_table = 'device_tokens'
        verbose_name = 'Device Token'
        verbose_name_plural = 'Device Tokens'
        ordering = ['-created_at']
        indexes = [
            # notification service: get all active tokens for a user
            models.Index(
                fields=['user', 'is_active'],
                name='idx_device_token_user_active'
            ),
            # find token by device fingerprint
            models.Index(
                fields=['device_id', 'is_active'],
                name='idx_device_token_device'
            ),
            # celery stale token cleanup
            models.Index(
                fields=['last_used_at', 'is_active'],
                name='idx_device_token_stale'
            ),
        ]

        constraints = [
            models.UniqueConstraint(
                fields=['user', 'device_id'],
                condition=models.Q(is_active=True),
                name='unique_active_token_per_user_device'
            )
        ]
    def __str__(self):
        # Uses device_id and user_id (FK integers) instead of
        # self.user.full_name to avoid a SELECT query on every __str__ call.
        # Django admin list views call __str__ once per row — using a
        # related field here would cause N+1 queries across the entire list.
        return (
            f'DeviceToken(user={self.user_id} '
            f'device={self.device_name or str(self.device_id)[:12]} '
            f'status={"active" if self.is_active else "inactive"})'
        )

    # ─────────────────────────────────────────
    # PROPERTIES
    # ─────────────────────────────────────────

    @property
    def is_orphaned(self) -> bool:
        """
        True when the linked session has been deleted/nulled but the
        token row still exists. Orphaned tokens are deactivated by the
        Celery cleanup task, not immediately on session revocation,
        to allow any in-flight notification deliveries to complete.
        """
        return self.session_id is None

    # ─────────────────────────────────────────
    # INSTANCE METHODS
    # ─────────────────────────────────────────

    def deactivate(self, reason: str = 'unknown'):
        """
        Deactivate this token.
        Called when:
        - Session is revoked (user logout)
        - FCM reports token as invalid
        - New token registered for same device (replaced)
        - Token is found to be orphaned during cleanup
        """
        if not self.is_active:
            return
        self.is_active = False
        self.deactivated_at = timezone.now()
        self.deactivated_reason = reason
        self.save(update_fields=['is_active', 'deactivated_at', 'deactivated_reason'])

    def touch(self):
        """
        Update last_used_at after successful notification delivery.
        Called by FCM service after every successful push.
        Keeps the token alive in the stale() queryset check.
        """
        self.last_used_at = timezone.now()
        self.save(update_fields=['last_used_at'])

    # ─────────────────────────────────────────
    # CLASS METHODS
    # ─────────────────────────────────────────

    @classmethod
    def deactivate_for_session(
        cls,
        session_id: uuid.UUID,
        reason: str = 'session_revoked'
    ) -> int:
        """
        Bulk-deactivate all tokens tied to a specific session.
        Called automatically when UserSession.revoke() is called.
        Uses bulk update — one SQL statement regardless of token count.
        """
        return cls.objects.filter(
            session_id=session_id,
            is_active=True
        ).update(
            is_active=False,
            deactivated_at=timezone.now(),
            deactivated_reason=reason
        )

    @classmethod
    def deactivate_for_user(
        cls,
        user_id: uuid.UUID,
        reason: str = 'user_logout'
    ) -> int:
        """
        Bulk-deactivate all tokens for a user.
        Called when user changes password or account is suspended.
        Uses bulk update — one SQL statement regardless of token count.
        """
        return cls.objects.filter(
            user_id=user_id,
            is_active=True
        ).update(
            is_active=False,
            deactivated_at=timezone.now(),
            deactivated_reason=reason
        )

    @classmethod
    def cleanup_stale(cls, days: int = 60) -> int:
        """
        Bulk-deactivate tokens not used in N days.
        Called weekly by Celery beat task.
        FCM tokens become invalid over time — no point keeping them active.
        Returns the count of tokens deactivated for task logging.
        """
        return cls.objects.stale(days).update(
            is_active=False,
            deactivated_at=timezone.now(),
            deactivated_reason='stale_cleanup'
        )

    @classmethod
    def replace_token_for_device(
        cls,
        user_id: uuid.UUID,
        device_id: str,
        fcm_token: str,
        session,
        device_name: str = None,
        device_type: str = DeviceType.MOBILE,
    ) -> 'DeviceToken':
        """
        Called on every login from Flutter.
        Deactivates the old token for this device and creates a fresh one.

        Handles the case where FCM issues a new token after:
        - App reinstall
        - Token rotation by Firebase
        - OS-level token refresh

        ATOMIC: both the deactivation and the creation are wrapped in a
        single database transaction. If the CREATE fails after the UPDATE
        succeeds, the entire operation rolls back — the user's old token
        remains active and they continue receiving notifications instead
        of silently losing push delivery until their next login.
        """
        with transaction.atomic():
            # Deactivate any existing active token for this device
            cls.objects.filter(
                user_id=user_id,
                device_id=device_id,
                is_active=True
            ).update(
                is_active=False,
                deactivated_at=timezone.now(),
                deactivated_reason='replaced_by_new_token'
            )

            # Create and return the fresh token
            return cls.objects.create(
                user_id=user_id,
                session=session,
                fcm_token=fcm_token,
                device_id=device_id,
                device_name=device_name,
                device_type=device_type,
                last_used_at=timezone.now()
            )