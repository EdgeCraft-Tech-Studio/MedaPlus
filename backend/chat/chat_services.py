from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from team.models import TeamMembership
from team.services.exceptions import InsufficientPermissionError
from team.services.membership_service import get_active_membership_or_raise

from core.utils.choices import ChatMessageType
from .models import (
    MAX_AUDIO_DURATION_SECONDS,
    MAX_AUDIO_FILE_SIZE_BYTES,
    MAX_MESSAGE_LENGTH,
    TeamChatMessage,
    TeamChatReadState,
)

DEFAULT_RETENTION_DAYS = 30
DEFAULT_PURGE_BATCH_SIZE = 500


def _require_active_membership(team, user) -> TeamMembership:
    return get_active_membership_or_raise(
        team, user, InsufficientPermissionError, "Only active team members can use this chat."
    )


@transaction.atomic
def send_text_message(*, team, sender, content: str) -> TeamChatMessage:
    _require_active_membership(team, sender)

    content = (content or "").strip()
    if not content:
        raise ValueError("Message content cannot be blank.")
    if len(content) > MAX_MESSAGE_LENGTH:
        raise ValueError(f"Message content exceeds {MAX_MESSAGE_LENGTH} characters.")

    return TeamChatMessage.objects.create(
        team=team,
        sender=sender,
        message_type=ChatMessageType.TEXT,
        content=content,
    )


@transaction.atomic
def send_audio_message(
    *,
    team,
    sender,
    audio_file,
    audio_duration_seconds: int,
    audio_mime_type: str,
    audio_file_size_bytes: int,
) -> TeamChatMessage:
    _require_active_membership(team, sender)

    if not audio_file:
        raise ValueError("Audio message requires an audio_file.")
    if audio_duration_seconds is None or audio_duration_seconds <= 0:
        raise ValueError("Audio message requires a positive audio_duration_seconds.")
    if audio_duration_seconds > MAX_AUDIO_DURATION_SECONDS:
        raise ValueError(
            f"Audio message exceeds the {MAX_AUDIO_DURATION_SECONDS}s limit."
        )
    if audio_file_size_bytes is not None and audio_file_size_bytes > MAX_AUDIO_FILE_SIZE_BYTES:
        raise ValueError(
            f"Audio file exceeds the {MAX_AUDIO_FILE_SIZE_BYTES} byte limit."
        )

    return TeamChatMessage.objects.create(
        team=team,
        sender=sender,
        message_type=ChatMessageType.AUDIO,
        content="",
        audio_file=audio_file,
        audio_duration_seconds=audio_duration_seconds,
        audio_mime_type=audio_mime_type or "",
        audio_file_size_bytes=audio_file_size_bytes,
    )


def delete_message(*, message: TeamChatMessage, deleted_by) -> TeamChatMessage:

    membership = _require_active_membership(message.team, deleted_by)

    is_own_message = message.sender_id is not None and message.sender_id == deleted_by.id
    if not is_own_message and not membership.has_management_permissions:
        raise InsufficientPermissionError(
            "Only the sender or a team owner/admin can delete this message."
        )

    if message.is_deleted:
        return message  # already deleted — idempotent, not an error

    message.is_deleted = True
    message.save(update_fields=["is_deleted"])
    return message


def edit_message(*, message: TeamChatMessage, edited_by, new_content: str) -> TeamChatMessage:

    _require_active_membership(message.team, edited_by)

    if message.sender_id != edited_by.id:
        raise InsufficientPermissionError("You can only edit your own messages.")
    if message.is_deleted:
        raise ValueError("Cannot edit a deleted message.")
    if message.message_type != ChatMessageType.TEXT:
        raise ValueError("Only text messages can be edited.")

    new_content = (new_content or "").strip()
    if not new_content:
        raise ValueError("Message content cannot be blank.")
    if len(new_content) > MAX_MESSAGE_LENGTH:
        raise ValueError(f"Message content exceeds {MAX_MESSAGE_LENGTH} characters.")

    message.content = new_content
    message.edited_at = timezone.now()
    message.save(update_fields=["content", "edited_at"])
    return message


def mark_team_as_read(*, team, user) -> TeamChatReadState:
 
    _require_active_membership(team, user)
    state, _created = TeamChatReadState.objects.update_or_create(
        team=team, user=user, defaults={"last_read_at": timezone.now()},
    )
    return state


def get_unread_counts_for_user(*, user) -> dict:
   
    team_ids = list(
        TeamMembership.objects.active_for_user(user).values_list("team_id", flat=True)
    )
    if not team_ids:
        return {"total": 0, "by_team": {}}

    counts_by_id = {
        row["team_id"]: row["unread"]
        for row in TeamChatMessage.objects.unread_counts_by_team(user=user, team_ids=team_ids)
    }
    by_team = {str(team_id): counts_by_id.get(team_id, 0) for team_id in team_ids}
    total = sum(by_team.values())
    return {"total": total, "by_team": by_team}


def purge_old_messages(
    *, retention_days: int = DEFAULT_RETENTION_DAYS, batch_size: int = DEFAULT_PURGE_BATCH_SIZE
) -> int:
   
    cutoff = timezone.now() - timedelta(days=retention_days)
    total_deleted = 0

    while True:
        stale_ids = list(
            TeamChatMessage.objects.older_than(cutoff).values_list("id", flat=True)[:batch_size]
        )
        if not stale_ids:
            break
        deleted_count, _ = TeamChatMessage.objects.filter(id__in=stale_ids).delete()
        total_deleted += deleted_count

    return total_deleted