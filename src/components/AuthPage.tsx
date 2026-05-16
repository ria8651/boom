import "./AuthPage.css";

const ERROR_MESSAGES: Record<string, string> = {
  not_allowed: "You don't have access to boom. Ask the admin to grant it on bastion.",
  auth_failed: "Authentication failed. Please try again.",
};

export default function AuthPage() {
  const params = new URLSearchParams(window.location.search);
  const errorCode = params.get("error");
  const error = errorCode ? ERROR_MESSAGES[errorCode] ?? "An unknown error occurred." : "";

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
        <hr />
        {error && (
          <p role="alert" className="error-banner error-banner--inline">
            {error}
          </p>
        )}
        <a href="/api/auth/login" className="auth-signin-btn">
          Sign in
        </a>
      </article>
    </main>
  );
}
