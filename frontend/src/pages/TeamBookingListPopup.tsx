import { useEffect, useState } from "react";
import styles from "./css/TeamBookingListPopup.module.css";
import { getMyActiveTeamBookings, type TeamBookingListItem } from "../lib/teamBooking";
import ShimmerRows from "./ShimmerRows";
import TeamAvatar from "./TeamAvatar";

interface Props {
  onClose: () => void;
  onSelect: (requestId: string) => void;
}


function CloseIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" {...props}>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
function InboxIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <path d="M4 12l3-7h10l3 7M4 12v6a1 1 0 001 1h14a1 1 0 001-1v-6M4 12h5a1 1 0 001 .8l.6 1.2a1 1 0 001 .8h.8a1 1 0 001-.8l.6-1.2a1 1 0 011-.8h5" />
    </svg>
  );
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "Awaiting responses", color: "#0f7a52", bg: "#e7f4ee" },
  expired: { label: "Needs your decision", color: "#b45309", bg: "#fef3e2" },
  payment_pending: { label: "Payment in progress", color: "#4f46e5", bg: "#eef2ff" },
};

export default function TeamBookingListPopup({ onClose, onSelect }: Props) {
  const [items, setItems] = useState<TeamBookingListItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await getMyActiveTeamBookings();
        if (!cancelled) setItems(data);
      } catch {
        if (!cancelled) setItems([]);
      }
    }
    load();
    const interval = setInterval(load, 8000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <div className={styles.card} onMouseDown={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
          <CloseIcon />
        </button>

        <div className={styles.title}>Team Bookings</div>
        <div className={styles.subtitle}>Live status across every team you own.</div>

                {items === null && <ShimmerRows count={4} height={64} />}

        {items !== null && items.length === 0 && (
          <div className={styles.empty}>
            <InboxIcon className={styles.emptyIcon} />
            <span>No active team bookings right now.</span>
          </div>
        )}

        {items !== null && items.length > 0 && (
          <div className={styles.list}>
            {items.map((item) => {
              const meta = STATUS_META[item.status] ?? STATUS_META.pending;
              return (
                <button key={item.id} className={styles.row} onClick={() => onSelect(item.id)}>
                  <TeamAvatar
                    src={item.team_logo}
                    name={item.team_name}
                    className={styles.avatar}
                    fallbackClassName={styles.avatarFallbackText}
                  />
                  <div className={styles.rowText}>
                    <div className={styles.rowName}>{item.team_name}</div>
                    <div className={styles.rowSub}>{item.pitch_name}</div>
                  </div>
                  <div className={styles.rowRight}>
                    <span
                      className={styles.statusPill}
                      style={{ color: meta.color, background: meta.bg }}
                    >
                      {meta.label}
                    </span>
                    <span className={styles.countText}>
                      {item.confirmed_count}/{item.total_count} confirmed
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}