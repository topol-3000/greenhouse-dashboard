/**
 * The deliberate empty, loading and error panels.
 *
 * Every one of them is a real, named state of this screen. A blank region is
 * never an acceptable outcome, so each of these says what happened and, where
 * the user can act, offers the action.
 */

import type { ReactNode } from "react";

interface MessagePanelProps {
  title: string;
  children?: ReactNode;
  onRetry?: (() => void) | undefined;
  /**
   * What this button retries. The header banner already owns a plain "Retry",
   * so a panel names its own resource rather than putting a second identically
   * labelled control on the page.
   */
  retryLabel?: string;
  retrying?: boolean;
  tone?: "neutral" | "error";
}

export function MessagePanel({
  title,
  children,
  onRetry,
  retryLabel = "Retry",
  retrying = false,
  tone = "neutral",
}: MessagePanelProps) {
  return (
    <div className={`panel panel--${tone}`}>
      <h3 className="panel__title">{title}</h3>
      {children ? <p className="panel__body">{children}</p> : null}
      {onRetry ? (
        <button type="button" className="button" onClick={onRetry} disabled={retrying}>
          {retrying ? "Retrying…" : retryLabel}
        </button>
      ) : null}
    </div>
  );
}

/** The loading placeholder, announced rather than drawn as a silent skeleton. */
export function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="panel" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span className="panel__body">{label}</span>
    </div>
  );
}
