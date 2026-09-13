from django.utils import timezone
from django.db import models
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from match.choices import MatchStatus
from team.models import Team

from .models import Match, MatchParticipant
from .serializers import (
    MatchCreateSerializer,
    MatchParticipantSerializer,
    MatchSerializer,
    MatchUpdateSerializer,
)
from .services import cancel_match, create_match, join_open_match, leave_open_match, update_match
from .exceptions import MatchServiceError


class MatchViewSet(viewsets.GenericViewSet):
    """
    list        GET    /matches/            — filterable discovery
    create      POST   /matches/              — post an open-slots match
    retrieve    GET    /matches/{id}/          — detail
    partial_update PATCH /matches/{id}/         — edit (OPEN only)
    cancel      POST   /matches/{id}/cancel/      — soft-cancel
    join        POST   /matches/{id}/join/          — claim an open slot
    leave       POST   /matches/{id}/leave/           — give up a slot
    """

    serializer_class = MatchSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "id"

    def get_queryset(self):
        qs = Match.objects.select_related("creator_team", "pitch")
        params = self.request.query_params
        if status_param := params.get("status"):
            qs = qs.filter(status=status_param)
        if team_id := params.get("team_id"):
            team = get_object_or_404(Team, id=team_id)
            qs = qs.for_team(team)
        if params.get("mine") == "true":
            from team.models import TeamMembership

            my_team_ids = list(
                TeamMembership.objects.active_for_user(self.request.user).values_list(
                    "team_id", flat=True
                )
            )
            qs = qs.filter(creator_team_id__in=my_team_ids)
        return qs

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        serializer = MatchCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        team_id = request.data.get("creator_team_id")
        if not team_id:
            raise ValidationError({"creator_team_id": "Required."})
        creator_team = get_object_or_404(Team, id=team_id)
        pitch = self._get_pitch(data["pitch_id"])

        try:
            match = create_match(
                creator_team=creator_team,
                created_by=request.user,
                pitch=pitch,
                start_time=data["start_time"],
                end_time=data["end_time"],
                description=data.get("description", ""),
                slots_needed=data["slots_needed"],
                price_per_slot=data["price_per_slot"],
            )
        except (MatchServiceError, ValueError) as exc:
            raise ValidationError(str(exc))

        return Response(MatchSerializer(match).data, status=status.HTTP_201_CREATED)

    def retrieve(self, request, *args, **kwargs):
        match = get_object_or_404(self.get_queryset(), id=kwargs["id"])
        return Response(MatchSerializer(match).data)

    def partial_update(self, request, *args, **kwargs):
        match = get_object_or_404(Match, id=kwargs["id"])
        serializer = MatchUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            match = update_match(match=match, updated_by=request.user, **serializer.validated_data)
        except (MatchServiceError, ValueError) as exc:
            raise ValidationError(str(exc))
        return Response(MatchSerializer(match).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, *args, **kwargs):
        match = get_object_or_404(Match, id=kwargs["id"])
        match = cancel_match(match=match, cancelled_by=request.user)
        return Response(MatchSerializer(match).data)

    @action(detail=True, methods=["post"])
    def join(self, request, *args, **kwargs):
        try:
            participant = join_open_match(match_id=kwargs["id"], user=request.user)
        except MatchServiceError as exc:
            raise ValidationError(str(exc))
        return Response(MatchParticipantSerializer(participant).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def leave(self, request, *args, **kwargs):
        match = get_object_or_404(Match, id=kwargs["id"])
        participant = get_object_or_404(
            MatchParticipant.objects.active().for_match(match), user=request.user
        )
        participant = leave_open_match(participant=participant, cancelled_by=request.user)
        return Response(MatchParticipantSerializer(participant).data)

    def _get_pitch(self, pitch_id):
        from pitches.models import Pitch

        return get_object_or_404(Pitch, id=pitch_id)

    @action(detail=False, methods=["get"])
    def home(self, request):
        from team.models import TeamMembership

        my_team_ids = list(
            TeamMembership.objects.active_for_user(request.user).values_list("team_id", flat=True)
        )

        team_matches = Match.objects.filter(creator_team_id__in=my_team_ids)

        my_participant_match_ids = list(
            MatchParticipant.objects.active().for_user(request.user).values_list("match_id", flat=True)
        )
        joined_matches = Match.objects.filter(id__in=my_participant_match_ids)

        combined = (team_matches | joined_matches).distinct()
        combined = combined.exclude(status__in=[MatchStatus.CANCELLED, MatchStatus.COMPLETED])
        combined = combined.filter(end_time__gte=timezone.now())
        combined = combined.select_related("creator_team", "pitch").order_by("start_time")

        return Response(MatchSerializer(combined, many=True).data)