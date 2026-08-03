import hashlib
import logging
import secrets
import uuid
from datetime import timedelta

from django.utils import timezone

from accounts.models import DeviceToken, UserSession
from core.utils.constant import DeviceType, REVOKE_REASON_CHOICES

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# EXCEPTIONS
# ─────────────────────────────────────────────────────────────────────────────

class SessionException(Exception):
    """Base exception for all session errors."""
    pass


class SessionNotFoundError(SessionException):
    """
    Raised when session cannot be found by token hash.
    View returns HTTP 401 Unauthorized.
    """
    pass


class SessionExpiredError(SessionException):
    """
    Raised when session exists but has expired.
    View returns HTTP 401 Unauthorized.
    Flutter should attempt token refresh on receiving this.
    """
    pass


class SessionRevokedError(SessionException):
    """
    Raised when session has been explicitly revoked.
    View returns HTTP 401 Unauthorized.
    Flutter must redirect to login screen.
    """
    pass


class RefreshTokenExpiredError(SessionException):
    """
    Raised when refresh token has expired.
    User must login again — no automatic recovery possible.
    View returns HTTP 401 Unauthorized.
    """
    pass


class RefreshTokenInvalidError(SessionException):
    """
    Raised when refresh token hash not found or already revoked.
    View returns HTTP 401 Unauthorized.
    """
    pass


# ─────────────────────────────────────────────────────────────────────────────
# SESSION SERVICE
# ─────────────────────────────────────────────────────────────────────────────

