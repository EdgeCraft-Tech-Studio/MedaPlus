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
        width: 56,
        height: 56,
        borderRadius: "50%",
        border: "none",
        cursor: "pointer",
        background: "#3bdc4a",
        color: "white",
        fontSize: 34,
        lineHeight: "56px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
      }}
    >
      +
    </button>
  );
}
