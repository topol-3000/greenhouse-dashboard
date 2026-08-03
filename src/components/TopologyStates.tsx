/**
 * The states a topology screen can be in, said out loud.
 *
 * Unit 1 established that a blank region is never an acceptable outcome. These
 * compose its {@link StatePanel} into the states topology adds, and they keep
 * them distinguishable from one another:
 *
 * - **request failure** — the portal asked and did not get an answer. It is a
 *   state of one screen, never a full-page outage;
 * - **resource not found** — the address is a real portal route, but the cloud
 *   API has no such facility or zone. Visually inside the shell, and worded so
 *   it cannot be confused with the catch-all 404 for an address the portal does
 *   not publish at all;
 * - **relationship mismatch** — both resources exist, but the contract does not
 *   say one belongs to the other;
 * - **background refresh** and **failed background refresh** — the data on
 *   screen is still the last good answer, and it stays there.
 *
 * Messages come from the API boundary's normaliser, so nothing here can leak a
 * URL, a status body or a stack trace onto a screen.
 */

import { Link } from "react-router";
import { describeError } from "../api/errors";
import { GREENHOUSES_PATH } from "../routes/routes";
import { StatePanel } from "./StatePanel";

interface RequestErrorPanelProps {
  /** What the portal was trying to read, in the customer's words. */
  title: string;
  error: unknown;
  onRetry?: () => void;
  retrying?: boolean;
  headingLevel?: 2 | 3;
}

/** A request that failed, with a way to try it again. */
export function RequestErrorPanel({
  title,
  error,
  onRetry,
  retrying = false,
  headingLevel = 3,
}: RequestErrorPanelProps) {
  return (
    <StatePanel
      title={title}
      tone="error"
      role="alert"
      testId="request-error"
      headingLevel={headingLevel}
      {...(onRetry
        ? {
            action: (
              <button type="button" className="button" onClick={onRetry} disabled={retrying}>
                {retrying ? "Trying again…" : "Try again"}
              </button>
            ),
          }
        : {})}
    >
      <p>{describeError(error)}</p>
      <p className="panel__meta">
        The rest of the portal is unaffected — you can keep navigating while this is being retried.
      </p>
    </StatePanel>
  );
}

interface ResourceNotFoundPanelProps {
  /** The kind of resource, e.g. "facility". */
  resource: string;
  /** The identifier from the address, shown so a wrong link is recognisable. */
  identifier: string;
}

/**
 * A portal route that works, pointing at a resource the cloud API does not have.
 *
 * Distinct from the catch-all 404: that one says the *address* does not exist
 * in the portal, this one says the address is fine and the *resource* is not
 * there.
 */
export function ResourceNotFoundPanel({ resource, identifier }: ResourceNotFoundPanelProps) {
  return (
    <StatePanel
      title={`This ${resource} is not in the cloud API`}
      tone="warning"
      role="alert"
      testId="resource-not-found"
      headingLevel={2}
    >
      <p>
        The portal asked the cloud API for the {resource} <code>{identifier}</code> and it has no
        such record. It may have been removed, or the link may be for a different customer&rsquo;s
        cloud API.
      </p>
      <p>
        <Link to={GREENHOUSES_PATH}>Back to Greenhouses</Link>
      </p>
    </StatePanel>
  );
}

interface RelationshipMismatchPanelProps {
  /** Where the resource actually belongs, when the contract says. */
  correctPath?: string;
  zoneName: string;
}

/**
 * A control zone that exists, under a facility the contract does not put it in.
 *
 * The portal will not draw a zone inside a facility the API did not say it
 * belongs to, and it does not guess from the shape of the URL. Where the
 * contract does state the real parent, the way there is offered.
 */
export function RelationshipMismatchPanel({
  correctPath,
  zoneName,
}: RelationshipMismatchPanelProps) {
  return (
    <StatePanel
      title="This control zone belongs to a different facility"
      tone="warning"
      role="alert"
      testId="relationship-mismatch"
      headingLevel={2}
    >
      <p>
        The cloud API says {zoneName} is a control zone of another facility, so the portal will not
        show it under this one.
      </p>
      <p>
        {correctPath === undefined ? (
          <Link to={GREENHOUSES_PATH}>Back to Greenhouses</Link>
        ) : (
          <Link to={correctPath}>Open the facility this control zone belongs to</Link>
        )}
      </p>
    </StatePanel>
  );
}

/** A refresh running over data that is already on screen. */
export function BackgroundRefreshNotice() {
  return (
    <p className="inline-note" role="status" data-testid="background-refresh">
      Refreshing from the cloud API…
    </p>
  );
}

interface RefreshFailurePanelProps {
  error: unknown;
  onRetry: () => void;
  retrying?: boolean;
}

/**
 * A background refresh that failed while good data is still on screen.
 *
 * The cached topology is not thrown away — navigation keeps working and the
 * customer keeps seeing what the API last said. The only thing added is the
 * honest note that it may now be out of date.
 */
export function RefreshFailurePanel({
  error,
  onRetry,
  retrying = false,
}: RefreshFailurePanelProps) {
  return (
    <StatePanel
      title="Showing the last data the cloud API returned"
      tone="warning"
      role="status"
      testId="refresh-failure"
      action={
        <button type="button" className="button" onClick={onRetry} disabled={retrying}>
          {retrying ? "Trying again…" : "Try again"}
        </button>
      }
    >
      <p>
        The most recent refresh did not succeed, so this may be out of date. {describeError(error)}
      </p>
    </StatePanel>
  );
}

interface IncompleteCollectionNoticeProps {
  shown: number;
  total: number;
  /** Plural noun for the collection, e.g. "facilities". */
  noun: string;
}

/**
 * A collection the portal could not read to the end.
 *
 * The paginated walk is bounded, so an unusually large collection can end
 * before the backend's own `total` is reached. Rather than present a partial
 * list as the whole topology, the screen says how much of it this is.
 */
export function IncompleteCollectionNotice({
  shown,
  total,
  noun,
}: IncompleteCollectionNoticeProps) {
  return (
    <p
      className="inline-note inline-note--warning"
      role="status"
      data-testid="incomplete-collection"
    >
      Showing {shown} of the {total} {noun} the cloud API reports. This is not the complete list.
    </p>
  );
}
