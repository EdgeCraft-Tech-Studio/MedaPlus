from rest_framework.permissions import BasePermission

from team.models.membership import TeamMembership



def _resolve_team(obj):
    """Views pass either a Team instance directly, or an object with
    a `.team` FK (TeamMembership, TeamInvitation, TeamJoinRequest).
    Centralized here so every permission class below doesn't
    reimplement the same isinstance check.
    """
    from team.models import Team

    return obj if isinstance(obj, Team) else obj.team


class IsTeamManager(BasePermission):
    """OWNER or ADMIN of the team. Used for roster management,
    reviewing join requests, creating/cancelling invitations —
    anything §6/§7 of the spec grants to owner+admin jointly.
    """

    message = "You must be an owner or admin of this team to perform this action."

    def has_object_permission(self, request, view, obj) -> bool:
        team = _resolve_team(obj)
        membership = (
            TeamMembership.objects.active_for_team(team)
            .for_user(request.user)
            .first()
        )
        return bool(membership and membership.has_management_permissions)


class IsTeamOwner(BasePermission):
    """OWNER only. Used for actions §6 reserves to the owner alone:
    transferring ownership, archiving the team, promoting/demoting
    admins.
    """

    message = "Only the team owner can perform this action."

    def has_object_permission(self, request, view, obj) -> bool:
        team = _resolve_team(obj)
        membership = (
            TeamMembership.objects.active_for_team(team)
            .for_user(request.user)
            .first()
        )
        return bool(membership and membership.is_owner)


class IsActiveTeamMember(BasePermission):
    """Any ACTIVE member (any role). Used for read access to
    private-team detail/roster — being a member is enough to view,
    even without management rights.
    """

    message = "You must be an active member of this team."

    def has_object_permission(self, request, view, obj) -> bool:
        team = _resolve_team(obj)
        return TeamMembership.objects.active_for_team(team).for_user(request.user).exists()


class IsMembershipSelfOrTeamManager(BasePermission):
    """For editing a specific TeamMembership row's roster metadata
    (jersey number, preferred position): the member themself can
    edit their own info, OR a team manager can edit anyone's.
    """

    message = "You can only edit your own roster info, unless you manage this team."

    def has_object_permission(self, request, view, obj: TeamMembership) -> bool:
        if obj.user_id == request.user.id:
            return True
        manager_membership = (
            TeamMembership.objects.active_for_team(obj.team)
            .for_user(request.user)
            .first()
        )
        return bool(manager_membership and manager_membership.has_management_permissions)


class IsJoinRequestOwner(BasePermission):
    """Only the person who created the join request can cancel it."""

    message = "You can only manage your own join request."

    def has_object_permission(self, request, view, obj) -> bool:
        return obj.user_id == request.user.id
