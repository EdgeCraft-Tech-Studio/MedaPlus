import hashlib
import secrets
import uuid
from django.db import models
from django.utils import timezone
from core.utils.constant import DeviceType, REVOKE_REASON_CHOICES


class UserSessionQueryset(models.QuerySet):
    
    def is_active(self):
        return self.filter(
            is_revoked=False,
            expires_at__gt=timezone.now()
        )
    
    def is_not_revoked(self):
        return self.filter(is_revoked=False)
    
    def allsessions_for_user(self, user_id):
        """ all sessions for user including expired and revoked"""
        return self.filter(user_id=user_id)
    
    def active_sessions_for_user(self, user_id):
        """ valid sessions for user """
        return self.is_active().filter(user_id=user_id)
    
    def is_expired(self):
        """ used by celery cleanup """
        return self.filter(expires_at__lte=timezone.now())

    def expired_not_revoked(self):
        """  celery must marj these as revoked """
        return self.filter(
            expires_at__lte=timezone.now(),
            is_revoked=False
        )
    
    def is_revoked(self):
        return self.filter(is_revoked=True)
    
    def by_token_hash(self, token_hash: str):
        """ 
            find session by it's token hash.
            used by middlewate on every API request.
        """
        return self.filter(session_token_hash=token_hash)
    
    def by_refresh_hash(self, refresh_hash: str):
        """
            find session by it's refresh token hash.
            used during token refresh flow.
        """
        return self.filter(refresh_token_hash=refresh_hash)
    
    def created_today(self):
        """Sessions created today. Security monitoring."""
        today = timezone.now().date()
        return self.filter(created_at__date=today)

    def recently_active(self, minutes: int = 30):
        """
        Sessions active within last N minutes.
        Useful for counting truly online users.
        Example: UserSession.objects.recently_active(minutes=15)
        """
        cutoff = timezone.now() - timezone.timedelta(minutes=minutes)
        return self.is_active().filter(last_activity_at__gte=cutoff)


    
class UserSessionManager(models.Manager):
    
    def get_queryset(self):
        return UserSessionQueryset(self.model, using=self._db)
    
    def is_active(self):
        return self.get_queryset().is_active()
    
    def is_not_revoked(self):
        return self.get_queryset().is_not_revoked()

    def allsessions_for_user(self, user_id):
        return self.get_queryset().allsessions_for_user(user_id)

    def active_sessions_for_user(self, user_id):
        return self.get_queryset().active_sessions_for_user(user_id)

    def is_expired(self):
        return self.get_queryset().is_expired()

    def expired_not_revoked(self):
        return self.get_queryset().expired_not_revoked()

    def is_revoked(self):
        return self.get_queryset().is_revoked()

    def by_token_hash(self, token_hash: str):
        return self.get_queryset().by_token_hash(token_hash)

    def by_refresh_hash(self, refresh_hash: str):
        return self.get_queryset().by_refresh_hash(refresh_hash)

    def recently_active(self, minutes: int = 30):
        return self.get_queryset().recently_active(minutes)



