from datetime import timedelta
from typing import Optional

from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from team.serializers.join_request import TeamJoinRequestSerializer
from team.services.join_request_service import create_join_request
from team.serializers.invitation import InvitationPreviewSerializer, JoinRequestViaCodeSerializer

from ..models import TeamInvitation
from team.pagination import DefaultPagination
from .permissions import IsTeamManager
from ..serializers import (
    InvitationRedeemByCodeSerializer,
    TeamCodeInvitationCreateSerializer,
    TeamDirectInvitationCreateSerializer,
    TeamInvitationSerializer,
    TeamInvitationShareSerializer,
    TeamLinkInvitationCreateSerializer,
)
from ..services import (
    accept_invitation, 
    cancel_invitation,
    create_code_invitation,
    create_direct_invitation,
    create_link_invitation,
    decline_invitation,
    get_invitation_by_code,
    get_invitation_by_token,
)
from ..services.exceptions import InsufficientPermissionError
from .throttling import CodeRedemptionThrottle, InvitationCreateThrottle
from .mixins import TeamLookupMixin


def _expires_in(validated_data) -> Optional[timedelta]:
    days = validated_data.get("expires_in_days")
    return timedelta(days=days) if days else None


class TeamInvitationManagementViewSet(TeamLookupMixin, viewsets.GenericViewSet):
    """
    Mounted at /teams/{team_slug}/invitations/ — the OWNER/ADMIN side.

    list          GET   /                — pending invitations for this team
    create_direct POST  /direct/          — Method 1: invite a searched user (§11)
    create_link   POST  /link/             — Method 2/3: shareable link + QR (§12/§13)
    create_code   POST  /code/              — Method 4: short join code (§14)
    cancel        POST  /{id}/cancel/        — revoke a pending invitation

    Every create action is throttled (see throttling.py) — without a
    limit, a single team's admin panel could be used to blast direct
    invitations at every user on the platform, or mint unlimited
    reusable links.
    """

    serializer_class = TeamInvitationShareSerializer
    pagination_class = DefaultPagination
    permission_classes = [IsAuthenticated, IsTeamManager]

    def get_queryset(self):
        team = self.get_team()
        # select_related avoids N+1 on invited_user/invited_by for
        # every row when an admin's "pending invitations" panel
        # renders avatars/names for each one.
        return (
            TeamInvitation.objects.for_team(team)
            .select_related("invited_user", "invited_by")
            .order_by("-created_at")
        )

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        # Object-level permission checked once here (against the
        # resolved Team), rather than per-action — every action on
        # this ViewSet requires the same "manages this team" check.
        team = self.get_team()
        permission = IsTeamManager()
        if not permission.has_object_permission(request, self, team):
            raise PermissionDenied(permission.message)

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        serializer = self.get_serializer(page, many=True)
        return self.get_paginated_response(serializer.data)

    @action(detail=False, methods=["post"], url_path="direct", throttle_classes=[InvitationCreateThrottle])
    def create_direct(self, request, *args, **kwargs):
        team = self.get_team()
        serializer = TeamDirectInvitationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        invitation = create_direct_invitation(
            team=team,
            invited_user=serializer.validated_data["invited_user_id"],
            invited_by=request.user,
            expires_in=_expires_in(serializer.validated_data),
        )
        return Response(
            TeamInvitationShareSerializer(invitation).data, status=status.HTTP_201_CREATED
        )

    @action(detail=False, methods=["post"], url_path="link", throttle_classes=[InvitationCreateThrottle])
    def create_link(self, request, *args, **kwargs):
        team = self.get_team()
        serializer = TeamLinkInvitationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        invitation = create_link_invitation(
            team=team,
            invited_by=request.user,
            expires_in=_expires_in(serializer.validated_data),
        )
        # Returned with the token exposed (TeamInvitationShareSerializer)
        # because the caller — who just created it — is the only
        # person who should see it. See that serializer's docstring.
        return Response(
            TeamInvitationShareSerializer(invitation).data, status=status.HTTP_201_CREATED
        )

    @action(detail=False, methods=["post"], url_path="code", throttle_classes=[InvitationCreateThrottle])
    def create_code(self, request, *args, **kwargs):
        team = self.get_team()
        serializer = TeamCodeInvitationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        invitation = create_code_invitation(
            team=team,
            invited_by=request.user,
            expires_in=_expires_in(serializer.validated_data),
        )
        return Response(
            TeamInvitationShareSerializer(invitation).data, status=status.HTTP_201_CREATED
        )

    @action(detail=True, methods=["post"])
    def cancel(self, request, *args, **kwargs):
        invitation = get_object_or_404(self.get_queryset(), pk=kwargs["pk"])
        cancel_invitation(invitation=invitation, cancelled_by=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MyInvitationsView(viewsets.ReadOnlyModelViewSet):
    """GET /invitations/my/ — DIRECT invitations addressed to the
    current user (§11's "the invited player receives a notification,
    they can accept/decline"). Deliberately excludes LINK/CODE
    invitations, which by design have no specific `invited_user` —
    those are discovered by opening the link or entering the code,
    not listed here.
    """

    serializer_class = TeamInvitationSerializer
    pagination_class = DefaultPagination
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            TeamInvitation.objects.direct()
            .pending()
            .for_invited_user(self.request.user)
            .select_related("team", "invited_by")
            .order_by("-created_at")
        )


