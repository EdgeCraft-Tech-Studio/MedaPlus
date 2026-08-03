import hashlib
import logging

from django.contrib.auth.models import AnonymousUser
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from accounts.models import UserSession

logger = logging.getLogger(__name__)


class SessionTokenAuthentication(BaseAuthentication):
    """
    DRF authentication class — the single source of truth for authentication.

    ─── WHY HERE AND NOT IN MIDDLEWARE ──────────────────────────────────────────

    DRF's authentication class is the architecturally correct place for this
    logic because:

    1. DRF knows about it — it integrates cleanly with IsAuthenticated,
       permission_classes, request.user, and request.auth.
    2. It is discoverable — any developer opening the project knows to look
       at DEFAULT_AUTHENTICATION_CLASSES for authentication logic.
    3. It scales — adding WebSocket auth, admin API auth, or microservice auth
       means adding another class to the list, not hunting through middleware.
    4. It is testable in isolation — you can test authenticate() directly
       without spinning up the full middleware chain.

    ─── WHAT THIS CLASS DOES ────────────────────────────────────────────────────

    1. Reads Authorization: Bearer <token> header
    2. SHA-256 hashes the raw token (raw token never hits the database)
    3. Looks up UserSession by hash with .is_active() — one DB query
       (.is_active() = not revoked AND not expired — SQL-level filter)
    4. Validates user is still active and not soft-deleted
    5. Sets request._request.current_session = session
       (so existing views using request.current_session work unchanged)
    6. Touches the session via Redis throttle (at most 1 DB write per 5 min)
    7. Returns (user, session) tuple — DRF sets request.user and request.auth

    ─── WHAT MIDDLEWARE DOES ────────────────────────────────────────────────────

    The companion SessionAuthMiddleware (middleware.py) does ONLY:
    - Request/response logging
    - Analytics (path, timing, user_id for monitoring tools)
    - NO authentication logic whatsoever

    ─── SETTINGS REQUIRED ───────────────────────────────────────────────────────

    config/settings/base.py:

        REST_FRAMEWORK = {
            'DEFAULT_AUTHENTICATION_CLASSES': [
                'accounts.authentication.SessionTokenAuthentication',
            ],
            'DEFAULT_PERMISSION_CLASSES': [
                'rest_framework.permissions.IsAuthenticated',
            ],
        }

        AUTH_USER_MODEL = 'accounts.User'
    """

    TOKEN_PREFIX              = 'Bearer '
    ACTIVITY_THROTTLE_SECONDS = 300   # 5 minutes — max 1 DB write per session

    def authenticate(self, request):
        """
        Called by DRF on every request before permission checks run.

        Returns (user, session) if authenticated.
        Returns None if no Authorization header — DRF marks as unauthenticated
        and IsAuthenticated returns 401.
        Raises AuthenticationFailed if header exists but token is invalid —
        this returns 401 with a specific message instead of a generic 403.
        """

        # ── Step 1: read Authorization header ──────────────────────────────
        auth_header = request.META.get('HTTP_AUTHORIZATION', '').strip()

        if not auth_header:
            # No token present — return None (not an error, just unauthenticated)
            # AllowAny views work fine. IsAuthenticated views return 401.
            return None

        if not auth_header.startswith(self.TOKEN_PREFIX):
            # Header exists but malformed — this IS an error
            logger.warning(
                'Malformed Authorization header',
                extra={
                    'path':   request.path,
                    'prefix': auth_header[:15],
                }
            )
            raise AuthenticationFailed(
                'Authorization header must start with "Bearer ".'
            )

        raw_token = auth_header[len(self.TOKEN_PREFIX):].strip()
        if not raw_token:
            raise AuthenticationFailed(
                'Authorization header contains no token.'
            )

        # ── Step 2: hash the raw token ─────────────────────────────────────
        # Raw token NEVER touches the database.
        # Only the SHA-256 hash is stored in UserSession.session_token_hash.
        # Even if the database is leaked, raw tokens cannot be recovered.
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()

        # ── Step 3: single DB query ────────────────────────────────────────
        # .is_active() adds: is_revoked=False AND expires_at__gt=now()
        # .select_related('user') loads user in the same query — no N+1
        # Revoked and expired sessions never load user data at all.
        try:
            session = (
                UserSession.objects
                .select_related('user')
                .by_token_hash(token_hash)
                .is_active()
                .first()
            )
        except Exception:
            logger.error(
                'Database error during session lookup',
                extra={'path': request.path},
                exc_info=True,
            )
            raise AuthenticationFailed(
                'Authentication service temporarily unavailable.'
            )

        if not session:
            # Token not found, revoked, or expired.
            # Not logged at WARNING — Flutter holds tokens across restarts
            # and discovers expiry on use. This is normal expected behavior.
            raise AuthenticationFailed(
                'Session token is invalid or has expired. Please login again.'
            )

        # ── Step 4: validate user state ────────────────────────────────────
        user = session.user

        if not user.active or user.deleted_at is not None:
            logger.info(
                'Inactive or deleted user attempted API access',
                extra={'user_id': str(user.id), 'path': request.path}
            )
            raise AuthenticationFailed(
                'This account has been deactivated.'
            )

        # ── Step 5: set request.current_session ────────────────────────────
        # Your views read request.current_session directly.
        # DRF wraps the Django request — we must set it on the underlying
        # Django request (_request) so that getattr(request, 'current_session')
        # works from both DRF views and the middleware.
        #
        # request.auth (set automatically by DRF from our return tuple)
        # is the DRF-standard way to access the auth object. Both
        # request.auth and request.current_session work after this.
        request._request.current_session = session

        # ── Step 6: touch session (Redis-throttled) ────────────────────────
        # Lives here (not in middleware) because we already have the session
        # loaded from the DB — no extra query needed.
        # Middleware runs BEFORE this class, so it cannot do this touch
        # (session not loaded yet when middleware runs).
        self._touch_session_if_needed(session)

        logger.debug(
            'Request authenticated',
            extra={
                'user_id':    str(user.id),
                'session_id': str(session.id),
                'path':       request.path,
            }
        )

        # ── Step 7: return DRF tuple ───────────────────────────────────────
        # DRF automatically sets:
        #   request.user = user       (first element)
        #   request.auth = session    (second element)
        # request.current_session is also set above on _request directly.
        return (user, session)

    def authenticate_header(self, request) -> str:
        """
        WWW-Authenticate header value sent with 401 responses.
        Tells Flutter (and Postman/Swagger) which auth scheme to use.
        """
        return 'Bearer realm="auction-api"'

    def _touch_session_if_needed(self, session: UserSession) -> None:
        """
        Updates last_activity_at at most once per 5 minutes.

        Without throttling: every API request = 1 DB write for activity.
        With Redis throttle: ~1 DB write per session per 5 minutes.
        At 100,000 users × 10 requests/min = 1M req/min WITHOUT throttle.
        With throttle: at most 100,000 / 5 = 20,000 writes per minute.

        Redis key: session_touch:{session_id}
        TTL: 300 seconds — auto-deletes, no cleanup task needed.
        """
        try:
            from django.core.cache import cache
            cache_key = f'session_touch:{session.id}'

            if cache.get(cache_key):
                return   # touched recently — skip the DB write

            session.touch()
            cache.set(cache_key, '1', timeout=self.ACTIVITY_THROTTLE_SECONDS)

        except Exception:
            # Redis unavailable — fall back to datetime comparison
            # Activity tracking is a nice-to-have, not a security requirement.
            # The app keeps working, just writes to DB slightly more often.
            try:
                from django.utils import timezone
                now = timezone.now()
                if (
                    session.last_activity_at is None or
                    (now - session.last_activity_at).total_seconds() > self.ACTIVITY_THROTTLE_SECONDS
                ):
                    session.touch()
            except Exception:
                logger.error(
                    'Failed to update session last_activity_at',
                    extra={'session_id': str(session.id)},
                    exc_info=True,
                )