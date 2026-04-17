import { useState } from "react";

interface GuestJoinPageProps {
  room: string;
  inviteToken: string;
  onJoin: (name: string, inviteToken: string) => Promise<void>;
  error: string;
}

export default function GuestJoinPage({ room, inviteToken, onJoin, error }: GuestJoinPageProps) {
  const [name, setName] = useState(
    () => localStorage.getItem("boom:displayName") ?? "",
  );
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      await onJoin(name.trim(), inviteToken);
      localStorage.setItem("boom:displayName", name.trim());
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-wrapper">
      <div className="page-card auth-card">
        <div className="page-header">
          <div style={{ textAlign: "left" }}>
            <h1 className="page-title">boom</h1>
            <p className="page-subtitle">video conferencing</p>
          </div>
          <a href="https://bink.eu.org" target="_blank" rel="noopener noreferrer">
            <img src="/banner-flat.svg" alt="Bink Studios" className="page-branding" />
          </a>
        </div>

        <p className="guest-join-room">
          You've been invited to join <strong>{room}</strong>
        </p>

        <form className="guest-join-form" onSubmit={handleSubmit}>
          <label className="field-label">
            Your name
            <input
              className="field-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              maxLength={64}
              required
              autoFocus
            />
          </label>
          {error && <p className="error-banner error-banner--inline">{error}</p>}
          <button className="auth-github-btn" type="submit" disabled={loading || !name.trim()}>
            {loading ? "Joining…" : "Join room"}
          </button>
        </form>
      </div>
    </div>
  );
}
