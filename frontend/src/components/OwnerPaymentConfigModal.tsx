import { useEffect, useState } from "react";
import styles from "../pages/css/OwnerPaymentConfigModal.module.css";
import PaymentLogo from "./PaymentLogo";
import {
  getOwnerPaymentProfile, configureOwnerPaymentProfile,
  getOwnerBankAccounts, addOwnerBankAccount, deactivateOwnerBankAccount,
  SUPPORTED_BANKS, GATEWAY_PROVIDERS,
  type OwnerBankAccount, type GatewayProvider, type SupportedBank,
} from "../lib/paymentAdmin";
import { showToast } from "../pages/Toast";

interface Props {
  ownerId: string;
  ownerName: string;
  onClose: () => void;
}

// Mirrors backend models.py's WALLET_BANKS constant exactly — these
// three identify the owner's receiving account by phone, everything
// else by account number. Keep this in sync if that set ever changes.
const WALLET_BANKS: SupportedBank[] = ["telebirr", "mpesa", "cbebirr"];

function CloseIcon(props: React.SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" {...props}><path d="M18 6L6 18M6 6l12 12" /></svg>;
}
function CheckIcon(props: React.SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" {...props}><path d="M20 6L9 17l-5-5" /></svg>;
}
function TrashIcon(props: React.SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14" /><path d="M10 11v6M14 11v6" /></svg>;
}
function ShieldIcon(props: React.SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}><path d="M12 3l7 3v6c0 4.6-3 8-7 9-4-1-7-4.4-7-9V6l7-3z" /></svg>;
}
function SpinnerIcon(props: React.SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" {...props}><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="42 100" /></svg>;
}

type Tab = "eligible" | "accounts";

