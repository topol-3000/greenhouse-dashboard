/**
 * The shell's global notification region.
 *
 * It is always in the document — an assistive technology only announces
 * additions to a live region that already existed — and stays empty until
 * something is published.
 */

import { useNotifications } from "../shared/notifications";

export function NotificationRegion() {
  const { notifications, dismiss } = useNotifications();

  return (
    <div
      className="notifications"
      role="status"
      aria-live="polite"
      aria-label="Portal notifications"
      data-testid="notification-region"
    >
      {notifications.map((notification) => (
        <div key={notification.id} className={`notification notification--${notification.tone}`}>
          <p className="notification__message">{notification.message}</p>
          <button
            type="button"
            className="button button--inline"
            onClick={() => {
              dismiss(notification.id);
            }}
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}
