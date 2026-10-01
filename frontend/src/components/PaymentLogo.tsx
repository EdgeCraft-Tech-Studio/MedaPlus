import { useState } from "react";

interface Props {
  name: string;
  label: string;
  size?: number;
  className?: string;
}

export default function PaymentLogo({ name, label, size = 40, className }: Props) {
  const [failed, setFailed] = useState(false);
  const initials = label.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() || "?";

  return (
    <div
      className={className}
      style={{
        width: size, height: size, borderRadius: "50%", overflow: "hidden",
        display: "grid", placeItems: "center", background: "#fff",
        border: "1.5px solid #e6e8eb", flexShrink: 0, boxShadow: "0 2px 6px rgba(20,24,29,0.06)",
      }}
    >
      {!failed ? (
        <img
          src={`/payment_logos/${name}.png`}
          alt={label}
          style={{ width: "72%", height: "72%", objectFit: "contain" }}
          onError={() => setFailed(true)}
        />
      ) : (
        <span style={{ fontSize: size * 0.32, fontWeight: 800, color: "#9aa1ab" }}>{initials}</span>
      )}
    </div>
  );
}