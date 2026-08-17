import { api } from "./api";

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
  // Same photos as image_urls, but each tagged with its PitchImage id so the
  // edit form can tell the backend exactly which one to delete.
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
    profile_photo: string | null; // ⚠️ backend must add this field
  }>;
}

export async function declineOwner(ownerId: string) {
  
  const res = await api.post(`/admin/owners/${ownerId}/decline/`);
  return res.data;
}

export async function listOwners() {
  const res = await api.get("/admin/owners/");
  return res.data.owners as Array<{ id: string; username: string; email: string; is_approved: boolean }>;
}

export async function approveOwner(ownerId: string) {
  const res = await api.post(`/admin/owners/${ownerId}/approve/`);
  return res.data;
}