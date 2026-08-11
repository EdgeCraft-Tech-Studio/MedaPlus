export type TeamRole = "OWNER" | "ADMIN" | "MEMBER";

export interface TeamSummary {
  id: string;
  name: string;
  logo: string | null;
  sport: string;
  location: string;
  activeMembers: number;
  capacity: number;
  role: TeamRole;
}

export interface UpcomingMatch {
  id: string;
  sport: string;
  opponentLabel: string; // "vs Friday FC" or "Open match — 3 spots left"
  pitchName: string;
  date: string;   // ISO date
  time: string;   // "18:00"
  status: "confirmed" | "pending_payment" | "open";
}

export type TournamentStatus = "registration_open" | "upcoming" | "ongoing" | "completed";

export interface TournamentPreview {
  id: string;
  name: string;
  sport: string;
  location: string;
  status: TournamentStatus;
  startDate: string;
  teamsJoined: number;
  teamsMax: number;
}

export type NotificationCategory = "team" | "match" | "booking" | "tournament";

export interface AppNotification {
  id: string;
  category: NotificationCategory;
  title: string;
  message: string;
  time: string; // relative, e.g. "2h ago"
  read: boolean;
  action?: {
    label: string;
    kind: "accept_decline" | "open";
    to?: string;
  };
}
