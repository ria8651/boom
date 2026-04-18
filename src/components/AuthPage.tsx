import { useState } from "react";
import "./AuthPage.css";

const ERROR_MESSAGES: Record<string, string> = {
  not_allowed: "Your GitHub account is not on the allowed list. Contact the admin for access.",
  auth_failed: "GitHub authentication failed. Please try again.",
  missing_code: "Something went wrong during login. Please try again.",
};

const isDev = import.meta.env.DEV;

export default function AuthPage() {
  const params = new URLSearchParams(window.location.search);
  const errorCode = params.get("error");
  const error = errorCode ? ERROR_MESSAGES[errorCode] ?? "An unknown error occurred." : "";
  const [devName, setDevName] = useState("");

  return (
    <main className="page-wrapper">
      <article className="page-card auth-card">
        <header className="page-header">
          <div className="auth-header-text">
            <h1 className="page-title">boom</h1>
            <p className="page-subtitle">video conferencing</p>
          </div>
          <a
            href="https://bink.eu.org"
            target="_blank"
            rel="noopener noreferrer"
          >
            <img src="/banner-flat.svg" alt="Bink Studios" className="page-branding" />
          </a>
        </header>
        {error && (
          <p role="alert" className="error-banner error-banner--inline">
            {error}
          </p>
        )}
        <a href="/api/auth/github" className="auth-github-btn">
          <svg className="auth-github-icon" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          Sign in with GitHub
        </a>
        {isDev && (
          <form action="/api/auth/dev" method="get" className="auth-dev">
            <input
              type="text"
              name="user"
              placeholder="dev"
              value={devName}
              onChange={(e) => setDevName(e.target.value)}
              className="auth-dev-input"
            />
            <button type="submit" className="auth-dev-submit">
              continue in dev mode
            </button>
          </form>
        )}
      </article>
    </main>
  );
}
