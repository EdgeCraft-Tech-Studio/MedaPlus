import { api } from "./api";

export type MatchType = "team_vs_team" | "open_slots";
export type MatchStatus = "open" | "confirmed" | "completed" | "cancelled";

export type Match = {
  id: string;
  match_type: MatchType;
  status: MatchStatus;
  creator_team_id: string;
  creator_team_name: string;
  opponent_team_id: string | null;
  opponent_team_name: string | null;
  pitch_id: string;
  start_time: string;
  end_time: string;
  description: string;
  total_price: string | null;
  price_per_team: string | null;
  slots_needed: number | null;
  price_per_slot: string | null;
  confirmed_participant_count: number;
  available_slots: number | null;
  confirmed_at: string | null;
  created_at: string;
};

export type MatchListParams = {
  team_id?: string;
  mine?: boolean;
  match_type?: MatchType;
  status?: MatchStatus;
};

export async function listMatches(params?: MatchListParams): Promise<Match[]> {
  const res = await api.get("/matches/", { params });
  return res.data as Match[];
}

export async function getMatch(id: string): Promise<Match> {
  const res = await api.get(`/matches/${id}/`);
  return res.data as Match;
}

export type CreateMatchPayload = {
  creator_team_id: string;
  match_type: MatchType;
  pitch_id: string;
  start_time: string; // ISO
  end_time: string; // ISO
  description?: string;
  total_price?: number;
  slots_needed?: number;
  price_per_slot?: number;
};

export async function createMatch(payload: CreateMatchPayload): Promise<Match> {
  const res = await api.post("/matches/", payload);
  return res.data as Match;
}

export type UpdateMatchPayload = Partial<{
  start_time: string;
  end_time: string;
  description: string;
  total_price: number;
  slots_needed: number;
  price_per_slot: number;
}>;

export async function updateMatch(id: string, payload: UpdateMatchPayload): Promise<Match> {
  const res = await api.patch(`/matches/${id}/`, payload);
  return res.data as Match;
}

export async function cancelMatch(id: string): Promise<Match> {
  const res = await api.post(`/matches/${id}/cancel/`);
  return res.data as Match;
}

export async function acceptChallenge(id: string, acceptingTeamId: string): Promise<Match> {
  const res = await api.post(`/matches/${id}/accept/`, { accepting_team_id: acceptingTeamId });
  return res.data as Match;
}

export type MatchParticipant = {
  id: string;
  match_id: string;
  user: {
    id: string;
    username: string;
    first_name?: string;
    last_name?: string;
    profile_photo_url?: string | null;
  };
  status: "reserved" | "confirmed" | "cancelled";
  amount_due: string;
  joined_at: string;
  status_changed_at: string | null;
};

export async function joinMatch(id: string): Promise<MatchParticipant> {
  const res = await api.post(`/matches/${id}/join/`);
  return res.data as MatchParticipant;
}

export async function leaveMatch(id: string): Promise<MatchParticipant> {
  const res = await api.post(`/matches/${id}/leave/`);
  return res.data as MatchParticipant;
}