export default function OwnerPaymentConfigModal({ ownerId, ownerName, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("eligible");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [provider, setProvider] = useState<GatewayProvider | "">("");
  const [merchantRef, setMerchantRef] = useState("");
  const [accounts, setAccounts] = useState<OwnerBankAccount[]>([]);
  const [newBank, setNewBank] = useState<SupportedBank>("cbe");
  const [newHolder, setNewHolder] = useState("");
  const [newValue, setNewValue] = useState("");
  const [addingAccount, setAddingAccount] = useState(false);

  const isWallet = WALLET_BANKS.includes(newBank);
  const selectedBankLabel = SUPPORTED_BANKS.find((b) => b.value === newBank)?.label || newBank.toUpperCase();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [profile, accts] = await Promise.all([
          getOwnerPaymentProfile(ownerId),
          getOwnerBankAccounts(ownerId),
        ]);
        if (cancelled) return;
        if (profile?.gateway_provider) setProvider(profile.gateway_provider);
        setAccounts(accts);
      } catch {
        showToast("Couldn't load payment setup.", "delete");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [ownerId]);

  async function saveProvider(p: GatewayProvider) {
    setProvider(p);
  }

  async function confirmProvider() {
    if (!provider) return;
    setSaving(true);
    try {
      await configureOwnerPaymentProfile(ownerId, {
        payment_mode: "gateway",
        gateway_provider: provider,
        gateway_merchant_ref: merchantRef.trim(),
      });
      showToast("Payment provider configured.", "update");
    } catch (err: any) {
      showToast(err?.response?.data?.detail || "Couldn't save.", "delete");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddAccount() {
    if (!newHolder.trim()) {
      showToast("Enter the full name.", "delete");
      return;
    }
    if (!newValue.trim()) {
      showToast(isWallet ? "Enter the phone number." : `Enter the ${selectedBankLabel} account number.`, "delete");
      return;
    }
    setAddingAccount(true);
    try {
      const account = await addOwnerBankAccount(ownerId, {
        bank: newBank,
        account_holder_name: newHolder.trim(),
        account_number: isWallet ? "" : newValue.trim(),
        phone_number: isWallet ? newValue.trim() : "",
      });
      setAccounts((prev) => [...prev, account]);
      setNewHolder(""); setNewValue("");
      showToast("Account added.", "create");
      // Adding a real account is the signal this owner uses manual
      // bank transfer — keep the backend mode in sync automatically.
      configureOwnerPaymentProfile(ownerId, { payment_mode: "manual_bank" }).catch(() => {});
    } catch (err: any) {
      showToast(err?.response?.data?.detail || "Couldn't add this account.", "delete");
    } finally {
      setAddingAccount(false);
    }
  }

  async function handleDeactivate(accountId: string) {
    try {
      await deactivateOwnerBankAccount(ownerId, accountId);
      setAccounts((prev) => prev.filter((a) => a.id !== accountId));
      showToast("Account removed.", "delete");
    } catch {
      showToast("Couldn't remove this account.", "delete");
    }
  }

  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <div className={styles.card} onMouseDown={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close"><CloseIcon /></button>
        <div className={styles.title}>Payment setup</div>
        <div className={styles.subtitle}>{ownerName}</div>

        <div className={styles.tabBar}>
          <button className={`${styles.tabBtn} ${tab === "eligible" ? styles.tabBtnActive : ""}`} onClick={() => setTab("eligible")}>
            Eligible
          </button>
          <button className={`${styles.tabBtn} ${tab === "accounts" ? styles.tabBtnActive : ""}`} onClick={() => setTab("accounts")}>
            Bank Accounts/ Wallet
          </button>
          <div className={styles.tabSlider} style={{ transform: tab === "accounts" ? "translateX(100%)" : "translateX(0)" }} />
        </div>

        {loading ? (
          <div className={styles.loadingWrap}><SpinnerIcon className={styles.spinnerLarge} /></div>
        ) : tab === "eligible" ? (
          <div className={styles.panel}>
            <div className={styles.eligibleBanner}>
              <ShieldIcon className={styles.eligibleBannerIcon} />
              Eligible for Payment
            </div>

            <div className={styles.providerList}>
              {GATEWAY_PROVIDERS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  className={`${styles.providerRow} ${provider === p.value ? styles.providerRowActive : ""}`}
                  onClick={() => saveProvider(p.value)}
                >
                  <PaymentLogo name={p.value} label={p.label} size={42} />
                  <span className={styles.providerName}>{p.label}</span>
                  {provider === p.value && <CheckIcon className={styles.providerCheck} />}
                </button>
              ))}
            </div>

            {provider && (
              <div className={styles.expandPanel}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Merchant reference (from {GATEWAY_PROVIDERS.find((p) => p.value === provider)?.label})</span>
                  <input
                    type="text" className={styles.input}
                    value={merchantRef} onChange={(e) => setMerchantRef(e.target.value)}
                    placeholder="e.g. merchant ID or account ref"
                  />
                </label>
                <div className={styles.note}>
                  Checkout via this provider isn't live yet — this saves the config for when it is.
                </div>
                <button className={styles.saveBtn} onClick={confirmProvider} disabled={saving}>
                  {saving ? <SpinnerIcon className={styles.spinner} /> : "Save Provider"}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className={styles.panel}>
            {accounts.length === 0 && <div className={styles.emptyNote}>No accounts added yet.</div>}

            <div className={styles.accountList}>
              {accounts.map((a) => (
                <div key={a.id} className={styles.accountRow}>
                  <PaymentLogo name={a.bank} label={a.bank} size={40} />
                  <div className={styles.accountInfo}>
                    <div className={styles.accountBank}>{SUPPORTED_BANKS.find((b) => b.value === a.bank)?.label || a.bank}</div>
                    <div className={styles.accountDetail}>{a.account_holder_name}</div>
                    <div className={styles.accountDetail}>{a.phone_number || a.account_number}</div>
                  </div>
                  <button className={styles.trashBtn} onClick={() => handleDeactivate(a.id)} title="Remove">
                    <TrashIcon />
                  </button>
                </div>
              ))}
            </div>

            <div className={styles.addAccountBox}>
              <div className={styles.sectionLabel}>Add a bank / wallet</div>

              <div className={styles.bankPicker}>
                {SUPPORTED_BANKS.filter((b) => b.value !== "zemen").map((b) => (
                  <button
                    key={b.value}
                    type="button"
                    className={`${styles.bankChip} ${newBank === b.value ? styles.bankChipActive : ""}`}
                    onClick={() => { setNewBank(b.value); setNewValue(""); }}
                  >
                    <PaymentLogo name={b.value} label={b.label} size={28} />
                  </button>
                ))}
              </div>

              <input
                className={styles.input} placeholder="Account holder full name (exactly as the bank shows it)"
                value={newHolder} onChange={(e) => setNewHolder(e.target.value)}
              />
              <input
                className={styles.input}
                placeholder={isWallet ? `${selectedBankLabel} phone number` : `${selectedBankLabel} account number`}
                value={newValue} onChange={(e) => setNewValue(e.target.value)}
              />

              <button className={styles.saveBtn} onClick={handleAddAccount} disabled={addingAccount}>
                {addingAccount ? <SpinnerIcon className={styles.spinner} /> : "Add Account"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}