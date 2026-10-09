import { api } from "./api";

export type PaymentMode = "not_configured" | "gateway" | "manual_bank";

export interface BankRequirement {
  bank: string;
  label: string;
  supported: boolean;
  requires_account_suffix: boolean;
  account_suffix_length: number | null;
  account_suffix_help: string;
  requires_phone_number: boolean;
  phone_number_help: string;
}

export interface OwnerBankAccount {
  id: string;
  bank: string;
  account_holder_name: string;
  account_number: string;
  phone_number: string;
  is_active: boolean;
  created_at: string;
  requirements: BankRequirement;
}

export interface PaymentInfo {
  payment_mode: PaymentMode;
  bank_accounts: OwnerBankAccount[];
  amount_due?: string;
}

export interface ExtractedReceiptData {
  raw_text: string;
  suggested_bank: string;
  suggested_reference_number: string;
  other_candidates: string[];
  confidence: "high" | "medium" | "low" | "none";
}

export type PaymentTxnStatus =
  | "pending" | "processing" | "verified" | "rejected" | "needs_review" | "expired";

export interface PaymentTransaction {
  id: string;
  booking_id: string | null;
  status: PaymentTxnStatus;
  payment_mode: PaymentMode;
  bank: string;
  reference_number: string;
  amount_expected: string;
  verified_amount: string | null;
  verified_transaction_at: string | null;
  rejection_reason: string;
  submitted_at: string;
  processed_at: string | null;
}

/** What the payer sends. `bank` = the bank / wallet they paid FROM,
 *  `pay_to_bank` = which of the pitch owner's accounts they paid INTO. */
export interface SubmitPaymentPayload {
  bank: string;
  pay_to_bank?: string;
  screenshot: File;
  reference_number: string;
  /** The payer's FULL account number (CBE / BOA). The server keeps only the digits it needs. */
  sender_account_number?: string;
  phone_number?: string;
}

function buildPaymentForm(payload: SubmitPaymentPayload): FormData {
  const form = new FormData();
  form.append("bank", payload.bank);
  if (payload.pay_to_bank) form.append("pay_to_bank", payload.pay_to_bank);
  form.append("screenshot", payload.screenshot);
  form.append("reference_number", payload.reference_number);
  if (payload.sender_account_number) form.append("sender_account_number", payload.sender_account_number);
  if (payload.phone_number) form.append("phone_number", payload.phone_number);
  return form;
}

export async function getTeamBookingPaymentInfo(teamBookingPaymentId: string): Promise<PaymentInfo> {
  const res = await api.get(`/payment/team-booking-payments/${teamBookingPaymentId}/payment-info/`);
  return res.data;
}

export async function extractReceiptData(screenshot: File, bankHint?: string): Promise<ExtractedReceiptData> {
  const form = new FormData();
  form.append("screenshot", screenshot);
  if (bankHint) form.append("bank_hint", bankHint);
  const res = await api.post("/payment/extract-receipt-data/", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

export async function submitTeamBookingPayment(
  teamBookingPaymentId: string,
  payload: SubmitPaymentPayload
): Promise<PaymentTransaction> {
  const res = await api.post(
    `/payment/team-booking-payments/${teamBookingPaymentId}/pay/`,
    buildPaymentForm(payload),
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return res.data;
}

export async function pollPaymentTransaction(transactionId: string): Promise<PaymentTransaction> {
  const res = await api.post(`/payment/transactions/${transactionId}/poll/`);
  return res.data;
}

export async function getSoloBookingPaymentInfo(holdId: string): Promise<PaymentInfo> {
  const res = await api.get(`/payment/solo-bookings/${holdId}/payment-info/`);
  return res.data;
}

export async function submitSoloBookingPayment(
  holdId: string,
  payload: SubmitPaymentPayload
): Promise<PaymentTransaction> {
  const res = await api.post(`/payment/solo-bookings/${holdId}/pay/`, buildPaymentForm(payload), {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

export interface PaymentCompletionInfo {
  transaction_id: string;
  kind: "solo" | "team" | "booking";
  pitch_name: string;
  team_name?: string;
  when_label: string;
  amount: string;
}

export async function getPendingPaymentCompletion(): Promise<PaymentCompletionInfo | null> {
  const res = await api.get("/payment/transactions/pending-completion/");
  return res.data;
}

export async function acknowledgePaymentCompletion(transactionId: string): Promise<void> {
  await api.post(`/payment/transactions/${transactionId}/acknowledge-completion/`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Pitch owner: "Payment Detail" table
// ─────────────────────────────────────────────────────────────────────────────

export type OwnerPaymentStatus = "verified" | "needs_review" | "rejected";
export type OwnerPaymentFilter = "all" | OwnerPaymentStatus;

export interface OwnerPaymentRow {
  id: string;
  status: OwnerPaymentStatus;
  kind: "solo" | "team" | "booking";
  team_name: string;
  payer_first_name: string;
  payer_last_name: string;
  payer_phone: string;
  amount: string;
  sender_bank: string;
  pay_to_bank: string;
  reference_number: string;
  paid_at: string | null;
  submitted_at: string;
  review_reason: string;
}

export interface OwnerPaymentPage {
  results: OwnerPaymentRow[];
  total: number;
  page: number;
  page_size: number;
  counts: Record<OwnerPaymentStatus, number>;
}

export async function getPitchPayments(
  pitchId: string | number,
  params: { status?: OwnerPaymentFilter; page?: number } = {}
): Promise<OwnerPaymentPage> {
  const res = await api.get(`/payment/pitches/${pitchId}/transactions/`, {
    params: { status: params.status ?? "all", page: params.page ?? 1 },
  });
  return res.data;
}

/** Approve / reject a payment that is waiting for review. */
export async function ownerReviewPayment(
  transactionId: string,
  action: "approve" | "reject"
): Promise<OwnerPaymentRow> {
  const res = await api.post(`/payment/transactions/${transactionId}/owner-review/`, { action });
  return res.data;
}

/** Turn a VERIFIED payment into REJECTED. Needs the owner's own password. */
export async function ownerRejectVerifiedPayment(
  transactionId: string,
  password: string
): Promise<OwnerPaymentRow> {
  const res = await api.post(`/payment/transactions/${transactionId}/owner-reject-verified/`, { password });
  return res.data;
}

/** Banks whose account digits we already remember for this player (no need to ask again). */
export async function getMySavedSenderBanks(): Promise<string[]> {
  const res = await api.get("/payment/my-saved-banks/");
  return res.data?.banks ?? [];
}