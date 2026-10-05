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
  payload: {
    bank: string;
    screenshot: File;
    reference_number: string;
    account_suffix?: string;
    phone_number?: string;
  }
): Promise<PaymentTransaction> {
  const form = new FormData();
  form.append("bank", payload.bank);
  form.append("screenshot", payload.screenshot);
  form.append("reference_number", payload.reference_number);
  if (payload.account_suffix) form.append("account_suffix", payload.account_suffix);
  if (payload.phone_number) form.append("phone_number", payload.phone_number);

  const res = await api.post(
    `/payment/team-booking-payments/${teamBookingPaymentId}/pay/`,
    form,
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

export async function submitSoloBookingPayment(holdId: string, payload: {
  bank: string; screenshot: File; reference_number: string; account_suffix?: string; phone_number?: string;
}): Promise<PaymentTransaction> {
  const form = new FormData();
  form.append("bank", payload.bank);
  form.append("screenshot", payload.screenshot);
  form.append("reference_number", payload.reference_number);
  if (payload.account_suffix) form.append("account_suffix", payload.account_suffix);
  if (payload.phone_number) form.append("phone_number", payload.phone_number);
  const res = await api.post(`/payment/solo-bookings/${holdId}/pay/`, form, { headers: { "Content-Type": "multipart/form-data" } });
  return res.data;
}