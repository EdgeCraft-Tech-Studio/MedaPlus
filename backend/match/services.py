from django.db import transaction
from django.utils import timezone

from team.services.exceptions import InsufficientPermissionError
from team.services.membership_service import get_active_membership_or_raise

from .choices import MatchParticipantStatus, MatchStatus
from .exceptions import MatchFullError, MatchNotJoinableError, MatchScheduleConflictError
from .models import Match, MatchParticipant


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


@transaction.atomic
def create_match(
    *,
    creator_team,
    created_by,
    pitch,
    start_time,
    end_time,
    slots_needed,
    price_per_slot,
    description: str = "",
) -> Match:
    """Open-slots only. A team leaves a game open for outside players
    to fill the seats it couldn't fill itself.
    """
    _require_management_permission(creator_team, created_by)

    if end_time <= start_time:
        raise ValueError("end_time must be after start_time.")
    if slots_needed is None or slots_needed <= 0:
        raise ValueError("slots_needed must be a positive number.")
    if price_per_slot is None or price_per_slot < 0:
        raise ValueError("price_per_slot must be zero or greater.")

    if _team_has_conflict(creator_team, start_time=start_time, end_time=end_time):
        raise MatchScheduleConflictError(
            "This team already has a confirmed match that overlaps this time."
        )

    return Match.objects.create(
        creator_team=creator_team,
        pitch=pitch,
        start_time=start_time,
        end_time=end_time,
        description=description,
        slots_needed=slots_needed,
        price_per_slot=price_per_slot,
        created_by=created_by,
        status=MatchStatus.OPEN,
    )


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


@transaction.atomic
def join_open_match(*, match_id, user) -> MatchParticipant:
    match = Match.objects.select_for_update().get(id=match_id)

    if not match.is_open:
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
    participant.status = MatchParticipantStatus.CONFIRMED
    participant.status_changed_at = timezone.now()
    participant.save(update_fields=["status", "status_changed_at"])

    new_confirmed_count = confirmed_count + 1
    if new_confirmed_count >= match.slots_needed and match.status != MatchStatus.CONFIRMED:
        match.status = MatchStatus.CONFIRMED
        match.confirmed_at = timezone.now()
        match.save(update_fields=["status", "confirmed_at", "updated_at"])

    _notify_linked_booking_request_of_join(match, user)

    return participant


def _notify_linked_booking_request_of_join(match, joined_user) -> None:
    """If this match exists because a TeamBookingRequest opened slots
    for declined members, notify the requesting owner every time
    someone joins, and — once every slot is filled — hand control
    back to team_booking's normal confirm/payment flow. A local,
    function-level import avoids a circular import between the two
    apps (team_booking already imports match; match must not import
    team_booking at module load time).
    """
    from notification.choices import NotificationType
    from notification.services import notify
    from team_booking.models import TeamBookingRequest
    from team_booking.services import handle_open_slot_match_filled

    booking_request = (
        TeamBookingRequest.objects.select_related("team")
        .filter(open_slot_match_id=match.id)
        .first()
    )
    if not booking_request:
        return

    full_name = f"{getattr(joined_user, 'first_name', '')} {getattr(joined_user, 'last_name', '')}".strip()
    display_name = full_name or getattr(joined_user, "username", "A player")

    notify(
        recipient=booking_request.created_by,
        notification_type=NotificationType.TEAM_BOOKING_OPEN_SLOT_JOINED,
        title="Player joined the match",
        body=f"{display_name} joined the match at {booking_request.pitch_name}.",
        data={"team_booking_request_id": str(booking_request.id), "match_id": str(match.id)},
        send_push=False,
    )

    match.refresh_from_db()
    if match.confirmed_participant_count >= match.slots_needed:
        handle_open_slot_match_filled(booking_request)

@transaction.atomic
def leave_open_match(*, participant: MatchParticipant, cancelled_by) -> MatchParticipant:
    if participant.user_id != cancelled_by.id:
        raise InsufficientPermissionError("You can only cancel your own participation.")
    if not participant.is_active:
        return participant

    participant.status = MatchParticipantStatus.CANCELLED
    participant.status_changed_at = timezone.now()
    participant.save(update_fields=["status", "status_changed_at"])

    match = Match.objects.select_for_update().get(id=participant.match_id)
    if match.status == MatchStatus.CONFIRMED:
        remaining = match.participants.filter(status=MatchParticipantStatus.CONFIRMED).count()
        if remaining < match.slots_needed:
            match.status = MatchStatus.OPEN
            match.confirmed_at = None
            match.save(update_fields=["status", "confirmed_at", "updated_at"])

    return participant


def _is_team_manager(team, user) -> bool:
    from team.models import TeamMembership

    membership = TeamMembership.objects.active_for_team(team).for_user(user).first()
    return bool(membership and membership.has_management_permissions)


@transaction.atomic
def cancel_match(*, match: Match, cancelled_by) -> Match:
    if not _is_team_manager(match.creator_team, cancelled_by):
        raise InsufficientPermissionError(
            "Only a manager of this team can cancel this match."
        )

    match.status = MatchStatus.CANCELLED
    match.save(update_fields=["status", "updated_at"])

    match.participants.filter(
        status__in=[MatchParticipantStatus.RESERVED, MatchParticipantStatus.CONFIRMED]
    ).update(status=MatchParticipantStatus.CANCELLED, status_changed_at=timezone.now())

    return match