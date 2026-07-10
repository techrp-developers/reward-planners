export type NotificationPriority = "high" | "medium" | "low";

export type NotificationCategory =
  | "new_order"
  | "service_enquiry"
  | "vendor_onboarding"
  | "product_approval"
  | "general";

export interface AppNotification {
  id: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  message: string;
  link?: string;
  createdAt: string;
  read: boolean;
}
