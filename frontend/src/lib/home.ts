import { api } from "./api";
import type { Match } from "./match";

/**
 * Matches to show on a user's home feed. Already scoped server-side to:
 *  - team_vs_team matches your team posted, or accepted as the opponent
 *  - open_slots matches your team posted
 *  - open_slots matches you personally joined as an outside player
 *    (visible only to you, not your teammates)
 * Cancelled/completed/past matches are excluded. Ordered soonest-first.
 */
export async function getHomeMatches(): Promise<Match[]> {
  const res = await api.get("/matches/home/");
  return res.data as Match[];
}