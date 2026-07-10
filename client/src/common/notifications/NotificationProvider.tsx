import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { NotificationContext, type AddNotificationInput } from "./NotificationContext";
import { generateNotificationId, loadNotifications, saveNotifications } from "./NotificationService";
import { defaultSoundForCategory, playNotificationSound } from "./NotificationSound";
import type { AppNotification, NotificationCategory } from "./types";

const PRIORITY_ICON = {
  high: "warning",
  medium: "info",
  low: "success",
} as const;

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  // Load this user's notification history when they log in / switch accounts.
  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }
    setNotifications(loadNotifications(user.user_id));
  }, [user?.user_id]);

  const persist = useCallback(
    (next: AppNotification[]) => {
      if (!user) return;
      saveNotifications(user.user_id, next);
    },
    [user?.user_id],
  );

  const addNotification = useCallback(
    (input: AddNotificationInput) => {
      const notification: AppNotification = {
        id: generateNotificationId(),
        category: input.category,
        priority: input.priority,
        title: input.title,
        message: input.message,
        link: input.link,
        createdAt: new Date().toISOString(),
        read: false,
      };

      setNotifications((prev) => {
        const next = [notification, ...prev];
        persist(next);
        return next;
      });

      playNotificationSound(input.sound ?? defaultSoundForCategory(input.category));

      // Loaded on demand so the (fairly heavy) SweetAlert2 bundle only
      // downloads once a toast actually needs to fire, instead of being
      // pulled into every page's initial load via this always-mounted provider.
      import("sweetalert2").then(({ default: Swal }) => {
        Swal.fire({
          toast: true,
          position: "top-end",
          showConfirmButton: false,
          timer: 6000,
          timerProgressBar: true,
          icon: PRIORITY_ICON[input.priority],
          title: input.title,
          text: input.message,
          didOpen: (toastEl: HTMLElement) => {
            if (!input.link) return;
            toastEl.style.cursor = "pointer";
            toastEl.addEventListener("click", () => {
              navigate(input.link!);
              Swal.close();
            });
          },
        });
      });
    },
    [persist, navigate],
  );

  const markAsRead = useCallback(
    (id: string) => {
      setNotifications((prev) => {
        const next = prev.map((n) => (n.id === id ? { ...n, read: true } : n));
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => {
      const next = prev.map((n) => (n.read ? n : { ...n, read: true }));
      persist(next);
      return next;
    });
  }, [persist]);

  const clearNotification = useCallback(
    (id: string) => {
      setNotifications((prev) => {
        const next = prev.filter((n) => n.id !== id);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const clearAll = useCallback(() => {
    setNotifications([]);
    persist([]);
  }, [persist]);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  const unreadCountByCategory = useCallback(
    (category: NotificationCategory) =>
      notifications.filter((n) => n.category === category && !n.read).length,
    [notifications],
  );

  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      unreadCountByCategory,
      addNotification,
      markAsRead,
      markAllAsRead,
      clearNotification,
      clearAll,
    }),
    [notifications, unreadCount, unreadCountByCategory, addNotification, markAsRead, markAllAsRead, clearNotification, clearAll],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}
