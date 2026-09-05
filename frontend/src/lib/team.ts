import { api } from "./api";

// ---------- Create team ----------

export interface CreateTeamPayload {
  name: string;
  description: string;
  sport: string;
  area: string;
  latitude: number;
  longitude: number;
  skill_level: string;
  preferred_days: string[];
  play_time: string;
  age_category: string;
  max_roster_size: number;
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
    if (key === "preferred_days") {
      form.append(key, JSON.stringify(value ?? []));
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
  skill_level: string;
  age_category: string;
  active_member_count: number;
  max_roster_size: number;
  available_slots: number;
  is_full: boolean;
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
  first_name?: string;
  last_name?: string;
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
  skill_level: string;
  age_category: string;
  preferred_days: string[];
  play_time: string;
  max_roster_size: number;
  active_member_count: number;
  available_slots: number;
  is_full: boolean;
  is_public: boolean;
  is_private: boolean;
  is_operable: boolean;
  owner: TeamOwner | null;
  my_role: "owner" | "admin" | "member" | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export async function getTeamDashboard(slug: string): Promise<TeamDashboardData> {
  const res = await api.get(`/teams/${slug}/dashboard/`);
  return res.data;
}

// ---------- Roster / invitations / join requests ----------

export interface RosterUser {
  id: string;
  username: string;
  first_name?: string;
  last_name?: string;
  profile_photo_url?: string | null; 
}

export interface RosterMember {
  id: string;
  team_id: string;
  user: RosterUser;
  role: "owner" | "admin" | "member";
  status: "active" | "left" | "removed";
  source: string;
  jersey_number: number | null;
  preferred_position: string;
  joined_at: string;
  status_changed_at: string | null;
  last_active_at: string | null;
  version: number;
}

export interface TeamInvitationItem {
  id: string;
  team_id: string;
  invitation_type: "direct" | "link" | "code";
  invited_user: RosterUser | null;
  invited_by: RosterUser;
  token: string | null;
  code: string | null;
  status: "pending" | "accepted" | "declined" | "cancelled" | "expired";
  max_uses: number | null;
  redemption_count: number;
  remaining_uses: number | null;
  is_expired: boolean;
  is_exhausted: boolean;
  is_redeemable: boolean;
  created_at: string;
  expires_at: string | null;
  responded_at: string | null;
}

export interface JoinRequestItem {
  id: string;
  user: RosterUser;
  message: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: RosterUser | null;
  version: number;
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
  // ✅ fixed: OwnershipTransferSerializer expects `new_owner_id`, not `newOwnerId`
  const res = await api.post(`/teams/${slug}/transfer-ownership/`, { new_owner_id: newOwnerId });
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

// replace createLinkInvitation / createCodeInvitation with these:

export interface CreateInvitationPayload {
  expires_in_days: number; // 1–3, required
  max_uses?: number | null;
}

export async function createLinkInvitation(slug: string, payload: CreateInvitationPayload): Promise<TeamInvitationItem> {
  const res = await api.post(`/teams/${slug}/invitations/link/`, payload);
  return res.data;
}

export async function createCodeInvitation(slug: string, payload: CreateInvitationPayload): Promise<TeamInvitationItem> {
  const res = await api.post(`/teams/${slug}/invitations/code/`, payload);
  return res.data;
}

export interface UpdateInvitationPayload {
  max_uses?: number | null;
  expires_in_days?: number;
  regenerate?: boolean;
}

export async function updateInvitation(slug: string, inviteId: string, payload: UpdateInvitationPayload): Promise<TeamInvitationItem> {
  const res = await api.patch(`/teams/${slug}/invitations/${inviteId}/update/`, payload);
  return res.data;
}



// ---------- Public team discovery ----------

export interface PublicTeam {
  id: string;
  slug: string;
  name: string;
  sport: string;
  visibility: string;
  status: string;
  city: string;
  area: string;
  skill_level: string;
  age_category: string;
  logo: string | null;
  max_roster_size: number;
  active_member_count: number;
  available_slots: number;
  is_full: boolean;
  created_at: string;
}

export async function getPublicTeams(params?: { sport?: string; city?: string; area?: string; skill_level?: string }): Promise<PublicTeam[]> {
  const res = await api.get("/teams/", { params });
  return res.data.results as PublicTeam[];
}

export async function sendJoinRequest(slug: string, message: string) {
  const res = await api.post(`/teams/${slug}/join-requests/`, { message });
  return res.data;
}

export interface MyJoinRequestSummary {
  id: string;
  team_id: string;
  team_slug: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
}

export async function getMyJoinRequests(): Promise<MyJoinRequestSummary[]> {
  const res = await api.get("/join-requests/my/");
  return res.data.results;
}

export async function cancelMyJoinRequest(requestId: string) {
  const res = await api.post(`/join-requests/my/${requestId}/cancel/`);
  return res.data;
}

// ---------- Invitation redemption (join by code) ----------

export interface InvitationPreview {
  id: string;
  invitation_type: "direct" | "link" | "code";
  team: PublicTeam;
  invited_by: RosterUser;
  status: string;
  is_expired: boolean;
  is_exhausted: boolean;
  is_redeemable: boolean;
  expires_at: string | null;
}

export async function lookupInvitationByCode(code: string): Promise<InvitationPreview> {
  const res = await api.get(`/invitations/code/${encodeURIComponent(code)}/`);
  return res.data;
}

export async function redeemInvitationByCode(code: string) {
  const res = await api.post(`/invitations/redeem-code/`, { code });
  return res.data;
}

export async function requestJoinViaCode(code: string, message: string = "") {
  const res = await api.post(`/invitations/code/request/`, { code, message });
  return res.data;
}


export interface UserSearchResult {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  profile_photo_url: string | null;
}

export async function searchUsersForInvite(slug: string, query: string): Promise<UserSearchResult[]> {
  const res = await api.get(`/teams/${slug}/invitations/search-users/`, {
    params: { q: query },
  });
  return res.data;
}

export async function createDirectInvitation(slug: string, invitedUserId: string) {
  const res = await api.post(`/teams/${slug}/invitations/direct/`, {
    invited_user_id: invitedUserId,
  });
  return res.data;
}


// ---------- Team booking requests (notify members instead of instant booking) ----------

export interface TeamBookingRequestPayload {
  pitch_id: string;
  pitch_name: string;
  team_id: string;
  booking_type: "HOURLY" | "WEEKLY" | "MONTHLY";
  selections: { start_iso: string; end_iso: string }[];
  notes?: string;
  price_per_member: string;
  total_price: string;
}

export interface TeamBookingRequestResult {
  message: string;
  request_id: string;
}

/**
 * Sends a booking *request* to a team the caller owns. This does NOT
 * create a confirmed booking — it notifies the team's members so they
 * can chip in / confirm. Requires a backend endpoint at
 * POST /bookings/team-request/ that:
 *   1. validates the caller owns `team_id`,
 *   2. re-checks slot availability for `pitch_id` + `selections`,
 *   3. creates a pending team-booking-request record,
 *   4. fires notifications to all active team members.
 */
export async function requestTeamBooking(
  payload: TeamBookingRequestPayload
): Promise<TeamBookingRequestResult> {
  const res = await api.post("/bookings/team-request/", payload);
  return res.data;
}