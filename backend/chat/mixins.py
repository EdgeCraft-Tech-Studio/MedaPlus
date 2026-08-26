from django.shortcuts import get_object_or_404

from team.models import Team


class TeamLookupMixin:


    team_lookup_url_kwarg = "team_slug"
    _team = None

    def get_team(self) -> Team:
        if self._team is None:
            slug = self.kwargs[self.team_lookup_url_kwarg]
            self._team = get_object_or_404(Team.objects.all(), slug=slug)
        return self._team
