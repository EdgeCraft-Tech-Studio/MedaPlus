import { type TeamSummary, type UpcomingMatch, type TournamentPreview, type AppNotification } from "./types";

// TODO: replace every export in this file with real API calls
// (e.g. GET /me/teams, type GET /me/matches/upcoming, GET /tournaments/relevant, GET /me/notifications)

export const mockTeams: TeamSummary[] = [
  { id: "bole-united", name: "Bole United", logo: null, sport: "Football", location: "Bole, Addis Ababa", activeMembers: 14, capacity: 18, role: "OWNER" },
  { id: "friday-fc", name: "Friday FC", logo: null, sport: "Football", location: "CMC, Addis Ababa", activeMembers: 9, capacity: 16, role: "MEMBER" },
  { id: "hoops-collective", name: "Hoops Collective", logo: null, sport: "Basketball", location: "Sarbet, Addis Ababa", activeMembers: 8, capacity: 12, role: "ADMIN" },
];

export const mockMatches: UpcomingMatch[] = [
  { id: "m1", sport: "Football", opponentLabel: "vs Friday FC", pitchName: "Bole Arena", date: "2026-08-14", time: "18:00", status: "confirmed" },
  { id: "m2", sport: "Football", opponentLabel: "Open match — 3 spots left", pitchName: "CMC Pitch 2", date: "2026-08-16", time: "16:30", status: "open" },
  { id: "m3", sport: "Basketball", opponentLabel: "vs Court Kings", pitchName: "Sarbet Indoor Court", date: "2026-08-17", time: "19:00", status: "pending_payment" },
];

export const mockTournaments: TournamentPreview[] = [
  { id: "t1", name: "Bole Weekend Cup", sport: "Football", location: "Bole, Addis Ababa", status: "registration_open", startDate: "2026-08-22", teamsJoined: 6, teamsMax: 8 },
  { id: "t2", name: "CMC 3x3 Showdown", sport: "Basketball", location: "CMC, Addis Ababa", status: "upcoming", startDate: "2026-09-02", teamsJoined: 10, teamsMax: 16 },
];

export const mockNotifications: AppNotification[] = [
  {
    id: "n1", category: "team", title: "Team invitation", message: "Friday FC invited you to join as a member.",
    time: "12m ago", read: false, action: { label: "Respond", kind: "accept_decline" },
  },
  {
    id: "n2", category: "match", title: "Match reminder", message: "Bole United vs Friday FC starts in 3 hours.",
    time: "1h ago", read: false, action: { label: "View match", kind: "open", to: "/matches/m1" },
  },
  {
    id: "n3", category: "booking", title: "Payment update", message: "3 of 10 shares paid for Saturday's booking — 06:42 remaining.",
    time: "2h ago", read: false, action: { label: "View booking", kind: "open", to: "/matches/m3" },
  },
  {
    id: "n4", category: "tournament", title: "Registration deadline", message: "Bole Weekend Cup registration closes in 2 days.",
    time: "5h ago", read: true, action: { label: "View tournament", kind: "open", to: "/discover/tournaments/t1" },
  },
  {
    id: "n5", category: "team", title: "Join request approved", message: "You're now a member of Hoops Collective.",
    time: "1d ago", read: true,
  },
];
