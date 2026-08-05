/**
 * The shell's global notification region.
 *
 * It is always in the document — an assistive technology only announces
 * additions to a live region that already existed — and stays empty until
 * something is published.
 *
 * Each notification is a CoreUI alert. Dismissal is the portal's own button
 * rather than the alert's built-in close, because the notification list is
 * owned by the shell: an alert that hid itself locally would leave a record
 * behind that the region still believes is on screen.
 */

import { CAlert, CButton } from "@coreui/react";
import { useNotifications } from "../shared/notifications";

const ALERT_COLOUR = {
  info: "info",
  success: "success",
  warning: "warning",
} as const;

export function NotificationRegion() {
  const { notifications, dismiss } = useNotifications();

  if (notifications.length === 0) {
    // The region still exists for assistive technology; it simply has nothing
    // in it, and it takes up no space in the page's layout.
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label="Portal notifications"
        data-testid="notification-region"
      />
    );
  }

  return (
    <div
      className="d-flex flex-column gap-2"
      role="status"
      aria-live="polite"
      aria-label="Portal notifications"
      data-testid="notification-region"
    >
      {notifications.map((notification) => (
        <CAlert
          key={notification.id}
          color={ALERT_COLOUR[notification.tone]}
          className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-0"
        >
          <span>{notification.message}</span>
          <CButton
            type="button"
            color="secondary"
            variant="outline"
            size="sm"
            onClick={() => {
              dismiss(notification.id);
            }}
          >
            Dismiss
          </CButton>
        </CAlert>
      ))}
    </div>
  );
}
