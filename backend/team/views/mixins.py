from django.shortcuts import get_object_or_404

from ..models import Team


class TeamLookupMixin:
    """Every nested endpoint (members/invitations/join-requests) is
    mounted under /teams/<team_slug>/..., so every one of those views
    needs the same "resolve slug -> Team or 404" step. Centralizing
    it here means:
    1. One place enforces `Team.objects` (the default manager, which
       already excludes soft-deleted teams) rather than some views
       accidentally using `Team.all_objects` and leaking access to a
       deleted team's sub-resources.
    2. The lookup is memoized per-request (`self._team`) so a view
       that calls `self.get_team()` from both `get_queryset()` and a
       permission check doesn't hit the DB twice for the same object.
    """

    team_lookup_url_kwarg = "team_slug"
    _team = None

    def get_team(self) -> Team:
        if self._team is None:
            slug = self.kwargs[self.team_lookup_url_kwarg]
            self._team = get_object_or_404(Team.objects.select_related("created_by"), slug=slug)
        return self._team
