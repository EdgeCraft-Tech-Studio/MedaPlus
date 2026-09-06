import hashlib
import logging
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser

logger = logging.getLogger(__name__)


@database_sync_to_async
def get_user_from_token(raw_token: str):
    """Mirrors accounts.authentication.SessionTokenAuthentication's
    lookup exactly, so a WebSocket connection is authenticated by the
    SAME rules as every REST request. The ENTIRE function is wrapped
    in one try/except — any unexpected error here must resolve to
    AnonymousUser (closing the socket cleanly) rather than crash the
    ASGI middleware chain with an unhandled 500 during the handshake.
    """
    if not raw_token:
        return AnonymousUser()

    try:
        from accounts.models import UserSession

        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()

        session = (
            UserSession.objects
            .select_related("user")
            .by_token_hash(token_hash)
            .is_active()
            .first()
        )

        if not session:
            return AnonymousUser()

        user = session.user

        if not getattr(user, "active", True):
            return AnonymousUser()
        if getattr(user, "deleted_at", None) is not None:
            return AnonymousUser()

        return user

    except Exception:
        logger.exception("WebSocket token authentication failed unexpectedly")
        return AnonymousUser()


class TokenAuthMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        print(">>> WEBSOCKET MIDDLEWARE HIT <<<", scope.get("path"))  # TEMP DEBUG

        query_string = scope.get("query_string", b"").decode()
        params = parse_qs(query_string)
        raw_token = params.get("token", [None])[0]
        print(">>> RAW TOKEN:", raw_token)  # TEMP DEBUG

        scope["user"] = await get_user_from_token(raw_token)
        print(">>> RESOLVED USER:", scope["user"])  # TEMP DEBUG

        return await self.app(scope, receive, send)