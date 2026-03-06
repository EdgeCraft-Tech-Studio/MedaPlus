import React from "react";

type Props = {
  open: boolean;
  title?: string;
  children: React.ReactNode;
  onClose: () => void;
};

export default function Modal({ open, title, children, onClose }: Props) {
  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 9999,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(920px, 100%)",
          background: "white",
          borderRadius: 16,
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "16px 18px",
            borderBottom: "1px solid #eee",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 18 }}>{title ?? "Modal"}</div>
          <button
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: 18,
              padding: 6,
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div style={{ padding: 18 }}>{children}</div>
      </div>
    </div>
  );
}
