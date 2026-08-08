const SEEN_IDS_SUFFIX = ":seen";
const INITIALIZED_SUFFIX = ":init";

export interface PollingWatcherOptions<T> {
  /** Unique per user + event type, e.g. `notif:watch:vendor_onboarding:42` */
  storageKey: string;
  fetchItems: () => Promise<T[]>;
  getId: (item: T) => string | number;
  /** Only items matching this are candidates to notify about (e.g. status === "pending"). */
  isNotifiable: (item: T) => boolean;
  onNewItems: (items: T[]) => void;
  intervalMs?: number;
}

function loadSeenIds(storageKey: string): Set<string | number> {
  try {
    const raw = localStorage.getItem(storageKey + SEEN_IDS_SUFFIX);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

function saveSeenIds(storageKey: string, ids: Set<string | number>): void {
  try {
    localStorage.setItem(storageKey + SEEN_IDS_SUFFIX, JSON.stringify(Array.from(ids)));
  } catch {
    /* ignore */
  }
}

/**
 * Reusable, transport-agnostic "new event" detector. Today it's driven by
 * polling an existing REST list endpoint and diffing IDs; the public shape
 * (onNewItems callback) is what would stay stable if this were later swapped
 * for a WebSocket/SSE push source instead.
 *
 * Returns a stop function. Automatically pauses while the tab is hidden.
 */
export function startPollingWatcher<T>(options: PollingWatcherOptions<T>): () => void {
  const { storageKey, fetchItems, getId, isNotifiable, onNewItems, intervalMs = 20000 } = options;

  let stopped = false;

  const tick = async () => {
    if (stopped || document.hidden) return;

    try {
      const items = await fetchItems();
      const seenIds = loadSeenIds(storageKey);
      const isFirstRun = !localStorage.getItem(storageKey + INITIALIZED_SUFFIX);

      const newOnes = isFirstRun
        ? []
        : items.filter((item) => isNotifiable(item) && !seenIds.has(getId(item)));

      const nextSeen = new Set(seenIds);
      items.forEach((item) => nextSeen.add(getId(item)));
      saveSeenIds(storageKey, nextSeen);

      if (isFirstRun) {
        try {
          localStorage.setItem(storageKey + INITIALIZED_SUFFIX, "1");
        } catch {
          /* ignore */
        }
      }

      if (newOnes.length > 0) {
        onNewItems(newOnes);
      }
    } catch {
      // Transient network/auth errors during a background poll shouldn't
      // surface as a user-facing error — just try again on the next tick.
    }
  };

  const onVisible = () => {
    if (!document.hidden) tick();
  };

  tick();
  const timer = window.setInterval(tick, intervalMs);
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    stopped = true;
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
