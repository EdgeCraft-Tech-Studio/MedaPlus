from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView


from team.views.permissions import IsActiveTeamMember
from core.utils.choices import ChatMessageType
from .models import TeamChatMessage
from .serializers import (
    ChatAudioMessageCreateSerializer,
    ChatImageMessageCreateSerializer,
    ChatTextMessageCreateSerializer,
    TeamChatMessageSerializer,
)
from chat.chat_services import (
    delete_message,
    edit_message,
    get_unread_counts_for_user,
    mark_team_as_read,
    send_audio_message,
    send_image_message,
    send_text_message,
)
from .throttling import ChatMessageSendThrottle
from .mixins import TeamLookupMixin

DEFAULT_PAGE_LIMIT = 50
MAX_PAGE_LIMIT = 100


class TeamChatViewSet(TeamLookupMixin, viewsets.GenericViewSet):
   

    serializer_class = TeamChatMessageSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        team = self.get_team()
       
        return TeamChatMessage.objects.for_team(team).select_related("sender", "team")

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        team = self.get_team()
        permission = IsActiveTeamMember()
        if not permission.has_object_permission(request, self, team):
            raise PermissionDenied(permission.message)

    def get_throttles(self):
        if self.action in ("send_text", "send_audio", "send_image"):  # add send_image
            return [ChatMessageSendThrottle()]
        return super().get_throttles()

    # ------------------------------------------------------------------
    # Reading
    # ------------------------------------------------------------------

    def _get_limit(self, request) -> int:
        raw = request.query_params.get("limit")
        if raw is None:
            return DEFAULT_PAGE_LIMIT
        try:
            limit = int(raw)
        except (TypeError, ValueError):
            raise ValidationError({"limit": "Must be an integer."})
        if not (1 <= limit <= MAX_PAGE_LIMIT):
            raise ValidationError({"limit": f"Must be between 1 and {MAX_PAGE_LIMIT}."})
        return limit

    def _validate_cursor(self, value: str, param_name: str) -> str:
        
        import uuid as uuid_module

        try:
            uuid_module.UUID(str(value))
        except (ValueError, AttributeError, TypeError):
            raise ValidationError({param_name: "Must be a valid message id."})
        return value

    def list(self, request, *args, **kwargs):
        
        team = self.get_team()
        limit = self._get_limit(request)

        before_id = request.query_params.get("before")
        after_id = request.query_params.get("after")
        if before_id and after_id:
            raise ValidationError("Provide only one of `before` or `after`, not both.")
        if before_id:
            before_id = self._validate_cursor(before_id, "before")
        if after_id:
            after_id = self._validate_cursor(after_id, "after")

        queryset = self.get_queryset()

        if before_id:
            queryset = queryset.before(before_id)  # keeps default -created_at,-id ordering
        elif after_id:
            queryset = queryset.after(after_id).order_by("created_at", "id")

       
        window = list(queryset[: limit + 1])
        has_more = len(window) > limit
        page = window[:limit]

        serializer = self.get_serializer(page, many=True)
        return Response(
            {
                "results": serializer.data,
                "has_more": has_more,
                "next_cursor": str(page[-1].id) if has_more and page else None,
            }
        )

    # ------------------------------------------------------------------
    # Sending
    # ------------------------------------------------------------------

    @action(detail=False, methods=["post"], url_path="text")
    def send_text(self, request, *args, **kwargs):
        team = self.get_team()
        serializer = ChatTextMessageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            message = send_text_message(
                team=team, sender=request.user, content=serializer.validated_data["content"]
            )
        except ValueError as exc:
           
            raise ValidationError(str(exc))

        return Response(
            TeamChatMessageSerializer(message, context=self.get_serializer_context()).data,
            status=201,
        )

    @action(detail=False, methods=["post"], url_path="audio")
    def send_audio(self, request, *args, **kwargs):
        team = self.get_team()
        serializer = ChatAudioMessageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        uploaded_file = serializer.validated_data["audio_file"]
        
        try:
            message = send_audio_message(
                team=team,
                sender=request.user,
                audio_file=uploaded_file,
                audio_duration_seconds=serializer.validated_data["audio_duration_seconds"],
                audio_mime_type=getattr(uploaded_file, "content_type", "") or "",
                audio_file_size_bytes=uploaded_file.size,
            )
        except ValueError as exc:
            raise ValidationError(str(exc))

        return Response(
            TeamChatMessageSerializer(message, context=self.get_serializer_context()).data,
            status=201,
        )


    @action(detail=False, methods=["post"], url_path="image")
    def send_image(self, request, *args, **kwargs):
        team = self.get_team()
        serializer = ChatImageMessageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        uploaded_file = serializer.validated_data["image_file"]
        try:
            message = send_image_message(
                team=team,
                sender=request.user,
                image_file=uploaded_file,
                image_mime_type=getattr(uploaded_file, "content_type", "") or "",
                image_file_size_bytes=uploaded_file.size,
            )
        except ValueError as exc:
            raise ValidationError(str(exc))

        return Response(
            TeamChatMessageSerializer(message, context=self.get_serializer_context()).data,
            status=201,
        )
    # ------------------------------------------------------------------
    # Deleting
    # ------------------------------------------------------------------

    @action(detail=True, methods=["post"], url_path="delete")
    def delete(self, request, *args, **kwargs):
       
        message = self.get_object()
        delete_message(message=message, deleted_by=request.user)
        return Response(TeamChatMessageSerializer(message, context=self.get_serializer_context()).data)

    @action(detail=True, methods=["post"], url_path="edit")
    def edit(self, request, *args, **kwargs):
        message = self.get_object()
        serializer = ChatTextMessageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            message = edit_message(
                message=message,
                edited_by=request.user,
                new_content=serializer.validated_data["content"],
            )
        except ValueError as exc:
         
            raise ValidationError(str(exc))
        return Response(
            TeamChatMessageSerializer(message, context=self.get_serializer_context()).data
        )

    # ------------------------------------------------------------------
    # Read tracking
    # ------------------------------------------------------------------

    @action(detail=False, methods=["post"], url_path="mark-read")
    def mark_read(self, request, *args, **kwargs):
      
        team = self.get_team()
        mark_team_as_read(team=team, user=request.user)
        return Response(status=204)


