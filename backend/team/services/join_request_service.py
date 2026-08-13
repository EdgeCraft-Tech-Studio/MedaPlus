from django.db import transaction

from ..models import MembershipRole, MembershipSource, Team, TeamJoinRequest
from .exceptions import (
    AlreadyMemberError,
    DuplicatePendingRequestError,
    InsufficientPermissionError,
    TeamPrivateError,
)
from .membership_service import activate_membership, get_active_membership_or_raise


def create_join_request(*, team: Team, user, message: str = "") -> TeamJoinRequest:
    """A user requests to join a PUBLIC team. Rejected outright for
    PRIVATE teams — the actual backend enforcement point for §18,
    not just a frontend button hide.
    """
    if team.is_private:
        raise TeamPrivateError("This team is private and does not accept join requests.")

    if team.memberships.active().for_user(user).exists():
        raise AlreadyMemberError("User is already an active member of this team.")

    if TeamJoinRequest.objects.pending_for_team_and_user(team, user).exists():
        raise DuplicatePendingRequestError("User already has a pending join request for this team.")

    return TeamJoinRequest.objects.create(team=team, user=user, message=message)


def _require_management_permission(team, acting_user):
    membership = get_active_membership_or_raise(
        team, acting_user, InsufficientPermissionError, "Actor is not an active member."
    )
    if not membership.has_management_permissions:
        raise InsufficientPermissionError("Only OWNER or ADMIN can review join requests.")
    return membership


@transaction.atomic
def approve_join_request(*, join_request: TeamJoinRequest, reviewed_by) -> TeamJoinRequest:
    """Approves a pending request and activates membership. Roster
    capacity is enforced inside activate_membership() under a row
    lock, so simultaneous approvals near the roster cap are safe.
    """
    _require_management_permission(join_request.team, reviewed_by)

    if not join_request.is_pending:
        raise DuplicatePendingRequestError("Join request is not pending.")

    activate_membership(
        team_id=join_request.team_id,
        user=join_request.user,
        role=MembershipRole.MEMBER,
        source=MembershipSource.JOIN_REQUEST,
    )
    join_request.approve(reviewed_by=reviewed_by)
    return join_request


def reject_join_request(*, join_request: TeamJoinRequest, reviewed_by) -> TeamJoinRequest:
    _require_management_permission(join_request.team, reviewed_by)
    if not join_request.is_pending:
        raise DuplicatePendingRequestError("Join request is not pending.")
    join_request.reject(reviewed_by=reviewed_by)
    return join_request


def cancel_join_request(*, join_request: TeamJoinRequest, cancelled_by) -> TeamJoinRequest:
    if join_request.user_id != cancelled_by.id:
        raise InsufficientPermissionError("Only the requester can cancel their own request.")
    if not join_request.is_pending:
        raise DuplicatePendingRequestError("Join request is not pending.")
    join_request.cancel()
    return join_request
