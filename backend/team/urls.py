from django.urls import path

from team.views.invitation import InvitationByCodeView, JoinRequestViaCodeView

from .views import (
    InvitationAcceptByIdView,
    InvitationAcceptByTokenView,
    InvitationByTokenView,
    InvitationDeclineByIdView,
    InvitationDeclineByTokenView,
    MyInvitationsView,
    MyJoinRequestsView,
    TeamInvitationManagementViewSet,
    TeamJoinRequestViewSet,
    TeamMembershipViewSet,
    TeamViewSet,
)

app_name = "team"

# Manual path() wiring rather than a router + drf-nested-routers:
# every nested resource (members/invitations/join-requests) needs
# `team_slug` in its URL, which plain DRF routers don't support out
# of the box without an extra package. This keeps the app dependency
# -free and the URL structure fully explicit and auditable.

team_urlpatterns = [
    path("teams/", TeamViewSet.as_view({"get": "list", "post": "create"}), name="team-list"),
    path("teams/my/", TeamViewSet.as_view({"get": "my"}), name="team-my"),
    path(
        "teams/<slug:slug>/",
        TeamViewSet.as_view({"get": "retrieve", "patch": "partial_update"}),
        name="team-detail",
    ),
    path(
        "teams/<slug:slug>/dashboard/",             
        TeamViewSet.as_view({"get": "dashboard"}),    
        name="team-dashboard",                         
    ),
    path(
        "teams/<slug:slug>/leave/",
        TeamViewSet.as_view({"post": "leave"}),
        name="team-leave",
    ),
    path(
        "teams/<slug:slug>/transfer-ownership/",
        TeamViewSet.as_view({"post": "transfer_ownership_action"}),
        name="team-transfer-ownership",
    ),
    path(
    "teams/<slug:team_slug>/invitations/search-users/",
    TeamViewSet.as_view({"get": "search_users"}),
    name="invitation-search-users",
),
]

membership_urlpatterns = [
    path(
        "teams/<slug:team_slug>/members/",
        TeamMembershipViewSet.as_view({"get": "list"}),
        name="membership-list",
    ),
    path(
        "teams/<slug:team_slug>/members/<uuid:pk>/",
        TeamMembershipViewSet.as_view({"get": "retrieve", "patch": "partial_update"}),
        name="membership-detail",
    ),
    path(
        "teams/<slug:team_slug>/members/<uuid:pk>/promote/",
        TeamMembershipViewSet.as_view({"post": "promote"}),
        name="membership-promote",
    ),
    path(
        "teams/<slug:team_slug>/members/<uuid:pk>/demote/",
        TeamMembershipViewSet.as_view({"post": "demote"}),
        name="membership-demote",
    ),
    path(
        "teams/<slug:team_slug>/members/<uuid:pk>/remove/",
        TeamMembershipViewSet.as_view({"post": "remove"}),
        name="membership-remove",
    ),
]

invitation_urlpatterns = [
    path(
        "teams/<slug:team_slug>/invitations/",
        TeamInvitationManagementViewSet.as_view({"get": "list"}),
        name="invitation-list",
    ),
    path(
        "teams/<slug:team_slug>/invitations/direct/",
        TeamInvitationManagementViewSet.as_view({"post": "create_direct"}),
        name="invitation-create-direct",
    ),
    path(
        "teams/<slug:team_slug>/invitations/link/",
        TeamInvitationManagementViewSet.as_view({"post": "create_link"}),
        name="invitation-create-link",
    ),

    
    path(
    "invitations/code/request/",
        JoinRequestViaCodeView.as_view(),
        name="invitation-request-by-code",
),
    path(
        "teams/<slug:team_slug>/invitations/code/",
        TeamInvitationManagementViewSet.as_view({"post": "create_code"}),
        name="invitation-create-code",
    ),
    path(
        "teams/<slug:team_slug>/invitations/<uuid:pk>/cancel/",
        TeamInvitationManagementViewSet.as_view({"post": "cancel"}),
        name="invitation-cancel",
    ),
    path(
        "invitations/my/",
        MyInvitationsView.as_view({"get": "list"}),
        name="invitation-my",
    ),
    path(
        "invitations/token/<str:token>/",
        InvitationByTokenView.as_view(),
        name="invitation-by-token",
    ),
    path(
        "invitations/token/<str:token>/accept/",
        InvitationAcceptByTokenView.as_view(),
        name="invitation-accept-by-token",
    ),
    path(
        "invitations/token/<str:token>/decline/",
        InvitationDeclineByTokenView.as_view(),
        name="invitation-decline-by-token",
    ),
    path(
        "invitations/<uuid:pk>/accept/",
        InvitationAcceptByIdView.as_view(),
        name="invitation-accept-by-id",
    ),
    path(
        "invitations/<uuid:pk>/decline/",
        InvitationDeclineByIdView.as_view(),
        name="invitation-decline-by-id",
    ),
    path(
        "invitations/code/<str:code>/",
        InvitationByCodeView.as_view(),
        name="invitation-by-code",
    ),
    path( 
    "teams/<slug:team_slug>/invitations/<uuid:pk>/update/",
    TeamInvitationManagementViewSet.as_view({"patch": "update_invitation"}),
    name="invitation-update",
),
] 

join_request_urlpatterns = [
    path(
        "teams/<slug:team_slug>/join-requests/",
        TeamJoinRequestViewSet.as_view({"get": "list", "post": "create"}),
        name="join-request-list-create",
    ),
    path(
        "teams/<slug:team_slug>/join-requests/<uuid:pk>/approve/",
        TeamJoinRequestViewSet.as_view({"post": "approve"}),
        name="join-request-approve",
    ),
    path(
        "teams/<slug:team_slug>/join-requests/<uuid:pk>/reject/",
        TeamJoinRequestViewSet.as_view({"post": "reject"}),
        name="join-request-reject",
    ),
    path(
        "join-requests/my/",
        MyJoinRequestsView.as_view({"get": "list"}),
        name="join-request-my",
    ),
    path(
        "join-requests/my/<uuid:pk>/cancel/",
        MyJoinRequestsView.as_view({"post": "cancel"}),
        name="join-request-cancel",
    ),
]

urlpatterns = (
    team_urlpatterns
    + membership_urlpatterns
    + invitation_urlpatterns
    + join_request_urlpatterns
)
