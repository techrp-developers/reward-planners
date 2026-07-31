import { createContext } from "react";
import type { AppNotification, NotificationCategory, NotificationPriority } from "./types";
import type { NotificationSoundKey } from "./NotificationSound";

export interface AddNotificationInput {
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  message: string;
  link?: string;
  sound?: NotificationSoundKey;
}

export interface NotificationContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  unreadCountByCategory: (category: NotificationCategory) => number;
  addNotification: (input: AddNotificationInput) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotification: (id: string) => void;
  clearAll: () => void;
}

export const NotificationContext = createContext<NotificationContextValue | null>(null);
