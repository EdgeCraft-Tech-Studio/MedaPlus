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
  time: string;
  read: boolean;
  rawType?: string;
  data?: Record<string, any>;
  action?: {
    kind: "open" | "accept_decline";
    to?: string;
    label?: string;
  };
}

/* ---------------- Matches (Task 3) ---------------- */

export type MatchStage = "upcoming" | "ongoing" | "completed";

export interface MatchFull {
  id: string;
  sport: string;
  opponentLabel: string;
  teamName: string; // which of the user's teams this belongs to (or "Individual")
  pitchName: string;
  pitchAddress: string;
  date: string;
  time: string;
  durationMinutes: number;
  stage: MatchStage;
  bookingStatus: "confirmed" | "pending_payment" | "open";
  totalPriceEtb: number;
  paidEtb: number;
  shareCount: number;
  sharePaidCount: number;
  result?: { teamScore: number; opponentScore: number };
}

/* ---------------- Discover (Task 4) ---------------- */

export interface PitchResult {
  id: string;
  name: string;
  location: string;
  sport: string[];
  pricePerHourEtb: number;
  rating: number;
  nextAvailable: string; // human readable, e.g. "Today 6:00 PM"
}

export interface PublicTeamResult {
  id: string;
  name: string;
  logo: string | null;
  sport: string;
  location: string;
  activeMembers: number;
  capacity: number;
  skillLevel: string;
  visibility: "public" | "request";
  alreadyRequested?: boolean;
}

export interface TournamentFull {
  id: string;
  name: string;
  sport: string;
  location: string;
  organizer: string;
  status: TournamentStatus;
  registrationDeadline: string;
  startDate: string;
  teamsJoined: number;
  teamsMax: number;
  entryFeeEtb: number;
  description: string;
}

/* ---------------- Profile (Task 5) ---------------- */

export interface UserProfile {
  fullName: string;
  phone: string;
  email: string | null;
  photo: string | null;
}
