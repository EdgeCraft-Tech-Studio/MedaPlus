from django.db import transaction
from django.utils import timezone

from team.services.exceptions import InsufficientPermissionError
from team.services.membership_service import get_active_membership_or_raise

from .choices import MatchParticipantStatus, MatchStatus, MatchType
from .exceptions import MatchFullError, MatchNotJoinableError, MatchScheduleConflictError
from .models import Match, MatchParticipant


# ------------------------------------------------------------------
# Conflict checks — "if they try to join other match with same time
# it is not possible." Only CONFIRMED team commitments and
# active (reserved/confirmed) player participations count as real
# conflicts — a merely OPEN, unconfirmed challenge isn't a commitment
# yet, so it doesn't block anything.
# ------------------------------------------------------------------

def _team_has_conflict(team, *, start_time, end_time, exclude_match_id=None) -> bool:
    qs = Match.objects.for_team(team).confirmed().overlapping(start_time=start_time, end_time=end_time)
    if exclude_match_id:
        qs = qs.exclude(id=exclude_match_id)
    return qs.exists()


def _player_has_conflict(user, *, start_time, end_time, exclude_match_id=None) -> bool:
    qs = (
        MatchParticipant.objects.active()
        .for_user(user)
        .filter(match__start_time__lt=end_time, match__end_time__gt=start_time)
    )
    if exclude_match_id:
        qs = qs.exclude(match_id=exclude_match_id)
    return qs.exists()


def _require_management_permission(team, user):
    membership = get_active_membership_or_raise(
        team, user, InsufficientPermissionError, "Actor is not an active member of this team."
    )
    if not membership.has_management_permissions:
        raise InsufficientPermissionError("Only an owner or admin can do this for the team.")
    return membership


# ------------------------------------------------------------------
# Create
# ------------------------------------------------------------------

@transaction.atomic
def create_match(
    *,
    creator_team,
    created_by,
    match_type: str,
    pitch,
    start_time,
    end_time,
    description: str = "",
    total_price=None,
    slots_needed=None,
    price_per_slot=None,
) -> Match:
    _require_management_permission(creator_team, created_by)

    if end_time <= start_time:
        raise ValueError("end_time must be after start_time.")

    if _team_has_conflict(creator_team, start_time=start_time, end_time=end_time):
        raise MatchScheduleConflictError(
            "This team already has a confirmed match that overlaps this time."
        )

    return Match.objects.create(
        match_type=match_type,
        creator_team=creator_team,
        pitch=pitch,
        start_time=start_time,
        end_time=end_time,
        description=description,
        total_price=total_price,
        slots_needed=slots_needed,
        price_per_slot=price_per_slot,
        created_by=created_by,
        status=MatchStatus.OPEN,
    )


# ------------------------------------------------------------------
# Update (OPEN matches only — editing after commitment is unfair to
# whoever already committed to the original time/price)
# ------------------------------------------------------------------

@transaction.atomic
def update_match(*, match: Match, updated_by, **fields) -> Match:
    _require_management_permission(match.creator_team, updated_by)

    if not match.is_open:
        raise MatchNotJoinableError("Only an OPEN match can still be edited.")

    new_start = fields.get("start_time", match.start_time)
    new_end = fields.get("end_time", match.end_time)
    if new_end <= new_start:
        raise ValueError("end_time must be after start_time.")

    if (new_start, new_end) != (match.start_time, match.end_time):
        if _team_has_conflict(
            match.creator_team, start_time=new_start, end_time=new_end, exclude_match_id=match.id
        ):
            raise MatchScheduleConflictError(
                "This team already has a confirmed match that overlaps the new time."
            )

    for field, value in fields.items():
        setattr(match, field, value)
    match.save(update_fields=[*fields.keys(), "updated_at"])
    return match


# ------------------------------------------------------------------
# TEAM_VS_TEAM: accept a challenge
# ------------------------------------------------------------------

@transaction.atomic
def accept_challenge(*, match_id, accepting_team, accepted_by) -> Match:
    """Locks the match row so two teams can't both accept the same
    open challenge at once, then re-checks both teams' schedules
    under that lock — time may have passed since the challenge was
    posted, so a fresh conflict could exist for either side now.
    """
    match = Match.objects.select_for_update().get(id=match_id)

    if match.match_type != MatchType.TEAM_VS_TEAM:
        raise MatchNotJoinableError("This match isn't a team-vs-team challenge.")
    if not match.is_open or match.opponent_team_id is not None:
        raise MatchNotJoinableError("This challenge is no longer open.")
    if accepting_team.id == match.creator_team_id:
        raise ValueError("A team cannot accept its own challenge.")

    _require_management_permission(accepting_team, accepted_by)

    if _team_has_conflict(
        accepting_team, start_time=match.start_time, end_time=match.end_time
    ):
        raise MatchScheduleConflictError(
            "Your team already has a confirmed match that overlaps this time."
        )
    if _team_has_conflict(
        match.creator_team, start_time=match.start_time, end_time=match.end_time,
        exclude_match_id=match.id,
    ):
        raise MatchScheduleConflictError(
            "The challenging team is no longer free at this time."
        )

    match.opponent_team = accepting_team
    match.status = MatchStatus.CONFIRMED
    match.confirmed_at = timezone.now()
    match.save(update_fields=["opponent_team", "status", "confirmed_at", "updated_at"])
    return match


