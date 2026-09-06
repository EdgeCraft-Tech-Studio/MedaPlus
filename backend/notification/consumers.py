import json

from channels.generic.websocket import AsyncWebsocketConsumer


class NotificationConsumer(AsyncWebsocketConsumer):
    """One instance of this class exists per connected browser tab.
    On connect, we put the user into a private group named after
    their user id — nobody else can ever receive messages sent to
    that group, since group names aren't guessable/exposed anywhere.
    """

    async def connect(self):
        user = self.scope.get("user")

        if user is None or not user.is_authenticated:
            await self.close()
            return

        self.group_name = f"user_{user.id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    # Called automatically whenever something calls
    # channel_layer.group_send(group_name, {"type": "notify_event", ...})
    # Django Channels maps "type": "notify_event" to this method name
    # by replacing underscores — this exact naming convention is
    # required, don't rename this method without also changing the
    # "type" string on the sending side.
    async def notify_event(self, event):
        await self.send(text_data=json.dumps(event["payload"]))