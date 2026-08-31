import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from core.utils.choices import ChatMessageType

MAX_MESSAGE_LENGTH = 4000
MAX_AUDIO_DURATION_SECONDS = 300  # 5 minutes — a sane voice-note cap
MAX_AUDIO_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB
MAX_IMAGE_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB, per your spec
ALLOWED_IMAGE_CONTENT_TYPES = {"image/jpeg", "image/png"}
 
class TeamChatMessageQuerySet(models.QuerySet):


    def for_team(self, team):
      
        return self.filter(team=team)

    def visible(self):
      
        return self.filter(is_deleted=False)

    def before(self, message_id):
       
        try:
            anchor = self.model.objects.get(pk=message_id)
        except (self.model.DoesNotExist, ValueError, ValidationError):
            return self.none()
        return self.filter(
            models.Q(created_at__lt=anchor.created_at)
            | models.Q(created_at=anchor.created_at, id__lt=anchor.id)
        )

    def after(self, message_id):
       
        try:
            anchor = self.model.objects.get(pk=message_id)
        except (self.model.DoesNotExist, ValueError, ValidationError):
            return self.none()
        return self.filter(
            models.Q(created_at__gt=anchor.created_at)
            | models.Q(created_at=anchor.created_at, id__gt=anchor.id)
        )

    def older_than(self, cutoff):
       
        return self.filter(created_at__lt=cutoff)

    def unread_counts_by_team(self, *, user, team_ids):
       
        last_read_subquery = TeamChatReadState.objects.filter(
            user=user, team_id=models.OuterRef("team_id")
        ).values("last_read_at")[:1]

        return (
            self.filter(team_id__in=team_ids, is_deleted=False)
            .exclude(sender=user)
            .annotate(_last_read_at=models.Subquery(last_read_subquery))
            .filter(
                models.Q(_last_read_at__isnull=True)
                | models.Q(created_at__gt=models.F("_last_read_at"))
            )
            .values("team_id")
            .annotate(unread=models.Count("id"))
        )


TeamChatMessageManager = models.Manager.from_queryset(TeamChatMessageQuerySet)


class TeamChatMessage(models.Model):
    

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    team = models.ForeignKey(
        "team.Team",
        on_delete=models.CASCADE,
        related_name="chat_messages",
    )

    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="team_chat_messages",
        null=True,
        blank=True,
        help_text=(
            "Nullable via SET_NULL rather than CASCADE: if a user "
            "account is ever hard-deleted, chat history should "
            "survive (shown as 'Deleted user'), not disappear. In "
            "normal operation this stays populated — your User model "
            "soft-deletes (deleted_at), it doesn't hard-delete rows."
        ),
    )

    message_type = models.CharField(
        max_length=10,
        choices=ChatMessageType.choices,
        default=ChatMessageType.TEXT,
    )

    content = models.TextField(max_length=MAX_MESSAGE_LENGTH, blank=True)

    # Image attachment — same null/blank-together pattern as audio fields.
    image_file = models.ImageField(
        upload_to="chat/images/%Y/%m/",
        null=True,
        blank=True,
        help_text=(
            "Stored on your MEDIA storage backend. Like audio, never "
            "expose via a public MEDIA_URL — served through an "
            "authenticated endpoint the same way audio is."
        ),
    )
    image_mime_type = models.CharField(max_length=50, blank=True)
    image_file_size_bytes = models.PositiveIntegerField(null=True, blank=True)

    audio_file = models.FileField(
        upload_to="chat/audio/%Y/%m/",
        null=True,
        blank=True,
        help_text=(
            "Stored on your MEDIA storage backend. Do NOT expose "
            "this via a public MEDIA_URL for chat — private team "
            "audio must be served through an authenticated endpoint "
            "that checks the requester is an active member of "
            "`team`, not a raw static file path anyone with the URL "
            "could hit."
        ),
    )
    audio_duration_seconds = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        help_text="Reported by the client at record time (from MediaRecorder timing), not re-derived server-side.",
    )
    audio_mime_type = models.CharField(
        max_length=50,
        blank=True,
        help_text="e.g. 'audio/webm', 'audio/ogg' — needed so playback knows the container format; varies by recording browser/device.",
    )
    audio_file_size_bytes = models.PositiveIntegerField(null=True, blank=True)

    
    is_deleted = models.BooleanField(default=False)

   
    edited_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    objects = TeamChatMessageManager()

    class Meta:
        db_table = "chat_team_chat_message"
        verbose_name = "Team Chat Message"
        verbose_name_plural = "Team Chat Messages"
       
        ordering = ["-created_at", "-id"]
        constraints = [
            
            models.CheckConstraint(
                condition=~models.Q(message_type=ChatMessageType.AUDIO)
                | ~models.Q(audio_file=""),
                name="chat_message_audio_requires_file",
            ),
            
            models.CheckConstraint(
                condition=~models.Q(message_type=ChatMessageType.TEXT)
                | ~models.Q(content=""),
                name="chat_message_text_requires_content",
            ),
                        models.CheckConstraint(
                condition=~models.Q(message_type=ChatMessageType.IMAGE)
                | ~models.Q(image_file=""),
                name="chat_message_image_requires_file",
            ),
        ]
        indexes = [
          
            models.Index(fields=["team", "-created_at"], name="idx_chat_team_created"),
        ]

    def __str__(self) -> str:
        sender_label = self.sender_id or "deleted-user"
        return f"[{self.team_id}] {sender_label}: {self.content[:40]}"

    @property
    def is_system_message(self) -> bool:
        return self.message_type == ChatMessageType.SYSTEM

    @property
    def is_audio_message(self) -> bool:
        return self.message_type == ChatMessageType.AUDIO

    @property
    def is_image_message(self) -> bool:
        return self.message_type == ChatMessageType.IMAGE


class TeamChatReadStateQuerySet(models.QuerySet):
    def for_user(self, user):
        return self.filter(user=user)

    def for_team(self, team):
        return self.filter(team=team)


TeamChatReadStateManager = models.Manager.from_queryset(TeamChatReadStateQuerySet)


class TeamChatReadState(models.Model):
   

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    team = models.ForeignKey(
        "team.Team",
        on_delete=models.CASCADE,
        related_name="chat_read_states",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="chat_read_states",
    )

    last_read_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="NULL means this user has never opened this team's chat — everything in it is unread.",
    )
    updated_at = models.DateTimeField(auto_now=True)

    objects = TeamChatReadStateManager()

    class Meta:
        db_table = "chat_team_chat_read_state"
        verbose_name = "Team Chat Read State"
        verbose_name_plural = "Team Chat Read States"
        constraints = [
            models.UniqueConstraint(
                fields=["team", "user"], name="uniq_read_state_per_team_user"
            ),
        ]
        indexes = [
            models.Index(fields=["user"]),
        ]

    def __str__(self) -> str:
        return f"{self.user_id} last read {self.team_id} at {self.last_read_at}"