import { api } from "./api";
export type SportType = "FOOTBALL" | "BASKETBALL";

export type PitchImageItem = {
  id: string;
  url: string;
};

export type Pitch = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  sport_type: SportType;

  opening_time: string;
  closing_time: string;
  opening_time_label: string;
  closing_time_label: string;

  min_hours: number;
  allow_hourly: boolean;
  allow_weekly: boolean;
  allow_monthly: boolean;

  hourly_price: string;
  weekly_price: string;
  monthly_price: string;

  has_dressing_room: boolean;
  has_showers: boolean;
  has_parking: boolean;
  has_lighting: boolean;
  other_services: string;

  cover_image_url?: string | null;
  image_urls?: string[];
  images?: PitchImageItem[];

  is_approved: boolean;
  is_active: boolean;
};

export type AvailabilitySlot = {
  key: string;
  slot_id: string | null;
  start_iso: string;
  end_iso: string;
  label: string;
  hour: number;
  status: string;
  is_available: boolean;
};

export type AvailabilityDay = {
  date: string;
  weekday: string;
  weekday_short: string;
  display_date: string;
  slots: AvailabilitySlot[];
};

export type MonthlyWeek = {
  week_index: number;
  days: AvailabilityDay[];
};

export type ExistingBooking = {
  id: string;
  start_iso: string;
  end_iso: string;
  label: string;
  status: string;
  booking_code: string;
  total_price: string;
  booked_by: string;
  notes: string;
};

export type PitchDetailResponse = {
  pitch: Pitch;
  daily_weekly_days: AvailabilityDay[];
  monthly_weeks: MonthlyWeek[];
  existing_bookings: ExistingBooking[];
};

export async function listPitches() {
  const res = await api.get("/pitches/");
  return res.data.pitches as Pitch[];
}

export async function getPitchDetail(pitchId: string) {
  const res = await api.get(`/pitches/${pitchId}/`);
  return res.data as PitchDetailResponse;
}

