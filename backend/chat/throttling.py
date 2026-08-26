from rest_framework.throttling import UserRateThrottle


class ChatMessageSendThrottle(UserRateThrottle):
 

    scope = "chat_message_send"
