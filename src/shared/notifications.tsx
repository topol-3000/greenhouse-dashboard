/**
 * The portal's global notification channel.
 *
 * One region, owned by the shell, that any feature can publish to without
 * threading callbacks through the tree. Notifications are dismissed by the
 * user rather than by a timer: an operational message that disappears on its
 * own is a message an operator can miss.
 */

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

export type NotificationTone = "info" | "success" | "warning";

export interface Notification {
  readonly id: string;
  readonly tone: NotificationTone;
  readonly message: string;
}

export interface NotificationsApi {
  readonly notifications: readonly Notification[];
  /** Publish a notification and return its id. */
  readonly notify: (tone: NotificationTone, message: string) => string;
  readonly dismiss: (id: string) => void;
}

const NotificationsContext = createContext<NotificationsApi | null>(null);

let nextId = 0;

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<readonly Notification[]>([]);

  const notify = useCallback((tone: NotificationTone, message: string) => {
    nextId += 1;
    const id = `notification-${String(nextId)}`;
    setNotifications((current) => [...current, { id, tone, message }]);
    return id;
  }, []);

  const dismiss = useCallback((id: string) => {
    setNotifications((current) => current.filter((notification) => notification.id !== id));
  }, []);

  const value = useMemo<NotificationsApi>(
    () => ({ notifications, notify, dismiss }),
    [notifications, notify, dismiss],
  );

  return <NotificationsContext value={value}>{children}</NotificationsContext>;
}

/**
 * Read the notification channel.
 *
 * @returns The channel.
 * @throws {Error} When used outside {@link NotificationsProvider}, which is a
 *   wiring mistake rather than a runtime condition to render around.
 */
export function useNotifications(): NotificationsApi {
  const value = useContext(NotificationsContext);
  if (value === null) {
    throw new Error("useNotifications must be used inside a NotificationsProvider.");
  }
  return value;
}
