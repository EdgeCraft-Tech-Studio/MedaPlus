from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models import TeamJoinRequest
from team.pagination import DefaultPagination
from .permissions import IsJoinRequestOwner, IsTeamManager
from ..serializers import TeamJoinRequestCreateSerializer, TeamJoinRequestSerializer
from ..services import approve_join_request, cancel_join_request, create_join_request, reject_join_request
from ..throttling import JoinRequestCreateThrottle
from .mixins import TeamLookupMixin


class TeamJoinRequestViewSet(TeamLookupMixin, viewsets.GenericViewSet):
    """
    Mounted at /teams/{team_slug}/join-requests/ — the manager review
    queue side (§17, §20).

    list      GET   /              — pending requests awaiting review (owner/admin)
    create    POST  /               — request to join THIS team (any authenticated user)
    approve   POST  /{id}/approve/    — owner/admin
    reject    POST  /{id}/reject/      — owner/admin

    `create` intentionally has different permission rules than
    list/approve/reject — literally anyone can request to join a
    public team, but only managers can see/act on the queue. That
    split is handled per-action below rather than via a single
    class-wide `permission_classes`.
    """

    serializer_class = TeamJoinRequestSerializer
    pagination_class = DefaultPagination
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        team = self.get_team()
        return (
            TeamJoinRequest.objects.for_team(team)
            .select_related("user", "reviewed_by")
            .order_by("-created_at")
        )

    def _require_manager(self):
        team = self.get_team()
        permission = IsTeamManager()
        if not permission.has_object_permission(self.request, self, team):
            raise PermissionDenied(permission.message)

    def list(self, request, *args, **kwargs):
        self._require_manager()
        queryset = self.filter_queryset(self.get_queryset().pending())
        page = self.paginate_queryset(queryset)
        serializer = self.get_serializer(page, many=True)
        return self.get_paginated_response(serializer.data)

    def get_throttles(self):
        if self.action == "create":
            return [JoinRequestCreateThrottle()]
        return super().get_throttles()

    def create(self, request, *args, **kwargs):
        team = self.get_team()
        serializer = TeamJoinRequestCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        join_request = create_join_request(
            team=team, user=request.user, message=serializer.validated_data["message"]
        )
        return Response(
            TeamJoinRequestSerializer(join_request).data, status=status.HTTP_201_CREATED
        )

    @action(detail=True, methods=["post"])
    def approve(self, request, *args, **kwargs):
        self._require_manager()
        join_request = get_object_or_404(self.get_queryset(), pk=kwargs["pk"])
        approve_join_request(join_request=join_request, reviewed_by=request.user)
        return Response(TeamJoinRequestSerializer(join_request).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, *args, **kwargs):
        self._require_manager()
        join_request = get_object_or_404(self.get_queryset(), pk=kwargs["pk"])
        reject_join_request(join_request=join_request, reviewed_by=request.user)
        return Response(TeamJoinRequestSerializer(join_request).data)


class MyJoinRequestsView(viewsets.ReadOnlyModelViewSet):
    """GET /join-requests/my/ — the requester's own view of every
    join request they've made, across all teams, so they can see
    "still pending" / "approved" / "rejected" without needing to
    revisit each team individually.
    """

    serializer_class = TeamJoinRequestSerializer
    pagination_class = DefaultPagination
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            TeamJoinRequest.objects.for_user(self.request.user)
            .select_related("team", "reviewed_by")
            .order_by("-created_at")
        )

    @action(detail=True, methods=["post"])
    def cancel(self, request, *args, **kwargs):
        join_request = self.get_object()
        permission = IsJoinRequestOwner()
        if not permission.has_object_permission(request, self, join_request):
            raise PermissionDenied(permission.message)
        cancel_join_request(join_request=join_request, cancelled_by=request.user)
        return Response(TeamJoinRequestSerializer(join_request).data)
