/**
 * The connectivity and staleness indicator in the application header.
 *
 * It reports one of three things and never guesses: data is current, data is
 * the last successful snapshot and the newest refresh failed, or nothing could
 * be loaded at all.
 */

export type ConnectionTone = "live" | "stale" | "error" | "loading";

interface StatusBannerProps {
  tone: ConnectionTone;
  message: string;
  /** Rendered when the user can do something about the state. */
  onRetry?: (() => void) | undefined;
  retrying?: boolean;
}

const TONE_LABEL: Record<ConnectionTone, string> = {
  live: "Live",
  stale: "Stale",
  error: "Offline",
  loading: "Connecting",
};

export function StatusBanner({ tone, message, onRetry, retrying = false }: StatusBannerProps) {
  return (
    <div className={`status-banner status-banner--${tone}`} role="status" aria-live="polite">
      <span className="status-banner__dot" aria-hidden="true" />
      <span className="status-banner__label">{TONE_LABEL[tone]}</span>
      <span className="status-banner__message">{message}</span>
      {onRetry ? (
        <button
          type="button"
          className="button button--inline"
          onClick={onRetry}
          disabled={retrying}
        >
          {retrying ? "Retrying…" : "Retry"}
        </button>
      ) : null}
    </div>
  );
}
