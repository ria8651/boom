interface ErrorBannerProps {
  message: string;
  onDismiss: () => void;
  variant?: "inline" | "toast";
}

function AlertIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
      <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
    </svg>
  );
}

export default function ErrorBanner({ message, onDismiss, variant }: ErrorBannerProps) {
  const variantClass = variant ? ` error-banner--${variant}` : "";
  return (
    <div className={`error-banner${variantClass}`} role="alert">
      <span className="error-banner-text">
        <AlertIcon />
        {message}
      </span>
      <button onClick={onDismiss} aria-label="Dismiss error">
        &times;
      </button>
    </div>
  );
}
