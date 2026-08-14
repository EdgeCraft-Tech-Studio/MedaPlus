from django.db import IntegrityError
from django.db.models import F
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models import MembershipRole, Team
from ..pagination import DefaultPagination
from ..serializers import (
    OwnershipTransferSerializer,
    TeamCreateSerializer,
    TeamDetailSerializer,
    TeamListSerializer,
    TeamMyListSerializer,
    TeamUpdateSerializer,
)
from ..services import leave_team, transfer_ownership
from ..services.exceptions import TeamServiceError
from .permissions import IsTeamOwner


class TeamViewSet(viewsets.GenericViewSet):
    """
    list        GET    /teams/                       — public discovery
    create      POST   /teams/                        — create a team
    retrieve    GET    /teams/{slug}/                  — team detail (public profile)
    partial_update PATCH /teams/{slug}/                 — edit team info (owner/admin)
    dashboard   GET    /teams/{slug}/dashboard/           — full management view (owner/admin only)
    my          GET    /teams/my/                        — teams I'm an active member of
    leave       POST   /teams/{slug}/leave/                — leave this team
    transfer_ownership POST /teams/{slug}/transfer-ownership/ — hand ownership to another member
    """

    lookup_field = "slug"
    lookup_url_kwarg = "slug"
    pagination_class = DefaultPagination
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        base = Team.objects.select_related("created_by").with_active_member_count()

        if self.action == "list":
            # Public discovery (§18/§19): only operable, PUBLIC teams,
            # AND never a team the requesting user already belongs to —
            # "find a team to join" has no business surfacing teams
            # you're already on. This is enforced here, server-side,
            # not just hidden by the frontend.
            base = base.discoverable()
            base = base.exclude(
                memberships__user=self.request.user,
                memberships__status="active"
            )
            base = self._apply_discovery_filters(base)
        return base

    def _apply_discovery_filters(self, queryset):
        params = self.request.query_params
        sport = params.get("sport")
        city = params.get("city")
        area = params.get("area")
        skill_level = params.get("skill_level")

        if sport:
            queryset = queryset.for_sport(sport)
        if city or area:
            queryset = queryset.in_area(city=city, area=area)
        if skill_level:
            queryset = queryset.filter(skill_level=skill_level)
        return queryset

    def get_serializer_class(self):
        if self.action == "list":
            return TeamListSerializer
        if self.action == "my":
            return TeamMyListSerializer
        if self.action == "create":
            return TeamCreateSerializer
        if self.action == "partial_update":
            return TeamUpdateSerializer
        return TeamDetailSerializer

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        serializer = self.get_serializer(page, many=True)
        return self.get_paginated_response(serializer.data)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            team = serializer.save()
        except IntegrityError:
            raise
        output = TeamDetailSerializer(team, context=self.get_serializer_context()).data
        return Response(output, status=status.HTTP_201_CREATED)

    def retrieve(self, request, *args, **kwargs):
        team = self.get_object()
        if team.is_private:
            is_member = team.memberships.active().for_user(request.user).exists()
            if not is_member:
                return Response(
                    {"detail": "This team is private."},
                    status=status.HTTP_404_NOT_FOUND,
                )
        serializer = self.get_serializer(team)
        return Response(serializer.data)

    def partial_update(self, request, *args, **kwargs):
        team = self.get_object()
        self.check_object_permissions_for_manager(team)
        serializer = self.get_serializer(team, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        team = serializer.save()
        return Response(TeamDetailSerializer(team, context=self.get_serializer_context()).data)

    def check_object_permissions_for_manager(self, team: Team) -> None:
        from .permissions import IsTeamManager

        permission = IsTeamManager()
        if not permission.has_object_permission(self.request, self, team):
            raise PermissionDenied(permission.message)

    @action(detail=True, methods=["get"], url_path="dashboard")
    def dashboard(self, request, *args, **kwargs):
        """Full team-management view. Gated to OWNER or ADMIN only —
        this is the SERVER-SIDE enforcement point. The frontend also
        hides the link/route for non-managers, but that's UX only;
        this check is the real security boundary. Even a hand-typed
        URL from a plain member gets a 403 here.
        """
        team = self.get_object()
        membership = team.memberships.active().for_user(request.user).first()

        if not membership or membership.role not in (
            MembershipRole.OWNER,
            MembershipRole.ADMIN,
        ):
            raise PermissionDenied(
                "Only the team owner or an admin can view this dashboard."
            )

        serializer = TeamDetailSerializer(team, context=self.get_serializer_context())
        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="my")
    def my(self, request, *args, **kwargs):
        queryset = (
            Team.objects.select_related("created_by")
            .with_active_member_count()
            .filter(memberships__user=request.user, memberships__status="active")
            .annotate(my_role=F("memberships__role"))
            .distinct()
        )
        page = self.paginate_queryset(queryset)
        serializer = self.get_serializer(page, many=True)
        return self.get_paginated_response(serializer.data)

    @action(detail=True, methods=["post"], url_path="leave")
    def leave(self, request, *args, **kwargs):
        team = self.get_object()
        leave_team(team=team, user=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(
        detail=True,
        methods=["post"],
        url_path="transfer-ownership",
        permission_classes=[IsAuthenticated, IsTeamOwner],
    )
    def transfer_ownership_action(self, request, *args, **kwargs):
        team = self.get_object()
        self.check_object_permissions(request, team)
        serializer = OwnershipTransferSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_membership = transfer_ownership(
            team=team,
            current_owner=request.user,
            new_owner_user=serializer.validated_data["new_owner_id"],
        )
        from ..serializers import TeamMembershipSerializer

        return Response(TeamMembershipSerializer(new_membership).data) 