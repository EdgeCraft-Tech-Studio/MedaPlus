import logging
import time

from django.utils.deprecation import MiddlewareMixin

logger = logging.getLogger(__name__)


class SessionAuthMiddleware(MiddlewareMixin):
    """
    Thin middleware for logging and request analytics ONLY.

    ─── WHAT THIS DOES ──────────────────────────────────────────────────────────

    Logs every request with:
    - path, method, status code, response time
    - user_id and session_id if authenticated (set by authentication class)

    ─── WHAT THIS DOES NOT DO ───────────────────────────────────────────────────

    NO token reading.
    NO database queries.
    NO session lookup.
    NO request.user assignment.
    NO request.current_session assignment.

    ALL authentication logic lives in accounts/authentication.py.
    Middleware runs BEFORE the DRF authentication class, so the session
    is not yet loaded here — the authentication class handles it.

    ─── WHY THIS SEPARATION ─────────────────────────────────────────────────────

    Standard DRF architecture:
        Authentication Class → sets request.user and request.auth
        Middleware           → logging, analytics, monitoring

    This means:
    - Adding WebSocket auth, admin API, or microservice auth = new auth class
    - No developer needs to hunt through middleware to understand how auth works
    - Authentication is testable in isolation without the middleware chain

    ─── SETTINGS ────────────────────────────────────────────────────────────────

    config/settings/base.py:

        MIDDLEWARE = [
            ...
            'django.contrib.auth.middleware.AuthenticationMiddleware',
            'accounts.middleware.SessionAuthMiddleware',
            ...
        ]
    """

    def process_request(self, request) -> None:
        """
        Runs before the view. Records request start time for latency logging.
        """
        request._start_time = time.monotonic()

    def process_response(self, request, response):
        """
        Runs after the view. Logs the completed request with timing and auth info.
        """
        duration_ms = round((time.monotonic() - getattr(request, '_start_time', time.monotonic())) * 1000)

        # request.user is set by the authentication class (runs during DRF view).
        # For logging purposes we read it safely — it may still be AnonymousUser
        # here if the view was AllowAny or authentication failed.
        user    = getattr(request, 'user', None)
        session = getattr(request, 'current_session', None)

        user_id    = str(user.id)    if user and not getattr(user, 'is_anonymous', True) else None
        session_id = str(session.id) if session else None

        log_data = {
            'method':      request.method,
            'path':        request.path,
            'status':      response.status_code,
            'duration_ms': duration_ms,
            'user_id':     user_id,
            'session_id':  session_id,
            'ip':          self._get_client_ip(request),
        }

        # Log level based on response status
        if response.status_code >= 500:
            logger.error('Request completed', extra=log_data)
        elif response.status_code >= 400:
            logger.warning('Request completed', extra=log_data)
        else:
            logger.info('Request completed', extra=log_data)

        return response

    @staticmethod
    def _get_client_ip(request) -> str | None:
        """
        Extracts real client IP.
        Checks X-Forwarded-For (set by nginx/load balancer) first.
        Falls back to REMOTE_ADDR for direct connections.
        """
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            return x_forwarded_for.split(',')[0].strip()
        return request.META.get('REMOTE_ADDR')