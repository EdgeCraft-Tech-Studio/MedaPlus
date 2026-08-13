from django.db import transaction

from ..models import MembershipRole, MembershipSource, MembershipStatus, Team, TeamMembership


@transaction.atomic
def create_team(
    *,
    created_by,
    name: str,
    sport: str = None,
    visibility: str = None,
    description: str = "",
    area: str = "",
    city: str = "",
    skill_level: str = "",
    age_category: str = None,
    max_roster_size: int = None,
    logo=None,
) -> Team:
    """The ONLY supported way to create a team. Creates the Team and
    activates its creator as OWNER in one transaction — never call
    Team.objects.create() directly from a view, or a team could end
    up with no owner membership at all.
    """
    team_kwargs = {"created_by": created_by, "name": name}
    if sport is not None:
        team_kwargs["sport"] = sport
    if visibility is not None:
        team_kwargs["visibility"] = visibility
    if max_roster_size is not None:
        team_kwargs["max_roster_size"] = max_roster_size
    if age_category is not None:
        team_kwargs["age_category"] = age_category

    team = Team.objects.create(
        description=description,
        area=area,
        city=city or "Addis Ababa",
        skill_level=skill_level,
        logo=logo,
        **team_kwargs,
    )

    TeamMembership.objects.create(
        team=team,
        user=created_by,
        role=MembershipRole.OWNER,
        status=MembershipStatus.ACTIVE,
        source=MembershipSource.TEAM_CREATION,
    )

    return team
