from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models import TeamMembership
from team.pagination import DefaultPagination
from .permissions import IsMembershipSelfOrTeamManager, IsTeamManager, IsTeamOwner
from ..serializers import TeamMembershipRosterUpdateSerializer, TeamMembershipSerializer
from ..services import demote_to_member, promote_to_admin, remove_member
from .mixins import TeamLookupMixin


class TeamMembershipViewSet(TeamLookupMixin, viewsets.GenericViewSet):
    """
    Mounted at /teams/{team_slug}/members/

    list             GET    /                — the roster (paginated)
    retrieve         GET    /{id}/            — one member's detail
    partial_update   PATCH  /{id}/             — edit own/managed jersey number etc.
    promote          POST   /{id}/promote/       — owner only
    demote           POST   /{id}/demote/         — owner only
    remove           POST   /{id}/remove/          — owner/admin only

    No `create`: membership rows are never created directly through
    this endpoint — they only come into existence via
    `create_team()` (the owner) or through accepting an invitation /
    an approved join request. No `destroy`: leaving/removal are named
    state transitions (`mark_left`/`mark_removed`), never a DELETE,
    because historical membership rows must never disappear (§9).
    """

    serializer_class = TeamMembershipSerializer
    pagination_class = DefaultPagination
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        team = self.get_team()
        # select_related("user") is the difference between 1 query
        # and 21 queries when rendering a 20-row roster page with
        # each row's username/avatar.
        return (
            TeamMembership.objects.active_for_team(team)
            .select_related("user")
            .order_by("-joined_at")
        )

    def list(self, request, *args, **kwargs):
        team = self.get_team()
        # Roster visibility for a PRIVATE team is members-only —
        # mirrors the same rule enforced on Team.retrieve.
        if team.is_private:
            is_member = TeamMembership.objects.active_for_team(team).for_user(request.user).exists()
            if not is_member:
                return Response(
                    {"detail": "This team is private."}, status=status.HTTP_404_NOT_FOUND
                )
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        serializer = self.get_serializer(page, many=True)
        return self.get_paginated_response(serializer.data)

    def partial_update(self, request, *args, **kwargs):
        membership = self.get_object()
        permission = IsMembershipSelfOrTeamManager()
        if not permission.has_object_permission(request, self, membership):
            raise PermissionDenied(permission.message)
        serializer = TeamMembershipRosterUpdateSerializer(
            membership, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        membership = serializer.save()
        return Response(TeamMembershipSerializer(membership).data)

    def _require_owner(self, membership: TeamMembership) -> None:
        permission = IsTeamOwner()
        if not permission.has_object_permission(self.request, self, membership):
            raise PermissionDenied(permission.message)

    def _require_manager(self, membership: TeamMembership) -> None:
        permission = IsTeamManager()
        if not permission.has_object_permission(self.request, self, membership):
            raise PermissionDenied(permission.message)

    @action(detail=True, methods=["post"])
    def promote(self, request, *args, **kwargs):
        membership = self.get_object()
        self._require_owner(membership)
        updated = promote_to_admin(
            team=membership.team, target_user=membership.user, acting_user=request.user
        )
        return Response(TeamMembershipSerializer(updated).data)

    @action(detail=True, methods=["post"])
    def demote(self, request, *args, **kwargs):
        membership = self.get_object()
        self._require_owner(membership)
        updated = demote_to_member(
            team=membership.team, target_user=membership.user, acting_user=request.user
        )
        return Response(TeamMembershipSerializer(updated).data)

    @action(detail=True, methods=["post"])
    def remove(self, request, *args, **kwargs):
        membership = self.get_object()
        self._require_manager(membership)
        removed = remove_member(
            team=membership.team, target_user=membership.user, removed_by=request.user
        )
        return Response(TeamMembershipSerializer(removed).data)
