import { z } from "zod";
import { NotificationType } from "./enums.js";

export const notificationSchema = z.object({
  notification_id: z.string().optional(),
  user_id: z.string(),
  type: NotificationType,
  title: z.string().min(1),
  message: z.string().optional(),
  link: z.string().optional(),
  dmp_id: z.string().optional(),
  project_id: z.string().optional(),
  read_at: z.coerce.date().optional(),
  created_at: z.coerce.date(),
});

export const createNotificationSchema = notificationSchema.omit({
  notification_id: true,
  created_at: true,
  read_at: true,
});

export type Notification = z.infer<typeof notificationSchema>;
export type CreateNotification = z.infer<typeof createNotificationSchema>;
