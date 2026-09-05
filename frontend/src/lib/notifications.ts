import { api } from "./api";

export interface AppNotificationDTO {
  id: string;
  notification_type: string;
  title: string;
  body: string;
  data: Record<string, any>;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface NotificationListResponse {
  results: AppNotificationDTO[];
  count: number;
  next: string | null;
  previous: string | null;
}

export async function listNotifications(page = 1): Promise<NotificationListResponse> {
  const res = await api.get("/notifications/", { params: { page } });
  return res.data;
}

export async function markNotificationRead(id: string): Promise<AppNotificationDTO> {
  const res = await api.post(`/notifications/${id}/read/`);
  return res.data;
}

export async function markAllNotificationsRead(): Promise<{ marked_read: number }> {
  const res = await api.post("/notifications/mark-all-read/");
  return res.data;
}

export async function getUnreadNotificationCount(): Promise<{ unread_count: number }> {
  const res = await api.get("/notifications/unread-count/");
  return res.data;
}