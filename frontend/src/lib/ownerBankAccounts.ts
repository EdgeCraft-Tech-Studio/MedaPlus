import { api } from "./api";
import type { OwnerBankAccount, SupportedBank } from "./paymentAdmin";

export interface BankAccountPayload {
  bank: SupportedBank;
  account_holder_name: string;
  account_number: string;
  phone_number: string;
}

export async function getMyBankAccounts(): Promise<OwnerBankAccount[]> {
  const res = await api.get("/payment/my/bank-accounts/");
  return res.data;
}

export async function addMyBankAccount(payload: BankAccountPayload): Promise<OwnerBankAccount> {
  const res = await api.post("/payment/my/bank-accounts/", payload);
  return res.data;
}

export async function updateMyBankAccount(
  accountId: string,
  payload: BankAccountPayload
): Promise<OwnerBankAccount> {
  const res = await api.patch(`/payment/my/bank-accounts/${accountId}/`, payload);
  return res.data;
}

export async function setMyBankAccountActive(
  accountId: string,
  isActive: boolean
): Promise<OwnerBankAccount> {
  const res = await api.post(`/payment/my/bank-accounts/${accountId}/active/`, { is_active: isActive });
  return res.data;
}

export async function deleteMyBankAccount(accountId: string): Promise<void> {
  await api.delete(`/payment/my/bank-accounts/${accountId}/`);
}