class SessionService:
    """
    Handles all session lifecycle:
    - Generate cryptographically secure tokens
    - Hash tokens before storage (SHA-256)
    - Create UserSession record
    - Create DeviceToken record
    - Validate session on every API request
    - Refresh expired session token using refresh token
    - Revoke single session (logout)
    - Revoke all sessions for user (password change / account block)

    SECURITY RULES:
    - Raw tokens are NEVER stored in the database
    - Raw tokens are returned to Flutter ONCE at login/signup
    - All subsequent lookups use SHA-256 hashes
    - Refresh token rotation: each refresh issues a brand new refresh token
      and invalidates the old one — prevents refresh token reuse attacks

    Token lifetimes:
    - session_token  → 7 days  (ACCESS_TOKEN_LIFETIME)
    - refresh_token  → 30 days (REFRESH_TOKEN_LIFETIME)

    Usage:
        service = SessionService()

        # create session at login
        result = service.create_session(
            user=user,
            device_id='uuid-from-flutter',
            device_name='Samsung Galaxy S22',
            device_type='mobile',
            ip_address='192.168.1.1',
            user_agent='Dart/3.0 Flutter/3.0',
            fcm_token='fcm-token-from-firebase',
            is_privileged=False,
        )

        # validate on every API request
        session = service.get_valid_session(raw_token='...')

        # refresh expired session token
        result = service.refresh_session(raw_refresh_token='...')

        # logout current device
        service.revoke_session(session=session, reason='user_logout')

        # logout all devices
        service.revoke_all_sessions(user_id=user.id, exclude_session_id=session.id)
    """

    # token lifetimes
    ACCESS_TOKEN_LIFETIME_DAYS  = 7
    REFRESH_TOKEN_LIFETIME_DAYS = 30

    # ── private helpers ──

    def _generate_raw_token(self) -> str:
        """
        Generates a cryptographically secure random token.
        Uses secrets.token_hex — suitable for security-sensitive tokens.
        Returns 64-character hex string (32 bytes of entropy).
        """
        return secrets.token_hex(32)

    def _hash_token(self, raw_token: str) -> str:
        """
        SHA-256 hash of raw token.
        This is what gets stored in the database.
        Raw token is sent to Flutter once and never stored.
        """
        return hashlib.sha256(raw_token.encode()).hexdigest()

    def _get_ip_address(self, request) -> str | None:
        """
        Extracts real IP from request.
        Checks X-Forwarded-For header first — set by nginx/load balancer.
        Falls back to REMOTE_ADDR for direct connections.
        """
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            # X-Forwarded-For can contain multiple IPs — first is the real client
            return x_forwarded_for.split(',')[0].strip()
        return request.META.get('REMOTE_ADDR')

    def _get_user_agent(self, request) -> str | None:
        """Extracts user agent string from request headers."""
        return request.META.get('HTTP_USER_AGENT')

    # ── public methods ──

    def create_session(
        self,
        user,
        device_id: str,
        device_name: str | None = None,
        device_type: str = DeviceType.MOBILE,
        ip_address: str | None = None,
        user_agent: str | None = None,
        fcm_token: str | None = None,
        is_privileged: bool = False,
    ) -> dict:
        """
        Creates a new UserSession and DeviceToken.

        Flow:
        1. Revoke any existing active session for this device
           (enforces unique_active_session_per_device constraint)
        2. Generate raw session_token and refresh_token
        3. Hash both tokens
        4. Create UserSession with hashed tokens
        5. Create or replace DeviceToken with fcm_token
        6. Record login on user model
        7. Return raw tokens to caller (auth_service passes to Flutter)

        Raw tokens are returned ONCE here — never retrievable again.

        Args:
            user: User instance
            device_id: Flutter device fingerprint
            device_name: Human readable device name
            device_type: mobile / desktop / web
            ip_address: Client IP address
            user_agent: HTTP user agent string
            fcm_token: Firebase FCM token (optional)
            is_privileged: True for admin/owner sessions

        Returns:
            dict with keys:
                session_token     → raw token sent to Flutter
                refresh_token     → raw refresh token sent to Flutter
                expires_at        → session expiry datetime
                refresh_expires_at → refresh token expiry datetime
                session           → UserSession instance
        """

        now = timezone.now()
        expires_at         = now + timedelta(days=self.ACCESS_TOKEN_LIFETIME_DAYS)
        refresh_expires_at = now + timedelta(days=self.REFRESH_TOKEN_LIFETIME_DAYS)

        # step 1 — revoke existing session for this device
        # prevents duplicate active sessions on same device
        revoked_count = UserSession.revoke_for_device(
            user_id=user.id,
            device_id=device_id,
            reason=REVOKE_REASON_CHOICES.REVOKE_PRE_CREATE_CLEANUP,
        )
        if revoked_count:
            logger.info(
                'Revoked existing session before creating new one',
                extra={
                    'user_id': str(user.id),
                    'device_id': device_id,
                    'revoked_count': revoked_count,
                }
            )

        # step 2 — generate raw tokens (kept in memory only)
        raw_session_token  = self._generate_raw_token()
        raw_refresh_token  = self._generate_raw_token()

        # step 3 — hash both tokens for storage
        session_token_hash = self._hash_token(raw_session_token)
        refresh_token_hash = self._hash_token(raw_refresh_token)

        # step 4 — create session record
        session = UserSession.objects.create(
            user=user,
            device_id=device_id,
            device_name=device_name,
            device_type=device_type,
            user_agent=user_agent,
            ip_address=ip_address,
            session_token_hash=session_token_hash,
            refresh_token_hash=refresh_token_hash,
            expires_at=expires_at,
            refresh_expires_at=refresh_expires_at,
            last_activity_at=now,
            admin_or_owner=is_privileged,
        )

        # step 5 — create or replace device token for push notifications
        if fcm_token:
            try:
                DeviceToken.replace_token_for_device(
                    user_id=user.id,
                    device_id=device_id,
                    fcm_token=fcm_token,
                    session=session,
                    device_name=device_name,
                    device_type=device_type,
                )
            except Exception as e:
                # FCM token failure must never block login
                # log it and continue — user can still login without notifications
                logger.error(
                    f'Failed to create DeviceToken — login continues without FCM {str(e)}',
                    extra={
                        'user_id': str(user.id),
                        'device_id': device_id,
                        'error': str(e),
                    }
                )

        # step 6 — record login timestamp and IP on user model
        user.record_login(ip_address=ip_address)

        logger.info(
            'Session created',
            extra={
                'user_id': str(user.id),
                'device_id': device_id,
                'session_id': str(session.id),
                'expires_at': expires_at.isoformat(),
            }
        )

        # step 7 — return raw tokens — only time they are ever accessible
        return {
            'session_token':      raw_session_token,
            'refresh_token':      raw_refresh_token,
            'expires_at':         expires_at,
            'refresh_expires_at': refresh_expires_at,
            'session':            session,
        }

    def get_valid_session(self, raw_token: str) -> UserSession:
        """
        Validates a session token on every API request.
        Called by authentication middleware.

        Flow:
        1. Hash the raw token
        2. Look up session by hash
        3. Check not revoked
        4. Check not expired
        5. Return valid session

        Raises:
            SessionNotFoundError: token hash not in database
            SessionRevokedError: session was explicitly revoked
            SessionExpiredError: session has passed expires_at

        This method is called on EVERY authenticated API request.
        It must be fast — the index on session_token_hash ensures O(1) lookup.
        """
        token_hash = self._hash_token(raw_token)

        session = (
            UserSession.objects
            .by_token_hash(token_hash)
            .select_related('user')
            .first()
        )

        if not session:
            raise SessionNotFoundError(
                'Session not found. Please login again.'
            )

        if session.is_revoked:
            raise SessionRevokedError(
                'Session has been revoked. Please login again.'
            )

        if session.is_expired:
            raise SessionExpiredError(
                'Session has expired. Please refresh your token.'
            )

        return session

    def refresh_session(self, raw_refresh_token: str) -> dict:
        """
        Issues a new session_token using a valid refresh_token.
        Implements refresh token rotation — old refresh token is invalidated
        and a brand new one is issued. Prevents refresh token reuse attacks.

        Flow:
        1. Hash the raw refresh token
        2. Look up session by refresh token hash
        3. Check session not revoked
        4. Check refresh token not expired (refresh_expires_at)
        5. Generate new raw session_token
        6. Generate new raw refresh_token (rotation)
        7. Update session with new hashes and new expires_at
        8. Return new raw tokens to Flutter

        Raises:
            RefreshTokenInvalidError: refresh token hash not found or revoked
            RefreshTokenExpiredError: refresh_expires_at has passed

        Called by:
            auth_service.refresh_token()
        """
        refresh_hash = self._hash_token(raw_refresh_token)

        session = (
            UserSession.objects
            .by_refresh_hash(refresh_hash)
            .select_related('user')
            .first()
        )

        if not session:
            raise RefreshTokenInvalidError(
                'Refresh token not found. Please login again.'
            )

        if session.is_revoked:
            raise RefreshTokenInvalidError(
                'Session has been revoked. Please login again.'
            )

        # check refresh token expiry — different from session expiry
        if not session.is_refresh_valid:
            raise RefreshTokenExpiredError(
                'Refresh token has expired. Please login again.'
            )

        now = timezone.now()
        new_expires_at = now + timedelta(days=self.ACCESS_TOKEN_LIFETIME_DAYS)

        # generate new tokens — rotation means old refresh token dies here
        new_raw_session_token  = self._generate_raw_token()
        new_raw_refresh_token  = self._generate_raw_token()

        new_session_token_hash  = self._hash_token(new_raw_session_token)
        new_refresh_token_hash  = self._hash_token(new_raw_refresh_token)

        # update session with new tokens and extended expiry
        session.session_token_hash = new_session_token_hash
        session.refresh_token_hash = new_refresh_token_hash
        session.expires_at         = new_expires_at
        session.last_activity_at   = now
        session.save(update_fields=[
            'session_token_hash',
            'refresh_token_hash',
            'expires_at',
            'last_activity_at',
        ])

        logger.info(
            'Session refreshed',
            extra={
                'user_id': str(session.user_id),
                'session_id': str(session.id),
                'new_expires_at': new_expires_at.isoformat(),
            }
        )

        return {
            'session_token':      new_raw_session_token,
            'refresh_token':      new_raw_refresh_token,
            'expires_at':         new_expires_at,
            'refresh_expires_at': session.refresh_expires_at,
            'session':            session,
        }

    def revoke_session(
        self,
        session: UserSession,
        reason: str = REVOKE_REASON_CHOICES.REVOKE_LOGOUT,
    ) -> None:
        """
        Revokes a single session — logout from current device.
        Also deactivates the FCM DeviceToken for this session
        so no more push notifications go to this device.

        Called by:
            auth_service.logout()
        """
        session.revoke(reason=reason)

        # deactivate FCM token for this session
        try:
            DeviceToken.deactivate_for_session(
                session_id=session.id,
                reason='session_revoked',
            )
        except Exception as e:
            # DeviceToken failure must never block logout
            logger.error(
                'Failed to deactivate DeviceToken on logout',
                extra={
                    'session_id': str(session.id),
                    'error': str(e),
                }
            )

        logger.info(
            'Session revoked',
            extra={
                'user_id': str(session.user_id),
                'session_id': str(session.id),
                'reason': reason,
            }
        )

    def revoke_all_sessions(
        self,
        user_id: uuid.UUID,
        reason: str = REVOKE_REASON_CHOICES.REVOKE_SYSTEM,
        exclude_session_id: uuid.UUID | None = None,
    ) -> int:
        """
        Revokes all active sessions for a user.
        Used on:
        - Password change → exclude current session so user stays logged in here
        - Account block → exclude nothing, kill everything
        - Forced logout all devices → exclude nothing

        Also deactivates all FCM DeviceTokens for this user
        so no push notifications go to any device.

        Returns:
            int: number of sessions revoked

        Called by:
            auth_service.logout_all()
            auth_service.reset_password()
            profile_service.change_password()
        """
        count = UserSession.revoke_all_for_user(
            user_id=user_id,
            reason=reason,
            exclude_session_id=exclude_session_id,
        )

        # deactivate all FCM tokens for this user
        try:
            DeviceToken.deactivate_for_user(
                user_id=user_id,
                reason='all_sessions_revoked',
            )
        except Exception as e:
            logger.error(
                'Failed to deactivate DeviceTokens on revoke_all',
                extra={
                    'user_id': str(user_id),
                    'error': str(e),
                }
            )

        logger.info(
            'All sessions revoked for user',
            extra={
                'user_id': str(user_id),
                'revoked_count': count,
                'reason': reason,
                'excluded_session': str(exclude_session_id) if exclude_session_id else None,
            }
        )

        return count

    def touch_session(self, session: UserSession) -> None:
        """
        Updates last_activity_at on session.
        Called by middleware via Redis throttle — at most once per 5 minutes.
        Redis throttle prevents a database write on every single API request.

        Redis key pattern: session_touch:{session_id}
        TTL: 5 minutes

        Middleware pseudocode:
            key = f'session_touch:{session.id}'
            if not redis.exists(key):
                session_service.touch_session(session)
                redis.setex(key, 300, '1')  # 300 seconds = 5 minutes
        """
        session.touch()

    def get_active_sessions_for_user(self, user_id: uuid.UUID) -> list:
        """
        Returns all active sessions for a user.
        Used by Flutter active sessions screen where user can
        see all their logged-in devices and revoke them individually.

        Returns:
            QuerySet of active UserSession objects
        """
        return (
            UserSession.objects
            .active_sessions_for_user(user_id)
            .order_by('-last_activity_at')
        )

    def cleanup_expired_sessions(self) -> int:
        """
        Marks expired but not revoked sessions as revoked.
        Called by Celery beat task daily.

        Returns:
            int: number of sessions cleaned up
        """
        count = UserSession.cleanup_expired()
        logger.info(
            'Expired sessions cleaned up',
            extra={'cleaned_count': count}
        )
        return count

    def hard_delete_old_sessions(self, older_than_days: int = 90) -> int:
        """
        Permanently deletes revoked sessions older than N days.
        Called by Celery beat task weekly.
        Keeps user_sessions table from growing indefinitely.

        Returns:
            int: number of sessions deleted
        """
        count = UserSession.hard_delete_old_sessions(older_than_today=older_than_days)
        logger.info(
            'Old sessions hard deleted',
            extra={'deleted_count': count, 'older_than_days': older_than_days}
        )
        return count