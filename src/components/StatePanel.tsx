/**
 * The portal's deliberate loading, empty and error states.
 *
 * Every one of them is a real, named state of a screen. A blank region is never
 * an acceptable outcome, so each panel says what happened in words and, where
 * the user can act, offers the action. Tone adds colour to that text; it never
 * carries the meaning on its own.
 */

import type { ReactNode } from "react";

export type PanelTone = "neutral" | "warning" | "error";

interface StatePanelProps {
  title: string;
  children?: ReactNode;
  tone?: PanelTone;
  /** An optional action, such as rechecking a failed request. */
  action?: ReactNode;
  /** Heading level, so a panel never breaks the page's heading order. */
  headingLevel?: 2 | 3;
}

export function StatePanel({
  title,
  children,
  tone = "neutral",
  action,
  headingLevel = 3,
}: StatePanelProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className={`panel panel--${tone}`}>
      <Heading className="panel__title">{title}</Heading>
      {children ? <div className="panel__body">{children}</div> : null}
      {action}
    </div>
  );
}

/** The loading placeholder, announced rather than drawn as a silent skeleton. */
export function LoadingState({ label }: { label: string }) {
  return (
    <p className="loading" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </p>
  );
}
