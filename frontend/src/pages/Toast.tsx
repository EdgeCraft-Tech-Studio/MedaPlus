import { useEffect, useState } from "react";
import styles from "./css/Toast.module.css";

/* ============================================================
   TYPES
   ============================================================ */

export type ToastType = "create" | "update" | "delete";

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
}

/* ============================================================
   STORE — a tiny module-level pub/sub, no context/provider needed.
   Call showToast(...) from anywhere. Mount <ToastContainer /> once.
   ============================================================ */

let toasts: ToastItem[] = [];
let listeners: Array<(items: ToastItem[]) => void> = [];

function notify() {
  listeners.forEach((listener) => listener(toasts));
}

/**
 * Fire a toast from anywhere in the app.
 *
 * @param message  Text to show
 * @param type     "create" -> green, "update" -> yellow, "delete" -> red
 * @param duration How long (ms) the toast stays before it disappears. Default 4200ms.
 */
export function showToast(message: string, type: ToastType = "create", duration = 5200) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  toasts = [...toasts, { id, message, type, duration }];
  notify();
  return id;
}

export function dismissToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  notify();
}

function subscribe(listener: (items: ToastItem[]) => void) {
  listeners.push(listener);
  listener(toasts);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

/* ============================================================
   ICONS
   ============================================================ */

function CheckCircleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.3 2.3L16 10" />
    </svg>
  );
}

function EditIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M4 20h4L18.5 9.5a2.1 2.1 0 000-3L18 6a2.1 2.1 0 00-3 0L4.5 16.5 4 20z" />
      <path d="M13.5 7.5l3 3" />
    </svg>
  );
}

function TrashIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0l1 13a1 1 0 001 1h6a1 1 0 001-1l1-13" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function CloseIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

const TYPE_CONFIG: Record<ToastType, { icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactElement; className: string }> = {
  create: { icon: CheckCircleIcon, className: styles.toastCreate },
  update: { icon: EditIcon, className: styles.toastUpdate },
  delete: { icon: TrashIcon, className: styles.toastDelete },
};

/* ============================================================
   SINGLE TOAST — owns its own lifespan timer, independent of others
   ============================================================ */

function Toast({ item }: { item: ToastItem }) {
  const [exiting, setExiting] = useState(false);
  const config = TYPE_CONFIG[item.type];
  const Icon = config.icon;

  useEffect(() => {
    const lifeTimer = setTimeout(() => setExiting(true), item.duration);
    return () => clearTimeout(lifeTimer);
  }, [item.duration]);

  useEffect(() => {
    if (!exiting) return;
    const removeTimer = setTimeout(() => dismissToast(item.id), 260);
    return () => clearTimeout(removeTimer);
  }, [exiting, item.id]);

  function handleClose() {
    setExiting(true);
  }

  return (
    <div
      className={`${styles.toast} ${config.className} ${exiting ? styles.toastExiting : styles.toastEntering}`}
    >
      <div className={styles.toastIconWrap}>
        <Icon className={styles.toastIcon} />
      </div>

      <div className={styles.toastMessage}>{item.message}</div>

      <button className={styles.toastClose} onClick={handleClose} aria-label="Dismiss">
        <CloseIcon className={styles.toastCloseIcon} />
      </button>

      {!exiting && (
        <div
          className={styles.toastProgress}
          style={{ animationDuration: `${item.duration}ms` }}
        />
      )}
    </div>
  );
}

/* ============================================================
   CONTAINER — mount this ONCE near the root of your app
   ============================================================ */

export default function ToastContainer() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    return subscribe(setItems);
  }, []);

  if (items.length === 0) return null;

  return (
    <div className={styles.toastContainer}>
      {items.map((item) => (
        <Toast key={item.id} item={item} />
      ))}
    </div>
  );
}