class UserSession(models.Model):


    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
        db_index=True
    ) 

    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='sessions',
        db_index=True,
        help_text='which user this session belongs to'
    )

    device_id = models.CharField(
        max_length=225,
        db_index=True,
        help_text='device fingerprint from flutter app'
    )
    
    device_name = models.CharField(
        max_length=150,
        blank=True,
        null=True,
        help_text='Human-readable device name. Example: Samsung s22'
    )

    admin_or_owner = models.BooleanField(default=False)

    device_type = models.CharField(
        max_length=20,
        choices=DeviceType.choices,
        default=DeviceType.MOBILE,
        db_index=True,
        help_text='mobile / desktop / website'
    )

    user_agent = models.TextField(
        blank=True,
        null=True,
        help_text='Full Http user-agent string'
    )

    ip_address = models.GenericIPAddressField(
        null=True,
        blank=True,
        db_index=True,
        help_text='Ip as session creation'
    )

    # SECURITY RULE: NEVER store raw tokens.
    # Raw token → SHA-256 → stored here.
    session_token_hash = models.CharField(
        max_length=64,
        unique=True,
        db_index=True,
        help_text='SHA-256 hash of session token. Raw token sent to client once.'
    )

    refresh_token_hash = models.CharField(
        max_length=64,
        unique=True,
        db_index=True,
        help_text='SHA-256 hash of refresh token. Used for session rotation.'
    )

    refresh_expires_at = models.DateTimeField(
        help_text='Refresh token hard expiry. After this user must login again.'
    )
    expires_at = models.DateTimeField(
        db_index=True,
        help_text=(
            'Hard session expiry. Session is invalid after this regardless of activity. '
            'Default: 7 days. Extended by refresh token (up to 30 days total).'
        )
    )

    last_activity_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text=(
            'Last confirmed activity. Updated max once per 5 min via Redis throttle. '
            'Used for "online now" detection and inactive session cleanup.'
        )
    )

    is_revoked = models.BooleanField(
        default=False,
        db_index=True,
        help_text=(
            'True = session manually invalidated before natural expiry. '
            'Once True, never set back to False. '
            'Check revoke_reason for why it was revoked.'
        )
    )

    
    revoke_reason = models.CharField(
        max_length=50,
        choices= REVOKE_REASON_CHOICES, 
        null=True,
        blank=True,
        help_text=(
            'Why this session was revoked. '
            'Null while session is still active. '
            'Always set when is_revoked becomes True.'
        )
    )
    
    
    revoked_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text='When this session was revoked. Null if still active.'
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
        db_index=True,
    )

    objects = UserSessionManager()

    class Meta:
        db_table = "user_sessions"
        verbose_name = "User Session"
        verbose_name_plural = "User Sessions"
        ordering = ['-created_at']
        indexes = [
            # mostly tooken lookup is frequent
            models.Index(
                fields=['session_token_hash'],
                name='idx_session_token'
            ),

            # middleware: is session still active
            models.Index(
                fields=['session_token_hash', 'is_revoked', 'expires_at'],
                name='idx_session_valid'
            ),

            #session find by refresh toke
            models.Index(
                fields=['refresh_token_hash', 'is_revoked'],
                name='idx_refresh_token_revoked'
            ),
            # find expired but not revoked
            models.Index(
                fields=['user', 'device_id', 'is_revoked'],
                name='idx_deviced_revoked'
            ),
            
            # celery cleanup
            models.Index(
                fields=['expires_at', 'is_revoked'],
                name='idx_session_expire_revoked'
            ),

            #recently active queries
            models.Index(
                fields=['last_activity_at'],
                name='idx_session_last_activity'
            )
        ]

        constraints = [
            models.UniqueConstraint(
                fields=['user', 'device_id'],
                condition=models.Q(is_revoked=False),
                name='unique_active_session_per_device'
            )
        ]

    def __str__(self):
        return (
            f'{self.user.first_name}'
            f'— {self.device_name or self.device_id[:12]}'
            f'— {"Active" if self.is_valid else "REVOKED/EXPIRED"}'
        )
    
    # ---- PROPERTIES ----

    @property
    def is_expired(self) -> bool:
        """ True when session pass date """
        return timezone.now() > self.expires_at
    
    @property
    def is_valid(self):
        """ signle check used by middleware on every api reques """
        return not self.is_revoked and not self.is_expired
    
    @property
    def is_staff_session(self) -> bool:
        return self.admin_or_owner
    
    @property
    def minutes_since_activity(self) -> int | None:
        """ minutes since last activity """
        if not self.last_activity_at:
            return None
        delta = timezone.now() - self.last_activity_at
        return int(delta.total_seconds() / 60)
    
    @property
    def is_recently_active(self) -> bool:
        """ True if session was active in the last 30 minute """
        minutes = self.minutes_since_activity
        return minutes is not None and minutes <= 30
    
    @property
    def is_refresh_valid(self) -> bool:

        return (
            not self.is_revoked
            and timezone.now() < self.refresh_expires_at
        )

    # ---- method ----
    def revoke(self, reason: str = None):
        """ - revokes this sessions 
            - Once revoked, session_token and refresh_token are permanently invalid.
            - always send reason to audit trial
        """
        if self.is_revoked:
            return
        self.is_revoked = True
        self.revoke_reason = reason or REVOKE_REASON_CHOICES.REVOKE_SYSTEM
        self.revoked_at = timezone.now()
        self.save(update_fields=['is_revoked', 'revoke_reason', 'revoked_at'])

    def touch(self):
        """ update last activity called by middleware via redis throttle - at most 1 per 5 minute """
        self.last_activity_at = timezone.now()
        self.save(update_fields=['last_activity_at'])

    def extend(self, new_expires_at):
        """ extends session expiry after successful refresh """
        self.expires_at = new_expires_at
        self.save(update_fields=['expires_at'])

    

    # ---- class methods ----

    @classmethod
    def revoke_for_device(
        cls, user_id: uuid.UUID, device_id: str, reason: str = None
    ) -> int:
        """ call this before every new session creation old session sould be revoked, if exist"""
        revoked_reason = reason or REVOKE_REASON_CHOICES.REVOKE_PRE_CREATE_CLEANUP
        count = cls.objects.filter(
            user_id=user_id,
            device_id=device_id,
            is_revoked=False
        ).update(
            is_revoked=True,
            revoke_reason=revoked_reason,
            revoked_at=timezone.now()
        )
        return count

    @classmethod
    def revoke_all_for_user(
        cls, user_id: uuid.UUID, reason: str = None, exclude_session_id: uuid.UUID = None
    ):
        """ revoke all active session for a user excluding one this 
            is essensial for password change old sessions will logout
            and login again while the current change action performed is excluded
        """
        qs = cls.objects.active_sessions_for_user(user_id)
        if exclude_session_id:
            qs = qs.exclude(id=exclude_session_id)
        return qs.update(
            is_revoked=True,
            revoke_reason=reason or REVOKE_REASON_CHOICES.REVOKE_SYSTEM,
            revoked_at=timezone.now()
        )
    
    @classmethod
    def get_active_count_for_user(cls, user_id: uuid.UUID) -> int:
        """ active session count for a user """
        return cls.objects.active_sessions_for_user(user_id).count()
    
    @classmethod
    def cleanup_expired(cls) -> int:
        """ mark ass expired but not revoked session as revoked """
        return cls.objects.expired_not_revoked().update(
            is_revoked=True,
            revoke_reason=REVOKE_REASON_CHOICES.REVOKE_SYSTEM,
            revoked_at=timezone.now()
        )
    
    @classmethod
    def hard_delete_old_sessions(
        cls, older_than_today: int = 90) -> int:
        """ 
            permanently delete revoked sessions older than n days
            called by celery beat task weekly
        """
        cutoff = timezone.now() - timezone.timedelta(days=older_than_today)
        count, _ = cls.objects.filter(
            is_revoked=True,
            revoked_at__lt=cutoff
        ).delete()
        return count