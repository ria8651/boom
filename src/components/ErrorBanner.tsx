interface ErrorBannerProps {
  message: string;
  onDismiss: () => void;
}

export default function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  return (
    <div style={styles.banner} role="alert">
      <span>{message}</span>
      <button style={styles.dismiss} onClick={onDismiss} aria-label="Dismiss error">
        &times;
      </button>
    </div>
  );
}

const styles = {
  banner: {
    background: "rgb(50, 50, 50)",
    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
    padding: "0.5rem 1rem",
    color: "#f91f31",
    fontSize: "0.875rem",
    fontFamily: "'Open Sans', system-ui, sans-serif",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.75rem",
  } as const,
  dismiss: {
    background: "none",
    border: "none",
    color: "rgb(150, 150, 150)",
    fontSize: "1.25rem",
    cursor: "pointer",
    padding: 0,
    lineHeight: 1,
    flexShrink: 0,
  } as const,
};
