import { useEffect, useRef, useState } from "react";
import styles from "./css/MemberPaymentPopup.module.css";
import {
  getTeamBookingPaymentInfo, extractReceiptData, submitTeamBookingPayment, pollPaymentTransaction,
  getSoloBookingPaymentInfo, submitSoloBookingPayment,
  type PaymentInfo, type OwnerBankAccount,
} from "../lib/payment";
import PaymentLogo from "../components/PaymentLogo";

interface PendingPaymentLike {
  id: string;
  request_id?: string;
  pitch_name: string;
  team_name?: string;
  amount: string;
  payment_expires_at: string;
}

interface Props {
  payment: PendingPaymentLike;
  kind?: "team" | "solo";
  onClose?: () => void;
  onPaid?: () => void;
  readOnly?: boolean;
  readOnlyStatusLabel?: string;
}

const REFERENCE_LABELS: Record<string, { label: string; placeholder: string }> = {
  cbe: { label: "CBE Transaction ID", placeholder: "e.g. FT26267712345" },
  boa: { label: "Transaction Reference", placeholder: "Reference number" },
  telebirr: { label: "Telebirr Transaction Number", placeholder: "e.g. ABCT1234567" },
  cbebirr: { label: "Transaction Number", placeholder: "Transaction number" },
  mpesa: { label: "Transaction Number", placeholder: "Transaction number" },
  dashen: { label: "Transaction Reference", placeholder: "Reference number" },
  awash: { label: "Transaction Reference", placeholder: "Reference number" },
  siinqee: { label: "Transaction Reference", placeholder: "Reference number" },
  kaafiebirr: { label: "Transaction Reference", placeholder: "Reference number" },
};
const DEFAULT_REF = { label: "Transaction Reference", placeholder: "Reference number" };

const REJECTION_MESSAGES: Record<string, string> = {
  sender_identity_mismatch: "The account number on this payment doesn't match yours. Make sure you're uploading your OWN payment, not someone else's.",
  no_result_from_provider: "We couldn't find a matching transaction. Double-check the reference and try again.",
  not_verified: "This transaction couldn't be verified. Please check the details and try again.",
  currency_mismatch: "This transaction wasn't in ETB.",
  receiver_mismatch: "This payment wasn't sent to the correct account. Double-check and try again.",
  amount_mismatch: "The amount paid doesn't match what's owed.",
  amount_unreadable: "We couldn't read the paid amount from this transaction.",
  transaction_date_mismatch: "This payment doesn't match the date of this booking.",
  timestamp_in_future: "This transaction's date looks incorrect.",
  duplicate_transaction: "This transaction reference has already been used.",
  provider_unreachable: "We couldn't reach the verification service. Please try again in a moment.",
};
function friendlyRejection(reason: string): string {
  if (REJECTION_MESSAGES[reason]) return REJECTION_MESSAGES[reason];
  if (reason.startsWith("provider_error_")) return "The verification service returned an error. Try again shortly.";
  return "This payment couldn't be verified. Please try again or contact support.";
}

function useCountdown(targetIso: string) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    function tick() { setRemaining(Math.max(0, new Date(targetIso).getTime() - Date.now())); }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetIso]);
  const s = Math.floor(remaining / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function CloseIcon(props: React.SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" {...props}><path d="M18 6L6 18M6 6l12 12" /></svg>;
}
function UploadIcon(props: React.SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}><path d="M12 16V4M7 9l5-5 5 5M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3" /></svg>;
}
function CheckCircleIcon(props: React.SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}><circle cx="12" cy="12" r="9" /><path d="M8.5 12.3l2.3 2.3 4.7-5" /></svg>;
}
function SpinnerIcon(props: React.SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" {...props}><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="42 100" /></svg>;
}
function NoGestureIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M8 21v-7.3a1.9 1.9 0 1 1 3.8 0V13" />
      <path d="M8 13V7.2a1.5 1.5 0 1 1 3 0V11" />
      <path d="M11 11V5.7a1.5 1.5 0 1 1 3 0V11" />
      <path d="M14 11V6.9a1.5 1.5 0 1 1 3 0V13a6 6 0 0 1-6 6h-1a5 5 0 0 1-4-2l-2.3-3a1.25 1.25 0 0 1 1.9-1.6L8 14" />
    </svg>
  );
}

