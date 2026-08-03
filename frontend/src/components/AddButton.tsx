type Props = {
  onClick: () => void;
  title?: string;
};

export default function AddButton({ onClick, title = "Add Pitch" }: Props) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        height: 42,
        padding: "0 18px",
        borderRadius: 10,
        border: "none",
        cursor: "pointer",
        background: "#111111",
        color: "#ffffff",
        fontSize: 13,
        fontWeight: 300,
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        transition: "all 0.2s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "#000000";
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "#111111";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <span style={{ fontSize: 20, lineHeight: 1 }}>+</span>
      {title}
    </button>
  );
}