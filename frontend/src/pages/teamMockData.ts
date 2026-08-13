import { type TeamDetail, type RosterMember, type TeamInvitationItem, type JoinRequestItem, type InvitationLookupResult } from "./teamTypes";

// TODO: replace with real API calls
// GET /teams/:id, type GET /teams/:id/members, type GET /teams/:id/invitations, GET /teams/:id/join-requests

export const mockTeamDetail: Record<string, TeamDetail> = {
  "bole-united": {
    id: "bole-united",
    name: "Bole United",
    logo: null,
    description: "Weekend 7-a-side crew, big on passing, low on drama.",
    sport: "Football",
    homeArea: "Bole, Addis Ababa",
    skillLevel: "Intermediate",
    ageCategory: "18–30",
    visibility: "public",
    capacity: 25,
    activeCount: 14,
    myRole: "OWNER",
    inviteCode: "BOLE-7X2K",
    inviteLinkEnabled: true,
  },
};

export const mockRoster: Record<string, RosterMember[]> = {
  "bole-united": [
    { id: "u1", name: "Yonas Tesfaye", avatar: null, role: "OWNER", status: "ACTIVE", joinedAt: "2025-11-02" },
    { id: "u2", name: "Betelhem Alemu", avatar: null, role: "ADMIN", status: "ACTIVE", joinedAt: "2025-11-10" },
    { id: "u3", name: "Nahom Girma", avatar: null, role: "MEMBER", status: "ACTIVE", joinedAt: "2025-12-01" },
    { id: "u4", name: "Selam Worku", avatar: null, role: "MEMBER", status: "ACTIVE", joinedAt: "2025-12-14" },
    { id: "u5", name: "Dawit Mekonnen", avatar: null, role: "MEMBER", status: "ACTIVE", joinedAt: "2026-01-20" },
  ],
};

export const mockInvitations: Record<string, TeamInvitationItem[]> = {
  "bole-united": [
    { id: "inv1", recipientName: "Kaleab Fikru", recipientHandle: "+251 91 234 5678", status: "PENDING", sentAt: "2026-08-09", method: "search" },
    { id: "inv2", recipientName: "Rahel Assefa", recipientHandle: "@rahel_a", status: "PENDING", sentAt: "2026-08-08", method: "link" },
    { id: "inv3", recipientName: "Mikiyas Tadesse", recipientHandle: "+251 92 345 6789", status: "DECLINED", sentAt: "2026-08-01", method: "search" },
    { id: "inv4", recipientName: "Hanna Girma", recipientHandle: "@hanna_g", status: "EXPIRED", sentAt: "2026-07-20", method: "code" },
  ],
};

export const mockJoinRequests: Record<string, JoinRequestItem[]> = {
  "bole-united": [
    { id: "jr1", requesterName: "Amanuel Bekele", requesterAvatar: null, message: "Play centre-back, free most weekends.", status: "PENDING", requestedAt: "2026-08-10" },
    { id: "jr2", requesterName: "Liya Tesfaye", requesterAvatar: null, message: "Friend of Dawit, looking for a regular team.", status: "PENDING", requestedAt: "2026-08-09" },
  ],
};

// TODO: replace with a real endpoint, e.g. GET /invitations/lookup?teamId=&code=
// or GET /invitations/:invitationId when opened from a notification deep link.
//
// Real behavior to implement on the backend:
//  - looking up an already-ACCEPTED/DECLINED/CANCELLED/EXPIRED invitation should
//    return that status so the UI can show the right message instead of the
//    accept/decline buttons.
//  - an unknown team id or code should behave like "not found", not leak
//    which part was wrong (avoids enumerating valid team ids / codes).
export function mockLookupInvitation(teamId: string, code: string): InvitationLookupResult | null {
  const team = mockTeamDetail[teamId];
  if (!team) return null;
  if (code.toUpperCase() !== team.inviteCode.toUpperCase()) return null;

  return {
    invitationId: "inv-demo-001",
    status: "PENDING",
    team: {
      id: team.id,
      name: team.name,
      logo: team.logo,
      sport: team.sport,
      homeArea: team.homeArea,
      activeCount: team.activeCount,
      capacity: team.capacity,
    },
    invitedBy: "Yonas Tesfaye",
    expiresAt: "2026-08-20",
  };
}
