import { api } from "./api";
import { saveSession, clearSession } from "./session";
import type { AuthSession, SessionUser } from "./session";

export async function login(payload: {
  phone: string;
  password: string;
  device_id: string;
  device_type: string;
  device_name: string;
}): Promise<AuthSession> {
  const res = await api.post<AuthSession>("/auth/login/", payload);
  saveSession(res.data);
  return res.data;
}

export async function me(): Promise<SessionUser> {
  const res = await api.get("/auth/me/");
  return res.data;
}

export async function getHomeData(): Promise<SessionUser> {
  const res = await api.get("/auth/home/");
  return res.data;
}

export async function register(payload: {
  username: string;
  first_name: string;
  last_name: string;
  phone: string;
  email?: string;
  password: string;
  confirm_password: string;
  role: "OWNER" | "PLAYER";
}) {
  const res = await api.post("/auth/register/", payload);
  return res.data as { id: string; username: string; role: "OWNER" | "PLAYER" };
}

export async function verifySignupOtp(payload: {
  phone: string;
  otp_code: string;
  device_id: string;
  device_type: string;
  device_name: string;
}): Promise<AuthSession> {
  const res = await api.post<AuthSession>("/auth/register/verify/", payload);
  saveSession(res.data);
  return res.data;
}

export async function logout(): Promise<void> {
  try {
    await api.post("/auth/logout/");
  } finally {
    clearSession();
  }
}