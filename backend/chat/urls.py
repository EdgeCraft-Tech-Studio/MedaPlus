from django.urls import path

from .views import ChatAudioFileView, ChatImageFileView, ChatUnreadSummaryView, TeamChatViewSet

app_name = "chat"

urlpatterns = [
    path(
        "teams/<slug:team_slug>/chat/messages/",
        TeamChatViewSet.as_view({"get": "list"}),
        name="message-list",
    ),
    path(
        "teams/<slug:team_slug>/chat/messages/text/",
        TeamChatViewSet.as_view({"post": "send_text"}),
        name="message-send-text",
    ),
    path(
        "teams/<slug:team_slug>/chat/messages/audio/",
        TeamChatViewSet.as_view({"post": "send_audio"}),
        name="message-send-audio",
    ),
    path(
        "teams/<slug:team_slug>/chat/messages/<uuid:pk>/delete/",
        TeamChatViewSet.as_view({"post": "delete"}),
        name="message-delete",
    ),
    path(
        "teams/<slug:team_slug>/chat/messages/<uuid:pk>/edit/",
        TeamChatViewSet.as_view({"post": "edit"}),
        name="message-edit",
    ),
    path(
        "teams/<slug:team_slug>/chat/messages/<uuid:pk>/audio/",
        ChatAudioFileView.as_view(),
        name="message-audio-file",
    ),

    path(
    "teams/<slug:team_slug>/chat/messages/image/",
    TeamChatViewSet.as_view({"post": "send_image"}),
    name="message-send-image",
    ),
    path(
        "teams/<slug:team_slug>/chat/messages/<uuid:pk>/image/",
        ChatImageFileView.as_view(),
        name="message-image-file",
    ),


    path(
        "teams/<slug:team_slug>/chat/mark-read/",
        TeamChatViewSet.as_view({"post": "mark_read"}),
        name="mark-read",
    ),
    path(
        "chat/unread-summary/",
        ChatUnreadSummaryView.as_view(),
        name="unread-summary",
    ),

]