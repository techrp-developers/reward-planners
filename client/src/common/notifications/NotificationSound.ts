import positiveUrl from "../assets/mixkit-positive-notification-951.wav";
import bellUrl from "../assets/mixkit-bell-notification-933.wav";
import confirmationUrl from "../assets/mixkit-confirmation-tone-2867.wav";
import type { NotificationCategory } from "./types";

export type NotificationSoundKey = "positive" | "bell" | "confirmation";

const SOUND_URLS: Record<NotificationSoundKey, string> = {
  positive: positiveUrl,
  bell: bellUrl,
  confirmation: confirmationUrl,
};

const DEFAULT_SOUND_BY_CATEGORY: Record<NotificationCategory, NotificationSoundKey> = {
  new_order: "positive",
  service_enquiry: "bell",
  vendor_onboarding: "confirmation",
  product_approval: "confirmation",
  general: "bell",
};

export function defaultSoundForCategory(category: NotificationCategory): NotificationSoundKey {
  return DEFAULT_SOUND_BY_CATEGORY[category];
}

const audioCache = new Map<NotificationSoundKey, HTMLAudioElement>();

function getAudio(key: NotificationSoundKey): HTMLAudioElement {
  let audio = audioCache.get(key);
  if (!audio) {
    audio = new Audio(SOUND_URLS[key]);
    audio.preload = "auto";
    audioCache.set(key, audio);
  }
  return audio;
}

export function playNotificationSound(key: NotificationSoundKey) {
  try {
    const audio = getAudio(key);
    audio.currentTime = 0;
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        // Browsers block audio autoplay until the user has interacted with the
        // page at least once. Nothing actionable to do here — it'll succeed
        // on the next notification after any click/keypress.
      });
    }
  } catch {
    /* ignore playback errors */
  }
}