type Step = "loading" | "no_config" | "gateway_unavailable" | "form" | "submitting" | "polling" | "verified" | "rejected" | "needs_review" | "timeout";

export default function MemberPaymentPopup({ payment, kind = "team", onClose, onPaid, readOnly = false, readOnlyStatusLabel }: Props) {
  const countdown = useCountdown(payment.payment_expires_at);
  const [step, setStep] = useState<Step>(readOnly ? "form" : "loading");
  const [info, setInfo] = useState<PaymentInfo | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<OwnerBankAccount | null>(null);
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string>("");
  const [scanning, setScanning] = useState(false);
  const [referenceNumber, setReferenceNumber] = useState("");
  const [refAutoFilled, setRefAutoFilled] = useState(false);
  const [refNeedsManual, setRefNeedsManual] = useState(false);
  const [accountSuffix, setAccountSuffix] = useState("");
  const [suffixInvalid, setSuffixInvalid] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [error, setError] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (readOnly) return;
    let cancelled = false;
    const fetchInfo = kind === "solo" ? getSoloBookingPaymentInfo(payment.id) : getTeamBookingPaymentInfo(payment.id);
    fetchInfo
      .then((data) => {
        if (cancelled) return;
        setInfo(data);
        if (data.payment_mode === "not_configured") setStep("no_config");
        else if (data.payment_mode === "gateway") setStep("gateway_unavailable");
        else {
          setStep("form");
          if (data.bank_accounts.length === 1) setSelectedAccount(data.bank_accounts[0]);
        }
      })
      .catch(() => !cancelled && setError("Couldn't load payment options. Please try again."));
    return () => { cancelled = true; };
  }, [payment.id, readOnly, kind]);

  useEffect(() => () => { if (pollTimer.current) clearInterval(pollTimer.current); }, []);

  async function handleFileSelected(file: File) {
    setScreenshotFile(file);
    setScreenshotPreview(URL.createObjectURL(file));
    setError("");
    setScanning(true);
    setRefAutoFilled(false);
    setRefNeedsManual(false);
    try {
      const result = await extractReceiptData(file, selectedAccount?.bank);
      if (result.suggested_reference_number) {
        setReferenceNumber(result.suggested_reference_number);
        setRefAutoFilled(true);
      } else {
        setRefNeedsManual(true);
      }
      if (!selectedAccount && result.suggested_bank && info) {
        const match = info.bank_accounts.find((a) => a.bank === result.suggested_bank);
        if (match) setSelectedAccount(match);
      }
    } catch (err: any) {
      setRefNeedsManual(true);
      if (err?.response?.status === 429) {
        setError("You've tried this too many times — please wait a minute before uploading again.");
      } else {
        setError("We couldn't scan this image automatically. Please type the transaction number below.");
      }
    } finally {
      setScanning(false);
    }
  }

  function startPolling(transactionId: string) {
    setStep("polling");
    let attempts = 0;
    pollTimer.current = setInterval(async () => {
      attempts += 1;
      try {
        const txn = await pollPaymentTransaction(transactionId);
        if (txn.status === "verified") { clearInterval(pollTimer.current!); setStep("verified"); }
        else if (txn.status === "rejected") { clearInterval(pollTimer.current!); setRejectionReason(txn.rejection_reason); setStep("rejected"); }
        else if (txn.status === "needs_review") { clearInterval(pollTimer.current!); setStep("needs_review"); }
        else if (attempts > 20) { clearInterval(pollTimer.current!); setStep("timeout"); }
      } catch { /* transient — keep polling */ }
    }, 3000);
  }

  async function handleSubmit() {
    if (!selectedAccount || !screenshotFile || !referenceNumber.trim()) {
      setError("Select a bank, upload the screenshot, and confirm the transaction number.");
      return;
    }
    const req = selectedAccount.requirements;
    if (req.requires_account_suffix && accountSuffix.length !== req.account_suffix_length) {
      setSuffixInvalid(true);
      setError(`Enter exactly ${req.account_suffix_length} digits for the account suffix.`);
      return;
    }
    setSuffixInvalid(false);
    if (req.requires_phone_number && !phoneNumber.trim()) {
      setError("Enter the phone number you paid from.");
      return;
    }

    setError("");
    setStep("submitting");
    try {
      const submitFn = kind === "solo" ? submitSoloBookingPayment : submitTeamBookingPayment;
      const txn = await submitFn(payment.id, {
        bank: selectedAccount.bank,
        screenshot: screenshotFile,
        reference_number: referenceNumber.trim(),
        account_suffix: accountSuffix,
        phone_number: phoneNumber,
      });
      if (txn.status === "verified") setStep("verified");
      else if (txn.status === "rejected") { setRejectionReason(txn.rejection_reason); setStep("rejected"); }
      else if (txn.status === "needs_review") setStep("needs_review");
      else startPolling(txn.id);
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Couldn't submit this payment. Please try again.");
      setStep("form");
    }
  }

  function retry() { setStep("form"); setError(""); }

  function handleDone() {
    onPaid?.();
    onClose?.();
  }

  const refMeta = selectedAccount ? (REFERENCE_LABELS[selectedAccount.bank] || DEFAULT_REF) : DEFAULT_REF;

  // ---------------- Clean, dedicated success screen — no leftover
  // "Pay for X" header, no countdown. The ONLY way this popup closes
  // is the user clicking Done, which calls BOTH onPaid and onClose,
  // guaranteeing every payment-related popup disappears together. ----------------
  if (step === "verified") {
    return (
      <div className={styles.overlay}>
        <div className={styles.card} role="alertdialog" aria-modal="true">
          <div className={styles.successBox}>
            <CheckCircleIcon className={styles.successIcon} />
            <div className={styles.successText}>Payment Completed! 🎉</div>
            <div className={styles.successSub}>
              Your spot at {payment.pitch_name} is booked. {payment.amount} Br paid.
            </div>
            <button className={styles.payBtn} onClick={handleDone}>
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.card} role="alertdialog" aria-modal="true">
        {!readOnly && <div className={styles.countdown}>{countdown}</div>}
        {onClose && readOnly && (
          <button className={styles.readOnlyClose} onClick={onClose} aria-label="Close"><CloseIcon /></button>
        )}

        {error && (
          <div className={styles.topErrorBanner}>
            <span className={styles.noNoBadge}><NoGestureIcon className={styles.noNoIcon} /></span>
            <span className={styles.topErrorText}>{error}</span>
            <button className={styles.topErrorClose} onClick={() => setError("")} aria-label="Dismiss">
              <CloseIcon />
            </button>
          </div>
        )}

        <div className={styles.titleRow}>
          <div className={styles.title}>Pay for {payment.pitch_name}</div>
        </div>
        <div className={styles.subtitle}>
          {payment.team_name || "Individual booking"} — {kind === "solo" ? "total" : "your share"}: <b className={styles.amountHighlight}>{payment.amount} Br</b>
        </div>

        {readOnly ? (
          <div className={styles.readOnlyBanner}>{readOnlyStatusLabel || "This payment window has closed."}</div>
        ) : (
          <>
            {step === "loading" && <div className={styles.loadingWrap}><SpinnerIcon className={styles.spinnerLarge} /></div>}

            {step === "no_config" && (
              <div className={styles.infoBox}>
                This pitch owner hasn't set up a way to receive payments yet. Please contact them directly.
              </div>
            )}

            {step === "gateway_unavailable" && (
              <div className={styles.infoBox}>
                Online checkout for this pitch isn't available yet. Please contact the pitch owner to arrange payment.
              </div>
            )}

            {step === "form" && info && (
              <div className={styles.form}>
                {info.bank_accounts.length > 1 && (
                  <div className={styles.accountPicker}>
                    {info.bank_accounts.map((acc) => (
                      <button
                        key={acc.id}
                        type="button"
                        className={`${styles.accountOption} ${selectedAccount?.id === acc.id ? styles.accountOptionActive : ""}`}
                        onClick={() => { setSelectedAccount(acc); setAccountSuffix(""); setPhoneNumber(""); }}
                      >
                        <PaymentLogo name={acc.bank} label={acc.requirements.label} size={30} />
                        <span>{acc.requirements.label}</span>
                      </button>
                    ))}
                  </div>
                )}

                {selectedAccount && (
                  <div className={styles.accountCard}>
                    <PaymentLogo name={selectedAccount.bank} label={selectedAccount.requirements.label} size={44} />
                    <div>
                      <div className={styles.accountCardBank}>{selectedAccount.requirements.label}</div>
                      <div className={styles.accountCardName}>{selectedAccount.account_holder_name}</div>
                      <div className={styles.accountCardNumber}>{selectedAccount.phone_number || selectedAccount.account_number}</div>
                    </div>
                  </div>
                )}

                {selectedAccount && (
                  <>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Upload payment screenshot</span>
                      <label className={styles.uploadBox}>
                        {screenshotPreview ? (
                          <div className={styles.previewWrap}>
                            <img src={screenshotPreview} alt="Receipt preview" className={styles.uploadPreview} />
                            {scanning && (
                              <div className={styles.scanOverlay}>
                                <div className={styles.scanLine} />
                                <span>Scanning receipt…</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <>
                            <UploadIcon className={styles.uploadIcon} />
                            <span>Tap to upload — we'll read it for you</span>
                          </>
                        )}
                        <input
                          type="file" accept="image/*" style={{ display: "none" }}
                          onChange={(e) => e.target.files?.[0] && handleFileSelected(e.target.files[0])}
                        />
                      </label>
                    </label>

                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>
                        {refMeta.label}
                        {refAutoFilled && !scanning && <span className={styles.ocrTag}><CheckCircleIcon className={styles.ocrTagIcon} /> Auto-detected</span>}
                      </span>
                      <input
                        type="text"
                        className={`${styles.input} ${refNeedsManual && !referenceNumber ? styles.inputNeedsAttention : ""}`}
                        value={referenceNumber}
                        onChange={(e) => {
                          setReferenceNumber(e.target.value.toUpperCase());
                          setRefAutoFilled(false);
                          setRefNeedsManual(false);
                        }}
                        placeholder={refMeta.placeholder}
                      />
                      {refNeedsManual && !referenceNumber && (
                        <span className={styles.manualHint}>
                          We couldn't read this automatically — please type it in from your screenshot.
                        </span>
                      )}
                    </label>

                    {selectedAccount.requirements.requires_account_suffix && (
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>Last {selectedAccount.requirements.account_suffix_length} digits of your account</span>
                        <input
                          type="text"
                          className={`${styles.input} ${suffixInvalid ? styles.inputNeedsAttention : ""}`}
                          inputMode="numeric"
                          maxLength={selectedAccount.requirements.account_suffix_length || undefined}
                          value={accountSuffix}
                          onChange={(e) => { setAccountSuffix(e.target.value.replace(/\D/g, "")); setSuffixInvalid(false); }}
                          placeholder={selectedAccount.requirements.account_suffix_help}
                        />
                        {suffixInvalid && (
                          <span className={styles.manualHint}>
                            እባክዎ የ{selectedAccount.requirements.label} መለያዎን የመጨረሻ {selectedAccount.requirements.account_suffix_length} ቁጥሮች ያስገቡ
                          </span>
                        )}
                      </label>
                    )}

                    {selectedAccount.requirements.requires_phone_number && (
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>Phone number you paid from</span>
                        <input
                          type="tel" className={styles.input}
                          value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)}
                          placeholder="09XXXXXXXX"
                        />
                      </label>
                    )}
                  </>
                )}

                <button className={styles.payBtn} onClick={handleSubmit} disabled={!selectedAccount}>
                  Submit Payment
                </button>
              </div>
            )}

            {(step === "submitting" || step === "polling") && (
              <div className={styles.loadingWrap}>
                <SpinnerIcon className={styles.spinnerLarge} />
                <div className={styles.processingText}>
                  {step === "submitting" ? "Submitting…" : "Verifying your payment — this usually takes a few seconds…"}
                </div>
              </div>
            )}

            {step === "rejected" && (
              <div className={styles.rejectBox}>
                <span className={styles.noNoBadge}><NoGestureIcon className={styles.noNoIcon} /></span>
                <div className={styles.rejectText}>{friendlyRejection(rejectionReason)}</div>
                <button className={styles.payBtn} onClick={retry}>Try Again</button>
              </div>
            )}

            {step === "needs_review" && (
              <div className={styles.infoBox}>
                We're double-checking this payment manually — you'll be notified once it's confirmed.
              </div>
            )}

            {step === "timeout" && (
              <div className={styles.rejectBox}>
                <span className={styles.noNoBadge}><NoGestureIcon className={styles.noNoIcon} /></span>
                <div className={styles.rejectText}>
                  We couldn't confirm this payment yet. Double-check the transaction number and screenshot, then try again.
                </div>
                <button className={styles.payBtn} onClick={retry}>Try Again</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}