import { api } from "./api";

export type PaymentMode = "not_configured" | "gateway" | "manual_bank";
export type GatewayProvider = "chapa" | "santimpay" | "arifpay";
export type SupportedBank =
  | "cbe" | "boa" | "telebirr" | "mpesa" | "cbebirr"
  | "dashen" | "awash" | "siinqee" | "kaafiebirr" | "zemen";

export const SUPPORTED_BANKS: { value: SupportedBank; label: string }[] = [
  { value: "cbe", label: "Commercial Bank of Ethiopia" },
  { value: "boa", label: "Bank of Abyssinia" },
  { value: "telebirr", label: "Telebirr" },
  { value: "mpesa", label: "M-Pesa" },
  { value: "cbebirr", label: "CBE Birr" },
  { value: "dashen", label: "Dashen Bank" },
  { value: "awash", label: "Awash Bank" },
  { value: "siinqee", label: "Siinqee Bank" },
  { value: "kaafiebirr", label: "Kaafi eBirr" },
  { value: "zemen", label: "Zemen Bank (not supported for verification)" },
];

export const GATEWAY_PROVIDERS: { value: GatewayProvider; label: string }[] = [
  { value: "chapa", label: "Chapa" },
  { value: "santimpay", label: "SantimPay" },
  { value: "arifpay", label: "ArifPay" },
];

export interface PaymentProfile {
  id: string;
  payment_mode: PaymentMode;
  gateway_provider: GatewayProvider | "";
  configured_at: string | null;
}

export interface OwnerBankAccount {
  id: string;
  bank: SupportedBank;
  account_holder_name: string;
  account_number: string;
  phone_number: string;
  is_active: boolean;
  created_at: string;
}

export async function getOwnerPaymentProfile(ownerId: string): Promise<PaymentProfile | null> {
  const res = await api.get(`/payment/owners/${ownerId}/profile/`);
  return res.data;
}

export async function configureOwnerPaymentProfile(
  ownerId: string,
  payload: { payment_mode: PaymentMode; gateway_provider?: GatewayProvider | ""; gateway_merchant_ref?: string }
): Promise<PaymentProfile> {
  const res = await api.put(`/payment/owners/${ownerId}/profile/`, payload);
  return res.data;
}

export async function getOwnerBankAccounts(ownerId: string): Promise<OwnerBankAccount[]> {
  const res = await api.get(`/payment/owners/${ownerId}/bank-accounts/`);
  return res.data;
}

export async function addOwnerBankAccount(
  ownerId: string,
  payload: { bank: SupportedBank; account_holder_name: string; account_number?: string; phone_number?: string }
): Promise<OwnerBankAccount> {
  const res = await api.post(`/payment/owners/${ownerId}/bank-accounts/`, payload);
  return res.data;
}

export async function deactivateOwnerBankAccount(ownerId: string, accountId: string): Promise<OwnerBankAccount> {
  const res = await api.post(`/payment/owners/${ownerId}/bank-accounts/${accountId}/deactivate/`);
  return res.data;
}