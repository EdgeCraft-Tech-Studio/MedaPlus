import { getDashboardPath, type UserRole } from "../pages/AppShell";
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
  const res = await api.get<SessionUser>("/auth/me/");
  return res.data;
}

export async function getHomeData(): Promise<SessionUser> {
  const res = await api.get<SessionUser>("/auth/home/");
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

// ---------- Profile ----------

export async function updateProfile(payload: {
  first_name?: string;
  last_name?: string;
}): Promise<SessionUser> {
  const res = await api.patch<SessionUser>("/auth/me/", payload);
  return res.data;
}

export async function updateProfilePhoto(file: File): Promise<{ profile_photo_url: string | null }> {
  const form = new FormData();
  form.append("profile_photo", file);
  const res = await api.patch<{ profile_photo_url: string | null }>("/auth/me/photo/", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

export async function updateEmail(email: string): Promise<SessionUser> {
  const res = await api.patch<SessionUser>("/auth/me/email/", { email });
  return res.data;
}

export async function changePassword(payload: {
  current_password: string;
  new_password: string;
  confirm_password: string;
}): Promise<{ message: string }> {
  const res = await api.post<{ message: string }>("/auth/me/change-password/", payload);
  return res.data;
}

export async function requestPhoneChange(payload: {
  new_phone: string; // must be +251… — normalize before calling this
  password: string;
}): Promise<{ message: string }> {
  const res = await api.post<{ message: string }>("/auth/me/phone/request/", payload);
  return res.data;
}

export async function confirmPhoneChange(payload: {
  new_phone: string; // same +251… value sent to requestPhoneChange
  otp_code: string;
}): Promise<SessionUser> {
  const res = await api.post<SessionUser>("/auth/me/phone/confirm/", payload);
  return res.data;
}

export async function resendOtp(payload: {
  phone: string;
  purpose: "signup" | "login" | "password_reset" | "phone_change";
}): Promise<{ message?: string }> {
  const res = await api.post("/otp/resend/", payload);
  return res.data;
}

export function getLandingRoute(user: SessionUser): string {
  return getDashboardPath(user.role as UserRole) ?? "/home";
}