class InvitationByTokenView(APIView):
    """
    GET  /invitations/token/{token}/         — preview before accepting (§12)

    Base class shared by the accept/decline views below, which each
    add their own POST. Kept separate rather than one view with an
    `?action=accept|decline` query param, because accept and decline
    have different permission stories worth being explicit about
    (accept is the one that touches roster capacity; decline never
    does), and separate URLs are easier to throttle/log/monitor
    independently.

    Requires authentication throughout. Per spec §12: "If not logged
    in, they authenticate/register" happens BEFORE this endpoint is
    ever hit — the frontend redirects to login/signup first and
    returns to this URL afterward, so this view can assume
    `request.user` is always real.
    """

    permission_classes = [IsAuthenticated]

    def get_invitation(self, token: str) -> TeamInvitation:
        return get_object_or_404(
            TeamInvitation.objects.select_related("team", "invited_by"), token=token
        )

    def get(self, request, token: str):
        invitation = self.get_invitation(token)
        return Response(TeamInvitationSerializer(invitation).data)


class InvitationAcceptByTokenView(InvitationByTokenView):
    def post(self, request, token: str):
        invitation = self.get_invitation(token)
        try:
            accept_invitation(invitation=invitation, accepting_user=request.user)
        except InsufficientPermissionError:
            raise
        return Response(TeamInvitationSerializer(invitation).data)


class InvitationDeclineByTokenView(InvitationByTokenView):
    def post(self, request, token: str):
        invitation = self.get_invitation(token)
        decline_invitation(invitation=invitation, declining_user=request.user)
        return Response(TeamInvitationSerializer(invitation).data)



# views.py — add alongside InvitationByTokenView
class InvitationByCodeView(APIView):
    """GET /invitations/code/{code}/ — preview before redeeming (§14).
    Read-only: does NOT redeem. Mirrors InvitationByTokenView but for
    the code pathway, which previously had no preview step at all.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, code: str):
        invitation = get_object_or_404(
            TeamInvitation.objects.select_related("team", "invited_by"),
            code=code.strip().upper(),
        )
        return Response(InvitationPreviewSerializer(invitation).data)

class InvitationAcceptByIdView(APIView):
    """POST /invitations/{id}/accept/ — for DIRECT invitations, which
    (unlike LINK/CODE) have no token to accept-by-URL: the recipient
    finds them via MyInvitationsView and acts on the id directly.
    Also works for LINK/CODE by id if the client already has the
    object loaded, but the primary path for those is the token/code
    endpoints above.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        invitation = get_object_or_404(
            TeamInvitation.objects.select_related("team"), pk=pk
        )
        accept_invitation(invitation=invitation, accepting_user=request.user)
        return Response(TeamInvitationSerializer(invitation).data)


class InvitationDeclineByIdView(APIView):
    """POST /invitations/{id}/decline/ — id-based counterpart to
    InvitationAcceptByIdView, same rationale.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        invitation = get_object_or_404(TeamInvitation.objects.all(), pk=pk)
        decline_invitation(invitation=invitation, declining_user=request.user)
        return Response(TeamInvitationSerializer(invitation).data)




class JoinRequestViaCodeView(APIView):
    """POST /invitations/code/request/ — look up a team by its join
    code and submit a JOIN REQUEST for owner/admin approval, rather
    than redeeming the code for instant membership. Distinct from
    """

    permission_classes = [IsAuthenticated]
    throttle_classes = [CodeRedemptionThrottle]

    def post(self, request):
        serializer = JoinRequestViaCodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        invitation = get_object_or_404(
            TeamInvitation.objects.select_related("team"),
            code=serializer.validated_data["code"],
        )
        if not invitation.is_redeemable:
            return Response(
                {"detail": "This code is no longer valid."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # NOTE: create_join_request() may need a flag to bypass the
        # normal "team must be PUBLIC" rule, since a valid code is
        # itself sufficient authorization to request a private team.
        # Confirm this against your actual join_request_service.
        join_request = create_join_request(
            team=invitation.team,
            user=request.user,
            message=serializer.validated_data["message"],
        )
        return Response(
            TeamJoinRequestSerializer(join_request).data,
            status=status.HTTP_201_CREATED,
        )