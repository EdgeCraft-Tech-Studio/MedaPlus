from django.utils import timezone
from django.db import models
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from match.choices import MatchStatus, MatchType
from team.models import Team

from .models import Match, MatchParticipant
from .serializers import (
    AcceptChallengeSerializer,
    MatchCreateSerializer,
    MatchParticipantSerializer,
    MatchSerializer,
    MatchUpdateSerializer,
)
from .services import (
    accept_challenge,
    cancel_match,
    create_match,
    join_open_match,
    leave_open_match,
    update_match,
)
from .exceptions import MatchServiceError


class MatchViewSet(viewsets.GenericViewSet):
    """
    list        GET    /matches/                 — filterable discovery
    create      POST   /matches/                   — post a challenge or open-slots match
    retrieve    GET    /matches/{id}/                — detail
    partial_update PATCH /matches/{id}/               — edit (OPEN only)
    cancel      POST   /matches/{id}/cancel/            — soft-cancel (see note below)
    accept      POST   /matches/{id}/accept/              — accept a team-vs-team challenge
    join        POST   /matches/{id}/join/                  — claim an open slot
    leave       POST   /matches/{id}/leave/                   — give up a slot you're holding

    "Delete" is deliberately implemented as `cancel`, not a real
    DELETE — nothing else in this system hard-deletes a row with
    history attached to it (payments, participants), and a match is
    no exception.
    """

    serializer_class = MatchSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "id"

    def get_queryset(self):
        qs = Match.objects.select_related("creator_team", "opponent_team", "pitch")
        params = self.request.query_params
        if match_type := params.get("match_type"):
            qs = qs.filter(match_type=match_type)
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
            qs = qs.filter(
                models.Q(creator_team_id__in=my_team_ids)
                | models.Q(opponent_team_id__in=my_team_ids)
            )
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
                match_type=data["match_type"],
                pitch=pitch,
                start_time=data["start_time"],
                end_time=data["end_time"],
                description=data.get("description", ""),
                total_price=data.get("total_price"),
                slots_needed=data.get("slots_needed"),
                price_per_slot=data.get("price_per_slot"),
            )
        except MatchServiceError as exc:
            raise ValidationError(str(exc))
        except ValueError as exc:
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
        except MatchServiceError as exc:
            raise ValidationError(str(exc))
        except ValueError as exc:
            raise ValidationError(str(exc))
        return Response(MatchSerializer(match).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, *args, **kwargs):
        match = get_object_or_404(Match, id=kwargs["id"])
        match = cancel_match(match=match, cancelled_by=request.user)
        return Response(MatchSerializer(match).data)

    @action(detail=True, methods=["post"])
    def accept(self, request, *args, **kwargs):
        serializer = AcceptChallengeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        accepting_team = get_object_or_404(Team, id=serializer.validated_data["accepting_team_id"])
        try:
            match = accept_challenge(
                match_id=kwargs["id"], accepting_team=accepting_team, accepted_by=request.user
            )
        except MatchServiceError as exc:
            raise ValidationError(str(exc))
        except ValueError as exc:
            raise ValidationError(str(exc))
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
        # Kept as its own method so the ONE place that needs to know
        # your real Pitch model's import path is isolated to a single
        # line — if 'pitches.Pitch' turns out to be wrong, this is
        # the only spot to fix in the whole view.
        from pitches.models import Pitch

        return get_object_or_404(Pitch, id=pitch_id)

    @action(detail=False, methods=["get"])
    def home(self, request):
        """Matches to surface on a user's home feed. Three sources,
        unioned and deduped:

        - TEAM_VS_TEAM matches where one of the user's teams is the
          creator (visible from the moment it's posted) or the
          opponent (only possible once accepted, since opponent_team
          is null until then — so this naturally only appears for the
          opponent's members once the match is CONFIRMED).
        - OPEN_SLOTS matches one of the user's teams created — the
          whole team should know their team posted a game.
        - OPEN_SLOTS matches the user personally joined as an outside
          player — visible ONLY to that individual, never their
          teammates, since joining never makes you a team member.

        Cancelled/completed matches and anything already in the past
        are excluded. Ordered soonest-first.
        """
        from team.models import TeamMembership

        my_team_ids = list(
            TeamMembership.objects.active_for_user(request.user).values_list("team_id", flat=True)
        )

        team_matches = Match.objects.filter(match_type=MatchType.TEAM_VS_TEAM).filter(
            models.Q(creator_team_id__in=my_team_ids) | models.Q(opponent_team_id__in=my_team_ids)
        )

        open_team_matches = Match.objects.filter(
            match_type=MatchType.OPEN_SLOTS,
            creator_team_id__in=my_team_ids,
        )

        my_participant_match_ids = list(
            MatchParticipant.objects.active().for_user(request.user).values_list("match_id", flat=True)
        )
        joined_matches = Match.objects.filter(id__in=my_participant_match_ids)

        combined = (team_matches | open_team_matches | joined_matches).distinct()
        combined = combined.exclude(status__in=[MatchStatus.CANCELLED, MatchStatus.COMPLETED])
        combined = combined.filter(end_time__gte=timezone.now())
        combined = combined.select_related("creator_team", "opponent_team", "pitch").order_by("start_time")

        return Response(MatchSerializer(combined, many=True).data)
