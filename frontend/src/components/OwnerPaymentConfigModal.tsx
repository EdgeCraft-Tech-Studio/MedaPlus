import { useEffect, useMemo, useState } from "react";
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

// Mirrors backend WALLET_BANKS: these identify the account by phone number.
const WALLET_BANKS: SupportedBank[] = ["telebirr", "mpesa", "cbebirr"];
const SELECTABLE_BANKS = SUPPORTED_BANKS.filter((b) => b.value !== "zemen");

const bankLabel = (bank: string) => SUPPORTED_BANKS.find((b) => b.value === bank)?.label || bank;
const identifierOf = (a: OwnerBankAccount) => a.phone_number || a.account_number;

function errMsg(err: any, fallback: string): string {
  const d = err?.response?.data?.detail;
  if (Array.isArray(d)) return d[0] || fallback;
  return typeof d === "string" && d ? d : fallback;
}

function CloseIcon(props: React.SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" {...props}><path d="M18 6L6 18M6 6l12 12" /></svg>;
}
function CheckIcon(props: React.SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M20 6L9 17l-5-5" /></svg>;
}
function TrashIcon(props: React.SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14" /><path d="M10 11v6M14 11v6" /></svg>;
}
function PlusIcon(props: React.SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" {...props}><path d="M12 5v14M5 12h14" /></svg>;
}
function ShieldIcon(props: React.SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" {...props}><path d="M12 3l7 3v6c0 4.6-3 8-7 9-4-1-7-4.4-7-9V6l7-3z" /></svg>;
}
function SpinnerIcon(props: React.SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" {...props}><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="42 100" /></svg>;
}

/* ───────────────── Add account popup ───────────────── */

function AddAccountModal({
  ownerId, defaultBank, onClose, onAdded,
}: {
  ownerId: string;
  defaultBank: SupportedBank;
  onClose: () => void;
  onAdded: (a: OwnerBankAccount) => void;
}) {
  const [bank, setBank] = useState<SupportedBank>(defaultBank);
  const [holder, setHolder] = useState("");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const isWallet = WALLET_BANKS.includes(bank);

  function onBankChange(next: SupportedBank) {
    if (WALLET_BANKS.includes(next) !== isWallet) setValue(""); // phone <-> account number
    setBank(next);
  }

  async function save() {
    if (holder.trim().split(/\s+/).length < 2) {
      showToast("Enter the full account holder name (at least two words).", "delete");
      return;
    }
    if (!value.trim()) {
      showToast(isWallet ? "Enter the phone number." : "Enter the account number.", "delete");
      return;
    }
    setSaving(true);
    try {
      const account = await addOwnerBankAccount(ownerId, {
        bank,
        account_holder_name: holder.trim(),
        account_number: isWallet ? "" : value.trim(),
        phone_number: isWallet ? value.trim() : "",
      });
      onAdded(account);
      showToast("Account added.", "create");
      // Adding a real account means this owner uses manual bank transfer.
      configureOwnerPaymentProfile(ownerId, { payment_mode: "manual_bank" }).catch(() => {});
      onClose();
    } catch (err) {
      showToast(errMsg(err, "Couldn't add this account."), "delete");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.subOverlay} onMouseDown={onClose}>
      <div className={styles.subModal} onMouseDown={(e) => e.stopPropagation()}>
        <button className={styles.subClose} onClick={onClose} aria-label="Close"><CloseIcon width={16} height={16} /></button>

        <div className={styles.subLogo}>
          <PaymentLogo key={bank} name={bank} label={bankLabel(bank)} size={76} />
        </div>
        <div className={styles.subTitle}>Add account</div>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Bank / Wallet</span>
          <div className={styles.selectWrap}>
            <select className={styles.select} value={bank} onChange={(e) => onBankChange(e.target.value as SupportedBank)}>
              {SELECTABLE_BANKS.map((b) => (
                <option key={b.value} value={b.value}>{b.label}</option>
              ))}
            </select>
            <svg className={styles.selectChevron} viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Account holder name</span>
          <input className={styles.input} value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="Full name exactly as the bank shows it" />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>{isWallet ? "Phone number" : "Account number"}</span>
          <input
            className={styles.input}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode={isWallet ? "tel" : "numeric"}
            placeholder={isWallet ? `${bankLabel(bank)} phone number` : `${bankLabel(bank)} account number`}
          />
        </label>

        <button className={styles.saveBtn} onClick={save} disabled={saving}>
          {saving ? <SpinnerIcon className={styles.spinner} /> : "Add account"}
        </button>
      </div>
    </div>
  );
}

/* ───────────────── Delete confirm popup ───────────────── */

