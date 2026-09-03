from django.urls import path

from .views import MatchViewSet

app_name = "match"

urlpatterns = [
    path("matches/home/", MatchViewSet.as_view({"get": "home"}), name="match-home"),
    path("matches/", MatchViewSet.as_view({"get": "list", "post": "create"}), name="match-list"),
    path(
        "matches/<uuid:id>/",
        MatchViewSet.as_view({"get": "retrieve", "patch": "partial_update"}),
        name="match-detail",
    ),
    path("matches/<uuid:id>/cancel/", MatchViewSet.as_view({"post": "cancel"}), name="match-cancel"),
    path("matches/<uuid:id>/accept/", MatchViewSet.as_view({"post": "accept"}), name="match-accept"),
    path("matches/<uuid:id>/join/", MatchViewSet.as_view({"post": "join"}), name="match-join"),
    path("matches/<uuid:id>/leave/", MatchViewSet.as_view({"post": "leave"}), name="match-leave"),
]