/**
 * The portal's deliberate loading, empty, note and error states.
 *
 * Every one of them is a real, named state of a screen. A blank region is never
 * an acceptable outcome, so each panel says what happened in words and, where
 * the user can act, offers the action. Tone adds colour to that text; it never
 * carries the meaning on its own.
 *
 * The tone decides which CoreUI component says it. A neutral state is a
 * `CCallout` — a quiet block that nests inside the card it usually appears in.
 * A warning or an error is a `CAlert`, because that is what an alert is for,
 * and it is the same component a customer sees for every other warning in the
 * portal.
 */

import { CAlert, CCallout, CSpinner } from "@coreui/react";
import type { ReactNode } from "react";

export type PanelTone = "neutral" | "warning" | "error";

const ALERT_COLOUR = {
  warning: "warning",
  error: "danger",
} as const;

interface StatePanelProps {
  title: string;
  children?: ReactNode;
  tone?: PanelTone;
  /** An optional action, such as rechecking a failed request. */
  action?: ReactNode;
  /** Heading level, so a panel never breaks the page's heading order. */
  headingLevel?: 2 | 3 | 4;
  /**
   * Announce the panel to assistive technology. A failure the user did not ask
   * for is an `alert`; a state they navigated to announces itself by being the
   * page, and passing nothing is right.
   */
  role?: "alert" | "status";
  /** Test hook, so a state can be identified without matching on its prose. */
  testId?: string;
}

export function StatePanel({
  title,
  children,
  tone = "neutral",
  action,
  headingLevel = 3,
  role,
  testId,
}: StatePanelProps) {
  const Heading = headingLevel === 2 ? "h2" : headingLevel === 4 ? "h4" : "h3";
  const body = (
    <>
      <Heading className="h6 mb-0">{title}</Heading>
      {children ? <div className="d-flex flex-column gap-2">{children}</div> : null}
      {action}
    </>
  );

  // `CAlert` publishes `role="alert"` of its own. A state the customer walked
  // to is not an interruption, so the role is passed through explicitly —
  // including as `undefined`, which removes it.
  const shared = {
    role,
    ...(testId ? { "data-testid": testId } : {}),
  };

  if (tone === "neutral") {
    // A callout rather than a card: a named state often sits inside a card
    // already, and a box inside a box reads as two regions rather than one.
    return (
      <CCallout
        color="secondary"
        className="d-flex flex-column align-items-start gap-2 my-0"
        {...shared}
      >
        {body}
      </CCallout>
    );
  }

  return (
    <CAlert
      color={ALERT_COLOUR[tone]}
      className="d-flex flex-column align-items-start gap-2 mb-0"
      {...shared}
    >
      {body}
    </CAlert>
  );
}

/** The loading placeholder, announced rather than drawn as a silent skeleton. */
export function LoadingState({ label }: { label: string }) {
  return (
    <p className="d-flex align-items-center gap-2 text-body-secondary" role="status">
      {/*
        The spinner is decoration for a region that already announces itself, so
        CoreUI's own status role and hidden "Loading…" label are taken off it.
      */}
      <CSpinner as="span" size="sm" role={undefined} visuallyHiddenLabel="" aria-hidden="true" />
      <span>{label}</span>
    </p>
  );
}

interface NoteProps {
  children: ReactNode;
  /** A warning is an alert; a plain remark is quiet secondary text. */
  tone?: "neutral" | "warning";
  role?: "status";
  id?: string;
  testId?: string;
}

/**
 * A one-line remark beside something else on the page.
 *
 * Smaller than a {@link StatePanel} because it qualifies content that is
 * already on screen — a refresh in flight, a window that is bounded, a name the
 * configuration could not resolve — rather than standing in place of it.
 */
export function Note({ children, tone = "neutral", role, id, testId }: NoteProps) {
  const shared = {
    role,
    ...(id === undefined ? {} : { id }),
    ...(testId === undefined ? {} : { "data-testid": testId }),
  };

  if (tone === "warning") {
    return (
      <CAlert color="warning" className="mb-0 py-2 px-3 small" {...shared}>
        {children}
      </CAlert>
    );
  }

  return (
    <p className="small text-body-secondary" {...shared}>
      {children}
    </p>
  );
}
