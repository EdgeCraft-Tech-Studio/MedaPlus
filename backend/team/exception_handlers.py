import logging

from django.db import IntegrityError
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_default_exception_handler

from team.services.exceptions import (
    AlreadyMemberError,
    DuplicatePendingRequestError,
    InsufficientPermissionError,
    InvitationNotRedeemableError,
    NotTeamOwnerError,
    OwnerMustTransferBeforeLeavingError,
    RosterFullError,
    TeamPrivateError,
)

logger = logging.getLogger(__name__)

# Without this mapping, every RosterFullError/TeamPrivateError/etc.
# raised by the service layer falls through DRF's default handler
# (which only knows about DRF's own APIException subclasses) and
# becomes an unhandled 500 — a client can't distinguish "the server
# is broken" from "the roster happens to be full right now," and the
# 500 gets logged as a false-alarm error on every dashboard.
_SERVICE_ERROR_STATUS_MAP = {
    RosterFullError: status.HTTP_409_CONFLICT,
    AlreadyMemberError: status.HTTP_409_CONFLICT,
    DuplicatePendingRequestError: status.HTTP_409_CONFLICT,
    TeamPrivateError: status.HTTP_403_FORBIDDEN,
    NotTeamOwnerError: status.HTTP_403_FORBIDDEN,
    InsufficientPermissionError: status.HTTP_403_FORBIDDEN,
    OwnerMustTransferBeforeLeavingError: status.HTTP_409_CONFLICT,
    InvitationNotRedeemableError: status.HTTP_410_GONE,
}


def teams_exception_handler(exc, context):
    """Register in settings:
        REST_FRAMEWORK = {"EXCEPTION_HANDLER": "teams.exception_handlers.teams_exception_handler"}

    Falls back to DRF's default handler for anything it already
    knows how to handle (ValidationError, NotAuthenticated,
    PermissionDenied, Http404, etc.) — this function only adds
    handling for the teams-domain service exceptions and a couple of
    DB-level races that would otherwise surface as raw 500s.
    """
    response = drf_default_exception_handler(exc, context)
    if response is not None:
        return response

    for exc_type, http_status in _SERVICE_ERROR_STATUS_MAP.items():
        if isinstance(exc, exc_type):
            return Response({"detail": str(exc)}, status=http_status)

    if isinstance(exc, IntegrityError):
        # Scenario this catches: two requests racing to create a team
        # with the same name pass the serializer's pre-check
        # (validate_name) at the same instant, both proceed, and the
        # DB's uniq_team_name_ci_not_deleted constraint is what
        # actually stops the second one — as a raw IntegrityError,
        # not a clean validation error. Without this, that race
        # surfaces to the client as an opaque 500 instead of a 409
        # they can retry/resolve.
        logger.warning("IntegrityError surfaced to API layer: %s", exc)
        return Response(
            {"detail": "This action conflicts with existing data. Please retry."},
            status=status.HTTP_409_CONFLICT,
        )

    # Anything else: let it propagate as an unhandled 500 and get
    # logged normally — deliberately NOT swallowing unknown
    # exceptions here, since masking them as generic 400s would hide
    # real bugs from monitoring.
    return None
