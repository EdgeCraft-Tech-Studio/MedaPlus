from django.db import transaction

from ..models import MembershipRole, MembershipSource, MembershipStatus, Team, TeamMembership, TeamStatus
from .exceptions import (
    AlreadyMemberError,
    InsufficientPermissionError,
    NotTeamOwnerError,
    OwnerMustTransferBeforeLeavingError,
    RosterFullError,
)


@transaction.atomic
def activate_membership(
    *,
    team_id,
    user,
    role: str = MembershipRole.MEMBER,
    source: str = MembershipSource.TEAM_CREATION,
) -> TeamMembership:
    """Creates (or reactivates) an ACTIVE membership for `user` on
    the team, safely enforcing max_roster_size under concurrent
    requests via select_for_update() on the Team row. Every
    membership-activation path (accept invitation, approve join
    request) must call through this — never create an ACTIVE
    TeamMembership any other way.
    """
    team = Team.objects.select_for_update().get(id=team_id, status=TeamStatus.ACTIVE)

    existing = TeamMembership.objects.filter(team=team, user=user).first()
    if existing and existing.is_active:
        raise AlreadyMemberError(f"User is already an active member of '{team.name}'.")

    active_count = team.memberships.filter(status=MembershipStatus.ACTIVE).count()
    if active_count >= team.max_roster_size:
        raise RosterFullError(f"Team '{team.name}' roster is full.")

    if existing:
        existing.status = MembershipStatus.ACTIVE
        existing.role = role
        existing.source = source
        existing.save(
            update_fields=["status", "role", "source", "status_changed_at", "updated_at"]
        )
        return existing

    return TeamMembership.objects.create(
        team=team, user=user, role=role, status=MembershipStatus.ACTIVE, source=source
    )


def get_active_membership_or_raise(team, user, error_cls, message) -> TeamMembership:
    membership = TeamMembership.objects.active_for_team(team).for_user(user).first()
    if membership is None:
        raise error_cls(message)
    return membership


def leave_team(*, team, user) -> TeamMembership:
    """A member voluntarily leaves. The OWNER cannot leave without
    transferring ownership first.
    """
    membership = get_active_membership_or_raise(
        team, user, InsufficientPermissionError, "User is not an active member."
    )
    if membership.is_owner:
        raise OwnerMustTransferBeforeLeavingError(
            "Owner must transfer ownership before leaving the team."
        )
    membership.mark_left()
    return membership


def remove_member(*, team, target_user, removed_by) -> TeamMembership:
    """An OWNER/ADMIN removes another member. Cannot remove the owner
    (must transfer ownership, then remove them as a regular member).
    """
    acting_membership = get_active_membership_or_raise(
        team, removed_by, InsufficientPermissionError, "Actor is not an active member."
    )
    if not acting_membership.has_management_permissions:
        raise InsufficientPermissionError("Only OWNER or ADMIN can remove members.")

    target_membership = get_active_membership_or_raise(
        team, target_user, InsufficientPermissionError, "Target is not an active member."
    )
    if target_membership.is_owner:
        raise InsufficientPermissionError("Cannot remove the owner; transfer ownership first.")

    target_membership.mark_removed()
    return target_membership


def promote_to_admin(*, team, target_user, acting_user) -> TeamMembership:
    acting_membership = get_active_membership_or_raise(
        team, acting_user, InsufficientPermissionError, "Actor is not an active member."
    )
    if not acting_membership.is_owner:
        raise NotTeamOwnerError("Only the owner can promote members to admin.")

    target_membership = get_active_membership_or_raise(
        team, target_user, InsufficientPermissionError, "Target is not an active member."
    )
    if target_membership.is_owner:
        # Without this guard, the owner promoting "themself" is a
        # no-op that's merely pointless — but nothing stops them
        # calling this on their OWN membership expecting no-op
        # semantics and getting confused output. More importantly,
        # this same function is reused defensively below for demote,
        # where the equivalent gap is a real bug, not just a
        # pointless call — keeping the guard symmetric in both
        # functions avoids relying on which one happens to be safe.
        raise InsufficientPermissionError(
            "The owner cannot be promoted/demoted this way. Transfer ownership instead."
        )
    target_membership.set_role(MembershipRole.ADMIN)
    return target_membership


def demote_to_member(*, team, target_user, acting_user) -> TeamMembership:
    acting_membership = get_active_membership_or_raise(
        team, acting_user, InsufficientPermissionError, "Actor is not an active member."
    )
    if not acting_membership.is_owner:
        raise NotTeamOwnerError("Only the owner can demote admins.")

    target_membership = get_active_membership_or_raise(
        team, target_user, InsufficientPermissionError, "Target is not an active member."
    )
    if target_membership.is_owner:
        # This is the real bug this guard prevents: without it, an
        # owner calling demote_to_member(target_user=owner,
        # acting_user=owner) succeeds — acting_membership.is_owner
        # passes (they ARE the owner), and nothing ever checked
        # whether the TARGET was the owner. The result is a team
        # with zero active owners: role flips to MEMBER, status
        # stays ACTIVE, so the DB's owner_membership_must_be_active
        # constraint (which only forbids role=OWNER + status!=ACTIVE)
        # never fires. Ownership can only change via
        # transfer_ownership(), which atomically assigns a
        # replacement — never leaving the team ownerless even for
        # one row.
        raise InsufficientPermissionError(
            "The owner cannot be demoted this way. Transfer ownership instead."
        )
    target_membership.set_role(MembershipRole.MEMBER)
    return target_membership


@transaction.atomic
def transfer_ownership(*, team, current_owner, new_owner_user) -> TeamMembership:
    """Atomically swaps OWNER role between two ACTIVE memberships,
    under a row lock — without it, the "one active owner per team"
    DB constraint could momentarily be violated by interleaved writes.
    """
    team_locked = Team.objects.select_for_update().get(id=team.id)

    current_owner_membership = get_active_membership_or_raise(
        team_locked, current_owner, NotTeamOwnerError, "Actor is not an active member."
    )
    if not current_owner_membership.is_owner:
        raise NotTeamOwnerError("Only the current owner can transfer ownership.")

    if current_owner_membership.user_id == new_owner_user.id:
        raise InsufficientPermissionError("This user is already the team owner.")

    new_owner_membership = get_active_membership_or_raise(
        team_locked,
        new_owner_user,
        InsufficientPermissionError,
        "New owner must already be an active team member.",
    )

    current_owner_membership.set_role(MembershipRole.MEMBER)
    new_owner_membership.set_role(MembershipRole.OWNER)

    return new_owner_membership