export async function createPitch(payload: FormData) {
  const res = await api.post("/pitches/", payload, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return res.data.pitch as Pitch;
} 

export async function updatePitch(pitchId: string, payload: FormData) {
  const res = await api.patch(`/pitches/${pitchId}/`, payload, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return res.data.pitch as Pitch;
}

export async function createBooking(payload: {
  pitch_id: string;
  booking_type: "HOURLY" | "WEEKLY" | "MONTHLY";
  selections: { start_iso: string; end_iso: string }[];
  notes?: string;
  manual_cash?: boolean;
  booked_for_name?: string;
}) {
  const res = await api.post("/bookings/", payload); 
  return res.data;
}

export async function listPendingPitches() {
  const res = await api.get("/admin/pitches/pending/");
  return res.data.pending_pitches as Pitch[];
}

export async function approvePitch(pitchId: string) {
  const res = await api.post(`/admin/pitches/${pitchId}/approve/`);
  return res.data;
}


export async function listPendingOwners() {
  const res = await api.get("/admin/owners/pending/");
  return res.data.pending_owners as Array<{
    id: string;
    username: string;
    first_name: string;
    last_name: string;
    phone: string;
    email: string;
    profile_photo_url: string | null;
  }>;
}

export async function declineOwner(ownerId: string) {
  
  const res = await api.post(`/admin/owners/${ownerId}/decline/`);
  return res.data;
}

export async function listOwners() {
  const res = await api.get("/admin/owners/");
  return res.data.owners as Array<{
    id: string;
    username: string;
    email: string;
    full_name: string;
    phone: string;
    is_approved: boolean;
  }>;
}

export async function approveOwner(ownerId: string) {
  const res = await api.post(`/admin/owners/${ownerId}/approve/`);
  return res.data;
}


export type OwnerPitchStat = {
  pitch_id: string;
  name: string;
  revenue: string;
  bookings_count: number;
  is_approved: boolean;
  is_active: boolean;
};

// A merged, contiguous booking block for a pitch today — e.g. two
// back-to-back hourly bookings show as one 8:00 AM - 12:00 PM entry.
export type TodayBookingItem = {
  pitch_id: string;
  pitch_name: string;
  time_label: string;
  start_iso: string;
  end_iso: string;
  booked_by: string;
};

// A free (unbooked, not-yet-past) window today within a pitch's open hours.
export type TodayFreePitchItem = {
  pitch_id: string;
  pitch_name: string;
  time_label: string;
  start_iso: string;
  end_iso: string;
};

export type OwnerStats = {
  total_pitches: number;
  active_pitches: number;
  pending_pitches: number;
  total_revenue: string;
  total_bookings: number;
  pitch_stats: OwnerPitchStat[];
  today_bookings: TodayBookingItem[];
  today_free: TodayFreePitchItem[];
};

export type OwnerPitchDetailStats = {
  pitch: Pitch;
  earnings_week: string;
  earnings_month: string;
  earnings_year: string;
  bookings_1m: number;
  bookings_3m: number;
  bookings_6m: number;
  bookings_1y: number;
  total_bookings: number;
  total_earnings: string;
};

export async function getOwnerStats() {
  const res = await api.get("/pitches/owner/stats/");
  return res.data as OwnerStats;
}

export async function getOwnerPitchStats(pitchId: string) {
  const res = await api.get(`/pitches/${pitchId}/owner-stats/`);
  return res.data as OwnerPitchDetailStats;
}


export type AdminPitchStat = {
  pitch_id: string;
  name: string;
  sport_type: SportType;
  owner_username: string;
  tenant_name: string;
  revenue: string;
  bookings_count: number;
  is_approved: boolean;
  is_active: boolean;
};

export type AdminOwnerStat = {
  owner_id: string;
  username: string;
  email: string;
  is_approved: boolean;
  pitch_count: number;
  revenue: string;
};

export type AdminStats = {
  total_owners: number;
  approved_owners: number;
  pending_owners: number;
  total_pitches: number;
  approved_pitches: number;
  pending_pitches: number;
  active_pitches: number;
  football_pitches: number;
  basketball_pitches: number;
  total_bookings: number;
  total_revenue: string;
  pitch_stats: AdminPitchStat[];
  owner_stats: AdminOwnerStat[];
};

export async function getAdminStats() {
  const res = await api.get("/admin/stats/");
  return res.data as AdminStats;
}

export async function deleteAdminPitch(pitchId: string) {
  const res = await api.delete(`/admin/pitches/${pitchId}/delete/`);
  return res.data;
}

export async function deleteAdminOwner(ownerId: string) {
  const res = await api.delete(`/admin/owners/${ownerId}/delete/`);
  return res.data;
}



export type BookedByInfo = {
  type: "individual" | "manual";
  name: string;
  first_name: string;
  last_name: string;
  username: string;
  email: string | null;
  phone: string | null;
};

export type BookingHistoryEntry = {
  id: string;
  kind: "booking" | "manual";
  start_iso: string;
  end_iso: string;
  time_label: string;
  booking_type: string | null;
  total_price: string | null;
  status: string;
  notes: string;
  booked_by: BookedByInfo;
};

export type BookingHistoryResponse = {
  results: BookingHistoryEntry[];
  page: number;
  total_pages: number;
  total_count: number;
};

export async function getPitchBookingHistory(pitchId: string, page: number = 1) {
  const res = await api.get(`/pitches/${pitchId}/booking-history/`, { params: { page } });
  return res.data as BookingHistoryResponse;
}

/** One historical/manual booking entered at pitch setup or edit time.
 *  Append `JSON.stringify(list of these)` to the FormData under the key
 *  "already_booked_slots" before calling createPitch/updatePitch. */
export type AlreadyBookedSlotInput = {
  date: string; // YYYY-MM-DD
  start_hour: number;
  end_hour: number;
  name: string;
  phone: string;
};