from datetime import timedelta
from typing import Optional

from django.db import transaction
from django.db.models import F
from django.utils import timezone
from django.utils.text import slugify

from ..models import (
    InvitationStatus,
    InvitationType,
    MembershipRole,
    MembershipSource,
    Team,
    TeamInvitation,
    TeamInvitationRedemption,
    generate_invite_token,
    generate_join_code,
)
from .exceptions import InsufficientPermissionError, InvitationNotRedeemableError
from .membership_service import activate_membership, get_active_membership_or_raise

DEFAULT_INVITATION_TTL = timedelta(days=7)

_SOURCE_BY_TYPE = {
    InvitationType.DIRECT: MembershipSource.DIRECT_INVITATION,
    InvitationType.LINK: MembershipSource.LINK_INVITATION,
    InvitationType.CODE: MembershipSource.CODE_INVITATION,
}


def _require_management_permission(team, acting_user):
    membership = get_active_membership_or_raise(
        team, acting_user, InsufficientPermissionError, "Actor is not an active member."
    )
    if not membership.has_management_permissions:
        raise InsufficientPermissionError("Only OWNER or ADMIN can send invitations.")
    return membership


def create_direct_invitation(
    *, team: Team, invited_user, invited_by, expires_in: Optional[timedelta] = None
) -> TeamInvitation:
    """Owner/admin searches an existing user and invites them (Method 1)."""
    _require_management_permission(team, invited_by)

    if team.memberships.active().for_user(invited_user).exists():
        from .exceptions import AlreadyMemberError

        raise AlreadyMemberError("User is already an active member of this team.")

    if TeamInvitation.objects.pending_for_team_and_user(team, invited_user).exists():
        from .exceptions import DuplicatePendingRequestError

        raise DuplicatePendingRequestError("User already has a pending invitation for this team.")

    return TeamInvitation.objects.create(
        team=team,
        invitation_type=InvitationType.DIRECT,
        invited_user=invited_user,
        invited_by=invited_by,
        status=InvitationStatus.PENDING,
        expires_at=timezone.now() + (expires_in or DEFAULT_INVITATION_TTL),
    )


def create_link_invitation(
    *,
    team: Team,
    invited_by,
    max_uses: Optional[int] = None,
    expires_in: Optional[timedelta] = None,
) -> TeamInvitation:
    """Owner/admin generates a shareable, reusable link. Its `token`
    is also what gets embedded in the QR code — QR is a rendering
    choice of the same invitation, not a separate type.
    """
    _require_management_permission(team, invited_by)

    return TeamInvitation.objects.create(
        team=team,
        invitation_type=InvitationType.LINK,
        invited_by=invited_by,
        token=generate_invite_token(),
        max_uses=max_uses,
        status=InvitationStatus.PENDING,
        expires_at=timezone.now() + (expires_in or DEFAULT_INVITATION_TTL),
    )


def create_code_invitation(
    *,
    team: Team,
    invited_by,
    max_uses: Optional[int] = None,
    expires_in: Optional[timedelta] = None,
) -> TeamInvitation:
    """Owner/admin generates a short, reusable, human-typeable code."""
    _require_management_permission(team, invited_by)

    prefix = slugify(team.name)[:10].upper().replace("-", "")
    code = f"{prefix}-{generate_join_code()}"

    return TeamInvitation.objects.create(
        team=team,
        invitation_type=InvitationType.CODE,
        invited_by=invited_by,
        code=code,
        max_uses=max_uses,
        status=InvitationStatus.PENDING,
        expires_at=timezone.now() + (expires_in or DEFAULT_INVITATION_TTL),
    )


@transaction.atomic
def accept_invitation(*, invitation: TeamInvitation, accepting_user) -> TeamInvitation:
    """Accepts a DIRECT/LINK/CODE invitation and activates membership.

    DIRECT invitations are single-use: accepting sets status=ACCEPTED
    and the invitation is done.

    LINK/CODE invitations are reusable: accepting does NOT change
    `status` (it stays PENDING/open). Instead it records a
    TeamInvitationRedemption row and increments `redemption_count`.
    The invitation naturally stops being redeemable once
    `redemption_count` reaches `max_uses` (via `is_exhausted`) or it
    expires/is cancelled — no status flip needed for that.

    Locks the invitation row for the duration of this transaction so
    two people redeeming the same reusable link at the exact moment
    it hits max_uses can't both squeeze through.
    """
    locked_invitation = TeamInvitation.objects.select_for_update().get(pk=invitation.pk)

    if not locked_invitation.is_redeemable:
        raise InvitationNotRedeemableError(
            f"Invitation is {locked_invitation.status} and cannot be accepted."
        )

    if locked_invitation.is_direct and (
        locked_invitation.invited_user_id
        and locked_invitation.invited_user_id != accepting_user.id
    ):
        raise InvitationNotRedeemableError("This invitation was issued to a different user.")

    if locked_invitation.is_reusable and TeamInvitationRedemption.objects.filter(
        invitation=locked_invitation, redeemed_by=accepting_user
    ).exists():
        raise InvitationNotRedeemableError("You have already used this invitation.")

    source = _SOURCE_BY_TYPE[locked_invitation.invitation_type]
    activate_membership(
        team_id=locked_invitation.team_id,
        user=accepting_user,
        role=MembershipRole.MEMBER,
        source=source,
    )

    if locked_invitation.is_reusable:
        TeamInvitationRedemption.objects.create(
            invitation=locked_invitation, redeemed_by=accepting_user
        )
        locked_invitation.redemption_count = F("redemption_count") + 1
        locked_invitation.save(update_fields=["redemption_count"])
    else:
        locked_invitation.mark_accepted()

    locked_invitation.refresh_from_db()
    return locked_invitation


def decline_invitation(*, invitation: TeamInvitation, declining_user) -> TeamInvitation:
    """DIRECT invitations only, matching spec §11 (accept/decline).
    Declining a reusable LINK/CODE invitation isn't a meaningful
    concept — the recipient just doesn't redeem it.
    """
    if not invitation.is_direct:
        raise InvitationNotRedeemableError("Only direct invitations can be declined.")
    if not invitation.is_pending:
        raise InvitationNotRedeemableError("Invitation is not pending.")
    invitation.mark_declined()
    return invitation


def cancel_invitation(*, invitation: TeamInvitation, cancelled_by) -> TeamInvitation:
    _require_management_permission(invitation.team, cancelled_by)
    if not invitation.is_pending:
        raise InvitationNotRedeemableError("Invitation is not pending.")
    invitation.mark_cancelled()
    return invitation


def get_invitation_by_token(token: str) -> TeamInvitation:
    return TeamInvitation.objects.by_token(token).get()


def get_invitation_by_code(code: str) -> TeamInvitation:
    return TeamInvitation.objects.by_code(code.upper()).get()
