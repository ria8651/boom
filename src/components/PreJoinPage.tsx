import { useState } from "react";
import type { ConnectionDetails } from "../types/connection";

const styles = {
  wrapper: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    padding: "1rem",
  } as const,
  card: {
    width: "100%",
    maxWidth: "420px",
  } as const,
  title: {
    fontFamily: "'Chivo', sans-serif",
    fontSize: "2rem",
    fontWeight: 700,
    margin: "0 0 0.25rem 0",
    color: "rgb(231, 231, 231)",
  } as const,
  subtitle: {
    fontSize: "0.875rem",
    color: "rgb(150, 150, 150)",
    margin: 0,
  } as const,
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
  } as const,
  label: {
    display: "flex",
    flexDirection: "column",
    gap: "0.375rem",
    fontSize: "0.875rem",
    color: "rgb(190, 190, 190)",
  } as const,
  input: {
    background: "rgb(40, 40, 40)",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: "4px",
    padding: "0.625rem 0.75rem",
    color: "rgb(231, 231, 231)",
    fontSize: "0.9375rem",
    fontFamily: "'Open Sans', system-ui, sans-serif",
    outline: "none",
  } as const,
  button: {
    marginTop: "0.5rem",
    background: "#10c2ee",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    padding: "0.75rem",
    fontSize: "0.9375rem",
    fontFamily: "'Chivo', sans-serif",
    fontWeight: 600,
    cursor: "pointer",
  } as const,
  error: {
    color: "#f91f31",
    fontSize: "0.875rem",
    margin: 0,
  } as const,
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "1.5rem",
    paddingBottom: "1.5rem",
    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
  } as const,
  brandingLogo: {
    height: "4rem",
    opacity: 0.2,
    filter: "invert(1)",
    display: "block",
  } as const,
};

interface PreJoinPageProps {
  onJoin: (details: ConnectionDetails) => void;
  error: string;
  onError: (message: string) => void;
}

export default function PreJoinPage({ onJoin, error, onError }: PreJoinPageProps) {
  const [displayName, setDisplayName] = useState(
    () => localStorage.getItem("boom:displayName") ?? "",
  );
  const [room, setRoom] = useState(
    () => localStorage.getItem("boom:room") ?? "",
  );
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    onError("");
    setLoading(true);

    try {
      const res = await fetch("/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room,
          identity: displayName,
          password,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        if (res.status === 401) {
          onError("Incorrect password. Please try again.");
        } else if (res.status === 400) {
          onError(data?.error ?? "Missing required fields.");
        } else {
          onError(
            `Server error (${res.status}): ${data?.error ?? res.statusText}. ` +
            "Try again or check the server logs.",
          );
        }
        return;
      }

      const { token, serverUrl } = await res.json();
      localStorage.setItem("boom:displayName", displayName);
      localStorage.setItem("boom:room", room);
      onJoin({ serverUrl, token, password });
    } catch (err) {
      onError(
        "Could not reach the server. " +
        `Check your network connection and that the server is running. (${err instanceof Error ? err.message : String(err)})`,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.wrapper}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>boom</h1>
            <p style={styles.subtitle}>video conferencing</p>
          </div>
          <a
            href="https://bink.eu.org"
            target="_blank"
            rel="noopener noreferrer"
          >
            <img src="/banner-flat.svg" alt="Bink Studios" style={styles.brandingLogo} />
          </a>
        </div>
        <form style={styles.form} onSubmit={handleSubmit}>
          <label style={styles.label}>
            Display name
            <input
              style={styles.input}
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              autoFocus
            />
          </label>
          <label style={styles.label}>
            Room
            <input
              style={styles.input}
              type="text"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              required
            />
          </label>
          <label style={styles.label}>
            Password
            <input
              style={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && <p style={styles.error}>{error}</p>}
          <button style={styles.button} type="submit" disabled={loading}>
            {loading ? "Joining…" : "Join"}
          </button>
        </form>
      </div>
    </div>
  );
}