class ChatAudioFileView(TeamLookupMixin, APIView):
    

    permission_classes = [IsAuthenticated]

    def get(self, request, team_slug, pk):
        team = self.get_team()
        permission = IsActiveTeamMember()
        if not permission.has_object_permission(request, self, team):
            raise PermissionDenied(permission.message)

        message = get_object_or_404(
            TeamChatMessage.objects.for_team(team),
            pk=pk,
            message_type=ChatMessageType.AUDIO,
        )
        
        if message.is_deleted or not message.audio_file:
            raise Http404

        return FileResponse(
            message.audio_file.open("rb"),
            content_type=message.audio_mime_type or "application/octet-stream",
        )



class ChatImageFileView(TeamLookupMixin, APIView):
    """GET /teams/{team_slug}/chat/messages/{pk}/image/
    Same authenticated-membership-per-request pattern as
    ChatAudioFileView — private team images are never served from a
    raw public MEDIA_URL.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, team_slug, pk):
        team = self.get_team()
        permission = IsActiveTeamMember()
        if not permission.has_object_permission(request, self, team):
            raise PermissionDenied(permission.message)

        message = get_object_or_404(
            TeamChatMessage.objects.for_team(team),
            pk=pk,
            message_type=ChatMessageType.IMAGE,
        )
        if message.is_deleted or not message.image_file:
            raise Http404

        return FileResponse(
            message.image_file.open("rb"),
            content_type=message.image_mime_type or "application/octet-stream",
        )


class ChatUnreadSummaryView(APIView):
   

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from team.models import Team

        summary = get_unread_counts_for_user(user=request.user)
        team_ids = list(summary["by_team"].keys())
        if not team_ids:
            return Response({"total_unread": 0, "teams": []})

        teams_by_id = {str(t.id): t for t in Team.objects.filter(id__in=team_ids)}

        rows = []
        for team_id_str, count in summary["by_team"].items():
            team = teams_by_id.get(team_id_str)
            if team is None:
                continue

           
            team_logo = None
            if team.logo:
                team_logo = (
                    request.build_absolute_uri(team.logo.url)
                    if request
                    else team.logo.url
                )

            last_message = (
                TeamChatMessage.objects.for_team(team)
                .visible()
                .select_related("sender")
                .order_by("-created_at", "-id")
                .first()
            )

            last_message_time = last_message.created_at.isoformat() if last_message else None
            last_message_sender_name = None
            last_message_preview = None
            is_last_message_mine = False

            if last_message:
                if last_message.is_audio_message:
                    last_message_preview = "🎤 Voice message"
                elif last_message.is_image_message:
                    last_message_preview = "📷 Photo"
                else:
                    last_message_preview = last_message.content

                if last_message.sender_id:
                    last_message_sender_name = last_message.sender.first_name or last_message.sender.username
                    is_last_message_mine = last_message.sender_id == request.user.id
                else:
                    last_message_sender_name = "Deleted user"

            rows.append({
                "team_id": team_id_str,
                "team_slug": team.slug,
                "team_name": team.name,
                "team_logo": team_logo,
                "unread_count": count,
                "last_message_time": last_message_time,             # NEW
                "last_message_sender_name": last_message_sender_name, # NEW
                "last_message_preview": last_message_preview,         # NEW
                "is_last_message_mine": is_last_message_mine,         # NEW
            })
        rows.sort(key=lambda r: r["unread_count"], reverse=True)

        return Response({"total_unread": summary["total"], "teams": rows})