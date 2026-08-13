import { api } from "./api";

// ---------- Create team ----------

export interface CreateTeamPayload {
  name: string;
  description: string;
  sport: string;
  area: string;
  skillLevel: string;
  preferredDays: string[];
  playTime: string;
  ageCategory: string;
  maxRosterSize: number;
  visibility: string;
  logoFile: File | null;
}

export async function createTeam(payload: CreateTeamPayload) {
  const form = new FormData();
  Object.entries(payload).forEach(([key, value]) => {
    if (key === "logoFile") {
      if (value) form.append("logo", value as File);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((v) => form.append(key, v));
    } else if (value !== "" && value !== null && value !== undefined) {
      form.append(key, String(value));
    }
  });

  const res = await api.post("/teams/", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data as { slug: string; id: string; name: string };
}

// ---------- My teams list ----------

export interface MyTeam {
  id: string;
  slug: string;
  name: string;
  logo: string | null;
  sport: string;
  visibility: string;
  status: string;
  area: string;
  city: string;
  skillLevel: string;
  ageCategory: string;
  activeMemberCount: number;
  maxRosterSize: number;
  availableSlots: number;
  isFull: boolean;
  role: "owner" | "admin" | "member";
}

export async function getMyTeams(): Promise<MyTeam[]> {
  const res = await api.get("/teams/my/");
  return res.data.results as MyTeam[];
}

// ---------- Team dashboard (owner/admin only) ----------

export interface TeamOwner {
  id: string;
  username: string;
  firstName?: string;
  lastName?: string;
}

export interface TeamDashboardData {
  id: string;
  slug: string;
  name: string;
  sport: string;
  visibility: string;
  status: string;
  logo: string | null;
  description: string;
  city: string;
  area: string;
  latitude: number | null;
  longitude: number | null;
  skillLevel: string;
  ageCategory: string;
  preferredDays: string[];
  playTime: string;
  maxRosterSize: number;
  activeMemberCount: number;
  availableSlots: number;
  isFull: boolean;
  isPublic: boolean;
  isPrivate: boolean;
  isOperable: boolean;
  owner: TeamOwner | null;
  myRole: "owner" | "admin" | "member" | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export async function getTeamDashboard(slug: string): Promise<TeamDashboardData> {
  const res = await api.get(`/teams/${slug}/dashboard/`);
  return res.data;
}

// ---------- Roster / invitations / join requests ----------

export interface RosterUser {
  id: string;
  username: string;
  firstName?: string;
  lastName?: string;
  avatar?: string | null;
}

export interface RosterMember {
  id: string;
  teamId: string;
  user: RosterUser;
  role: "owner" | "admin" | "member";
  status: "active" | "left" | "removed";
  source: string;
  jerseyNumber: number | null;
  preferredPosition: string;
  joinedAt: string;
  statusChangedAt: string | null;
  lastActiveAt: string | null;
  version: number;
}

// ⚠️ UNCONFIRMED shape — paste the real invitation serializer to correct this.
export interface TeamInvitationItem {
  id: string;
  recipientName: string;
  recipientHandle: string;
  status: "pending" | "accepted" | "declined" | "cancelled";
  sentAt: string;
}

// ⚠️ UNCONFIRMED shape — paste the real join-request serializer to correct this.
export interface JoinRequestItem {
  id: string;
  requesterName: string;
  requesterAvatar: string | null;
  message: string;
  status: "pending" | "approved" | "rejected";
}

export async function getRoster(slug: string): Promise<RosterMember[]> {
  const res = await api.get(`/teams/${slug}/members/`);
  return res.data.results;
}

export async function getInvitations(slug: string): Promise<TeamInvitationItem[]> {
  const res = await api.get(`/teams/${slug}/invitations/`);
  return res.data.results;
}

export async function getJoinRequests(slug: string): Promise<JoinRequestItem[]> {
  const res = await api.get(`/teams/${slug}/join-requests/`);
  return res.data.results;
}

export async function promoteMember(slug: string, memberId: string) {
  const res = await api.post(`/teams/${slug}/members/${memberId}/promote/`);
  return res.data as RosterMember;
}

export async function demoteMember(slug: string, memberId: string) {
  const res = await api.post(`/teams/${slug}/members/${memberId}/demote/`);
  return res.data as RosterMember;
}

export async function removeMember(slug: string, memberId: string) {
  const res = await api.post(`/teams/${slug}/members/${memberId}/remove/`);
  return res.data as RosterMember;
}

export async function transferOwnership(slug: string, newOwnerId: string) {
  const res = await api.post(`/teams/${slug}/transfer-ownership/`, { newOwnerId });
  return res.data;
}

export async function cancelInvitation(slug: string, inviteId: string) {
  await api.post(`/teams/${slug}/invitations/${inviteId}/cancel/`);
}

export async function approveJoinRequest(slug: string, requestId: string) {
  await api.post(`/teams/${slug}/join-requests/${requestId}/approve/`);
}

export async function rejectJoinRequest(slug: string, requestId: string) {
  await api.post(`/teams/${slug}/join-requests/${requestId}/reject/`);
}

export async function createLinkInvitation(slug: string) {
  const res = await api.post(`/teams/${slug}/invitations/link/`);
  return res.data as { id: string; inviteLink: string }; // ⚠️ confirm backend returns `id`
}

export async function createCodeInvitation(slug: string) {
  const res = await api.post(`/teams/${slug}/invitations/code/`);
  return res.data as { id: string; code: string }; // ⚠️ confirm backend returns `id`
}