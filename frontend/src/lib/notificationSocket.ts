type SocketMessageHandler = (payload: {
  notification_type: string;
  title: string;
  body: string;
  data: Record<string, any>;
}) => void;

let socket: WebSocket | null = null;

export function connectNotificationSocket(token: string, onMessage: SocketMessageHandler) {
  // Adjust this base URL to match your backend host/port and protocol
  // (wss:// for https deployments, ws:// for local http dev).
  const wsUrl = `ws://localhost:7000/ws/notifications/?token=${token}`;

  socket = new WebSocket(wsUrl);

  socket.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      onMessage(payload);
    } catch (err) {
      console.error("Failed to parse WebSocket message:", err);
    }
  };

  socket.onerror = (err) => {
    console.error("Notification WebSocket error:", err);
  };

  socket.onclose = () => {
    console.log("Notification WebSocket closed.");
  };

  return socket;
}

export function disconnectNotificationSocket() {
  socket?.close();
  socket = null;
}