function ConfirmDeleteModal({
  account, busy, onCancel, onConfirm,
}: {
  account: OwnerBankAccount;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className={styles.subOverlay} onMouseDown={onCancel}>
      <div className={`${styles.subModal} ${styles.confirmModal}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.subLogo}>
          <PaymentLogo name={account.bank} label={bankLabel(account.bank)} size={56} />
        </div>
        <div className={styles.subTitle}>Remove this account?</div>
        <p className={styles.confirmText}>
          <b>{bankLabel(account.bank)}</b> ({identifierOf(account)}) will be removed from this owner.
          Players will no longer be able to pay into it.
        </p>
        <div className={styles.confirmActions}>
          <button className={styles.cancelBtn} onClick={onCancel} disabled={busy}>No</button>
          <button className={styles.dangerBtn} onClick={onConfirm} disabled={busy}>
            {busy ? <SpinnerIcon className={styles.spinner} /> : "Yes, remove"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Main modal ───────────────────────── */

type Tab = "eligible" | "accounts";

export default function OwnerPaymentConfigModal({ ownerId, ownerName, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("accounts");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [provider, setProvider] = useState<GatewayProvider | "">("");
  const [merchantRef, setMerchantRef] = useState("");
  const [accounts, setAccounts] = useState<OwnerBankAccount[]>([]);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<OwnerBankAccount | null>(null);
  const [deleting, setDeleting] = useState(false);

  const initial = (ownerName || "?").trim()[0]?.toUpperCase() || "?";

  // pre-select a bank this owner does not have yet
  const defaultBank = useMemo<SupportedBank>(() => {
    const taken = new Set(accounts.map((a) => a.bank));
    return (SELECTABLE_BANKS.find((b) => !taken.has(b.value))?.value ?? "cbe") as SupportedBank;
  }, [accounts]);

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
    } catch (err) {
      showToast(errMsg(err, "Couldn't save."), "delete");
    } finally {
      setSaving(false);
    }
  }

  function onAdded(account: OwnerBankAccount) {
    // adding a bank the owner already has updates it, so replace instead of duplicating
    setAccounts((prev) =>
      prev.some((a) => a.id === account.id)
        ? prev.map((a) => (a.id === account.id ? account : a))
        : [...prev, account]
    );
  }

  async function doDelete(account: OwnerBankAccount) {
    setDeleting(true);
    try {
      await deactivateOwnerBankAccount(ownerId, account.id);
      setAccounts((prev) => prev.filter((a) => a.id !== account.id));
      showToast("Account removed.", "delete");
    } catch {
      showToast("Couldn't remove this account.", "delete");
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  }

  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <div className={styles.card} onMouseDown={(e) => e.stopPropagation()}>
        {/* ── hero header with the pitch owner name ── */}
        <div className={styles.hero}>
          <div className={styles.heroPattern} />
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close"><CloseIcon /></button>
          <div className={styles.heroAvatar}>{initial}</div>
          <div className={styles.heroText}>
            <div className={styles.heroLabel}>Payment setup</div>
            <div className={styles.heroName} title={ownerName}>{ownerName}</div>
            <div className={styles.heroRole}>Pitch owner</div>
          </div>
        </div>

        <div className={styles.body}>
          <div className={styles.tabBar}>
            <button className={`${styles.tabBtn} ${tab === "accounts" ? styles.tabBtnActive : ""}`} onClick={() => setTab("accounts")}>
              Bank Accounts / Wallet
            </button>
            <button className={`${styles.tabBtn} ${tab === "eligible" ? styles.tabBtnActive : ""}`} onClick={() => setTab("eligible")}>
              Eligible
            </button>
            <div className={styles.tabSlider} style={{ transform: tab === "eligible" ? "translateX(100%)" : "translateX(0)" }} />
          </div>

          {loading ? (
            <div className={styles.loadingWrap}><SpinnerIcon className={styles.spinnerLarge} /></div>
          ) : tab === "accounts" ? (
            <div className={styles.panel}>
              <div className={styles.accountsHead}>
                <div>
                  <div className={styles.panelTitle}>Payment accounts</div>
                  <div className={styles.panelSub}>Banks &amp; wallets players can pay into</div>
                </div>
                <button type="button" className={styles.addBtn} onClick={() => setAdding(true)}>
                  <PlusIcon width={16} height={16} /> Add account
                </button>
              </div>

              {accounts.length === 0 ? (
                <div className={styles.empty}>No accounts added yet. Click “Add account” to create the first one.</div>
              ) : (
                <div className={styles.grid}>
                  {accounts.map((a, i) => (
                    <div key={a.id} className={styles.acard} style={{ animationDelay: `${i * 50}ms` }}>
                      <div className={styles.logoWrap}>
                        <PaymentLogo name={a.bank} label={bankLabel(a.bank)} size={56} />
                      </div>
                      <div className={styles.bankName}>{bankLabel(a.bank)}</div>
                      <div className={styles.holder} title={a.account_holder_name}>{a.account_holder_name}</div>
                      <div className={styles.number}>{identifierOf(a)}</div>
                      <button
                        className={styles.deleteBtn}
                        onClick={() => setConfirmDelete(a)}
                        title="Remove account"
                        aria-label="Remove account"
                      >
                        <TrashIcon width={15} height={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
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
                    onClick={() => setProvider(p.value)}
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
                    <span className={styles.fieldLabel}>
                      Merchant reference (from {GATEWAY_PROVIDERS.find((p) => p.value === provider)?.label})
                    </span>
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
          )}
        </div>
      </div>

      {adding && (
        <AddAccountModal ownerId={ownerId} defaultBank={defaultBank} onClose={() => setAdding(false)} onAdded={onAdded} />
      )}
      {confirmDelete && (
        <ConfirmDeleteModal
          account={confirmDelete}
          busy={deleting}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => doDelete(confirmDelete)}
        />
      )}
    </div>
  );
}