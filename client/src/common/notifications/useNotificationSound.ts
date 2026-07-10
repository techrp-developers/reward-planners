import { useCallback } from "react";
import { playNotificationSound, type NotificationSoundKey } from "./NotificationSound";

export function useNotificationSound() {
  const play = useCallback((key: NotificationSoundKey) => {
    playNotificationSound(key);
  }, []);

  return { play };
}
