import { api } from "./api";

export interface PendingTeamBookingConfirmation {
  id: string;
  request_id: string;
  pitch_name: string;
  team_name: string;
  selections: { start_iso: string; end_iso: string }[];
  price_per_member: string;
  expires_at: string;
}

export async function getPendingTeamBookingConfirmation(): Promise<PendingTeamBookingConfirmation | null> {
  const res = await api.get("/bookings/team-request/pending-confirmation/");
  return res.data;
}

export async function confirmTeamBooking(requestId: string): Promise<{ status: string }> {
  const res = await api.post(`/bookings/team-request/${requestId}/confirm/`);
  return res.data;
}

export async function declineTeamBooking(requestId: string): Promise<{ status: string }> {
  const res = await api.post(`/bookings/team-request/${requestId}/decline/`);
  return res.data;
}


export interface PendingOwnerAction {
  type: "confirm_summary" | "payment_timeout";
  request_id: string;
  pitch_name: string;
  team_name: string;
  price_per_member: string;
  confirmed_count?: number;
  total_count?: number;
  declined_members?: { id: string; name: string; profile_photo_url: string | null }[];
  unpaid_members?: { id: string; name: string; profile_photo_url: string | null }[];
  paid_count?: number;
}


export interface PendingPayment {
  id: string;
  request_id: string;
  pitch_name: string;
  team_name: string;
  amount: string;
  payment_expires_at: string;
}

export async function getPendingOwnerAction(): Promise<PendingOwnerAction | null> {
  const res = await api.get("/bookings/team-request/pending-owner-action/");
  return res.data;
}

export type ConfirmSummaryAction = "cover" | "recalculate" | "open_slot" | "cancel";

export async function resolveConfirmSummary(
  requestId: string,
  action: ConfirmSummaryAction
): Promise<{ unavailable: boolean; cancelled: boolean; pitch_id?: string }> {
  const res = await api.post(`/bookings/team-request/${requestId}/resolve-confirm-summary/`, {
    action,
  });
  return res.data;
}
export async function getPendingPayment(): Promise<PendingPayment | null> {
  const res = await api.get("/bookings/team-request/pending-payment/");
  return res.data;
}

export async function payForBooking(requestId: string): Promise<{ status: string }> {
  const res = await api.post(`/bookings/team-request/${requestId}/pay/`);
  return res.data;
}

export type PaymentTimeoutAction = "remind" | "cover" | "recalculate" | "cancel";

export async function resolvePaymentTimeout(
  requestId: string,
  action: PaymentTimeoutAction
): Promise<{ unavailable: boolean; cancelled: boolean; pitch_id?: string; booking_code?: string }> {
  const res = await api.post(`/bookings/team-request/${requestId}/resolve-payment-timeout/`, { action });
  return res.data;
}


export interface TeamBookingListItem {
  id: string;
  team_id: string;
  team_name: string;
  team_logo: string | null;
  pitch_name: string;
  status: "pending" | "expired" | "payment_pending";
  confirmed_count: number;
  total_count: number;
  created_at: string;
  expires_at: string;
}

export interface TeamBookingMemberStatus {
  id: string;
  name: string;
  profile_photo_url: string | null;
}

export interface TeamBookingLiveDetail {
  id: string;
  team_id: string;
  team_name: string;
  team_logo: string | null;
  pitch_id: string;
  pitch_name: string;
  booking_type: string;
  selections: { start_iso: string; end_iso: string }[];
  status: "pending" | "expired" | "payment_pending" | "booked" | "unavailable" | "cancelled";
  price_per_member: string;
  total_price: string;
  expires_at: string;
  payment_expires_at: string | null;
  payment_round: number;
  final_booking_code: string;
  confirmed_members: TeamBookingMemberStatus[];
  declined_members: TeamBookingMemberStatus[];
  pending_members: TeamBookingMemberStatus[];
  paid_members: TeamBookingMemberStatus[];
  unpaid_members: TeamBookingMemberStatus[];
}


export async function getMyActiveTeamBookings(): Promise<TeamBookingListItem[]> {
  const res = await api.get("/bookings/team-request/my-active/");
  return res.data;
}

export async function getTeamBookingLiveDetail(requestId: string): Promise<TeamBookingLiveDetail> {
  const res = await api.get(`/bookings/team-request/${requestId}/live/`);
  return res.data;
}


export interface ConfirmationDetail {
  id: string;
  request_id: string;
  pitch_name: string;
  team_name: string;
  selections: { start_iso: string; end_iso: string }[];
  price_per_member: string;
  expires_at: string;
  can_respond: boolean;
  my_status: "pending" | "confirmed" | "declined";
}

export interface PaymentDetail {
  id: string;
  request_id: string;
  pitch_name: string;
  team_name: string;
  amount: string;
  payment_expires_at: string;
  can_pay: boolean;
  my_status: "pending" | "paid" | "covered_by_owner" | "excluded";
}

export async function getMyConfirmationDetail(requestId: string): Promise<ConfirmationDetail> {
  const res = await api.get(`/bookings/team-request/${requestId}/my-confirmation/`);
  return res.data;
}

export async function getMyPaymentDetail(requestId: string): Promise<PaymentDetail> {
  const res = await api.get(`/bookings/team-request/${requestId}/my-payment/`);
  return res.data;
}


export interface BookedPitchSummary {
  request_id: string;
  pitch_name: string;
  team_name: string;
  selections: { start_iso: string; end_iso: string }[];
  total_price: string;
  final_booking_code: string;
  is_owner_or_admin: boolean;
  paid_count: number;
  total_count: number;
  paid_members: { id: string; name: string; profile_photo_url: string | null }[];
}

export async function getBookedPitchSummary(requestId: string): Promise<BookedPitchSummary> {
  const res = await api.get(`/bookings/team-request/${requestId}/booked-summary/`);
  return res.data;
}