# ------------------------------------------------------------------
# OPEN_SLOTS: join / leave
# ------------------------------------------------------------------

@transaction.atomic
def join_open_match(*, match_id, user) -> MatchParticipant:
    """Locks the match row for the duration of this transaction —
    same reasoning as team roster capacity: without it, two players
    joining the last open slot at the same instant could both
    squeeze past a naive count check.
    """
    match = Match.objects.select_for_update().get(id=match_id)

    if match.match_type != MatchType.OPEN_SLOTS:
        raise MatchNotJoinableError("This match doesn't have open slots to join.")
    if not match.is_open:
        # Covers CANCELLED/COMPLETED matches, AND the common full-match
        # case too: once the last slot fills, join_open_match below
        # atomically flips status to CONFIRMED in the same transaction
        # — so a subsequent join attempt sees status=CONFIRMED here,
        # not a separate "full" state. MatchFullError below still
        # guards the narrow window where confirmed_count reaches
        # capacity within THIS same call before the status flip
        # commits; it's a real defensive check, just one that rarely
        # fires in sequential use.
        raise MatchNotJoinableError("This match is no longer open.")

    already_in = MatchParticipant.objects.active().for_match(match).for_user(user).exists()
    if already_in:
        raise MatchNotJoinableError("You already hold a slot in this match.")

    confirmed_count = match.participants.filter(status=MatchParticipantStatus.CONFIRMED).count()
    if confirmed_count >= match.slots_needed:
        raise MatchFullError("This match has no open slots left.")

    if _player_has_conflict(user, start_time=match.start_time, end_time=match.end_time):
        raise MatchScheduleConflictError(
            "You already have another match booked that overlaps this time."
        )

    participant = MatchParticipant.objects.create(
        match=match, user=user, status=MatchParticipantStatus.RESERVED,
        amount_due=match.price_per_slot,
    )

    # Simplification, matching what was asked: a reserved slot counts
    # toward filling the match immediately (no separate payment-
    # confirmation gate here yet — that's the hook point for a real
    # payment integration later, not built now since no payment
    # gateway details were given).
    participant.status = MatchParticipantStatus.CONFIRMED
    participant.status_changed_at = timezone.now()
    participant.save(update_fields=["status", "status_changed_at"])

    new_confirmed_count = confirmed_count + 1
    if new_confirmed_count >= match.slots_needed and match.status != MatchStatus.CONFIRMED:
        match.status = MatchStatus.CONFIRMED
        match.confirmed_at = timezone.now()
        match.save(update_fields=["status", "confirmed_at", "updated_at"])

    return participant


@transaction.atomic
def leave_open_match(*, participant: MatchParticipant, cancelled_by) -> MatchParticipant:
    if participant.user_id != cancelled_by.id:
        raise InsufficientPermissionError("You can only cancel your own participation.")
    if not participant.is_active:
        return participant  # idempotent

    participant.status = MatchParticipantStatus.CANCELLED
    participant.status_changed_at = timezone.now()
    participant.save(update_fields=["status", "status_changed_at"])

    # Re-fetch the match fresh under lock — participant.match is a
    # cached relation from whenever THIS participant row was created,
    # which can be stale (e.g. p1 joined while the match was still
    # OPEN; by the time p1 leaves, the match may since have become
    # CONFIRMED via p2 filling the last slot — that later change is
    # invisible on p1's cached `.match`).
    match = Match.objects.select_for_update().get(id=participant.match_id)
    if match.status == MatchStatus.CONFIRMED:
        remaining = match.participants.filter(status=MatchParticipantStatus.CONFIRMED).count()
        if remaining < match.slots_needed:
            match.status = MatchStatus.OPEN
            match.confirmed_at = None
            match.save(update_fields=["status", "confirmed_at", "updated_at"])

    return participant


# ------------------------------------------------------------------
# Cancel a match entirely
# ------------------------------------------------------------------

def _is_team_manager(team, user) -> bool:
    """Returns False for 'not a member at all' rather than raising —
    unlike most permission checks in this codebase, NOT being on one
    of the two teams involved is an expected, normal case here (the
    canceller is only ever on at most one side), not an error.
    """
    from team.models import TeamMembership

    membership = TeamMembership.objects.active_for_team(team).for_user(user).first()
    return bool(membership and membership.has_management_permissions)


@transaction.atomic
def cancel_match(*, match: Match, cancelled_by) -> Match:
    """Either involved team's manager can cancel. Cascades: every
    active participant slot is freed too, since the match they were
    holding a slot for no longer exists — leaving their rows as
    RESERVED/CONFIRMED after the match itself is cancelled would be
    a dangling, confusing state.
    """
    can_cancel = _is_team_manager(match.creator_team, cancelled_by) or (
        match.opponent_team is not None and _is_team_manager(match.opponent_team, cancelled_by)
    )
    if not can_cancel:
        raise InsufficientPermissionError(
            "Only a manager of one of the involved teams can cancel this match."
        )

    match.status = MatchStatus.CANCELLED
    match.save(update_fields=["status", "updated_at"])

    match.participants.filter(
        status__in=[MatchParticipantStatus.RESERVED, MatchParticipantStatus.CONFIRMED]
    ).update(status=MatchParticipantStatus.CANCELLED, status_changed_at=timezone.now())

    return match
