import { api } from "./api";

export type Pitch = {
  id: string;
  tenant_id?: string | null;
  tenant_name?: string | null;

  name: string;
  address: string;
  latitude: number;
  longitude: number;

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

  is_approved: boolean;
  is_active: boolean;
};

export async function listPitches() {
  const res = await api.get("/pitches/");
  return res.data.pitches as Pitch[];
}

export async function createPitch(payload: FormData) {
  const res = await api.post("/pitches/", payload, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return res.data.pitch as Pitch;
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
  return res.data.pending_owners as Array<{ id: string; username: string; email: string }>;
}

export async function listOwners() {
  const res = await api.get("/admin/owners/");
  return res.data.owners as Array<{ id: string; username: string; email: string; is_approved: boolean }>;
}

export async function approveOwner(ownerId: string) {
  const res = await api.post(`/admin/owners/${ownerId}/approve/`);
  return res.data;
}
