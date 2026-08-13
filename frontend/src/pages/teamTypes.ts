import { type TeamRole } from "./types";

export type Visibility = "public" | "private";

export type MembershipStatus = "ACTIVE" | "LEFT" | "REMOVED";
export type InvitationStatus = "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED" | "EXPIRED";
export type JoinRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export interface TeamDetail {
  id: string;
  name: string;
  logo: string | null;
  description: string;
  sport: string;
  homeArea: string;
  skillLevel: string;
  ageCategory: string;
  visibility: Visibility;
  capacity: number;
  activeCount: number;
  myRole: TeamRole;
  inviteCode: string;
  inviteLinkEnabled: boolean;
}

export interface RosterMember {
  id: string;
  name: string;
  avatar: string | null;
  role: TeamRole;
  status: MembershipStatus;
  joinedAt: string; // ISO date
}

export interface TeamInvitationItem {
  id: string;
  recipientName: string;
  recipientHandle: string; // phone or username
  status: InvitationStatus;
  sentAt: string; // ISO date
  method: "search" | "qr" | "link" | "code";
}

export interface JoinRequestItem {
  id: string;
  requesterName: string;
  requesterAvatar: string | null;
  message: string;
  status: JoinRequestStatus;
  requestedAt: string; // ISO date
}

/* ---------------- Invitation lookup (for the accept-invite page) ---------------- */

export interface InvitationLookupResult {
  invitationId: string;
  status: InvitationStatus;
  team: {
    id: string;
    name: string;
    logo: string | null;
    sport: string;
    homeArea: string;
    activeCount: number;
    capacity: number;
  };
  invitedBy: string; // name of the person who sent the invite
  expiresAt: string; // ISO date
}
