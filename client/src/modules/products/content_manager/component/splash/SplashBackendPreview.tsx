import { useState } from "react";
import { FiPlay } from "react-icons/fi";
import { previewSplash, splashError, type SplashRegistry, type SplashResolution } from "../../api/SplashscreenApi";
import { formatIst, inputToIstInstant, nowIstInput } from "../../utils/splash";
import SplashPhonePreview from "./SplashPhonePreview";

const field = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100";
const SOURCE_LABELS: Record<SplashResolution["source"], string> = {
  scheduled_campaign: "Scheduled campaign", default: "Default content", none: "Nothing is shown",
};

interface Props {
  registry: SplashRegistry;
  initial?: { page_key?: string; slot_key?: string; platform?: "android" | "ios"; audience?: "authenticated" | "guest" };
}

/** Asks the server what the app would get. Reflects saved campaigns only, never unsaved edits. */
export default function SplashBackendPreview({ registry, initial }: Props) {
  const firstPage = registry.pages.find((p) => p.key === initial?.page_key) || registry.pages[0];
  const [pageKey, setPageKey] = useState(firstPage?.key || "");
  const [slotKey, setSlotKey] = useState(initial?.slot_key || firstPage?.slots[0]?.key || "");
  const [platform, setPlatform] = useState<"android" | "ios">(initial?.platform || "android");
  const [audience, setAudience] = useState<"authenticated" | "guest">(initial?.audience || "authenticated");
  const [at, setAt] = useState(nowIstInput());
  const [result, setResult] = useState<SplashResolution | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const page = registry.pages.find((p) => p.key === pageKey);
  const slot = page?.slots.find((s) => s.key === slotKey);

  async function run() {
    setBusy(true); setError(null);
    try {
      setResult(await previewSplash({ page_key: pageKey, slot_key: slotKey, platform, audience, at: inputToIstInstant(at) }));
    } catch (err) {
      setResult(null); setError(splashError(err, "Preview failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">What the app gets from the server at the chosen time, using <strong>saved</strong> campaigns and defaults. Unsaved changes are not included.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-slate-600">Page
            <select className={field} value={pageKey} onChange={(e) => { const next = registry.pages.find((p) => p.key === e.target.value); setPageKey(e.target.value); setSlotKey(next?.slots[0]?.key || ""); setResult(null); }}>
              {registry.pages.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select></label>
          <label className="text-xs font-semibold text-slate-600">Position
            <select className={field} value={slotKey} onChange={(e) => { setSlotKey(e.target.value); setResult(null); }}>
              {page?.slots.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select></label>
          <label className="text-xs font-semibold text-slate-600">Device
            <select className={field} value={platform} onChange={(e) => setPlatform(e.target.value as "android" | "ios")}><option value="android">Android</option><option value="ios">iOS</option></select></label>
          <label className="text-xs font-semibold text-slate-600">User
            <select className={field} value={audience} onChange={(e) => setAudience(e.target.value as "authenticated" | "guest")}><option value="authenticated">Signed in</option><option value="guest">Guest</option></select></label>
          <label className="text-xs font-semibold text-slate-600 sm:col-span-2">At (IST)
            <input type="datetime-local" className={field} value={at} onChange={(e) => setAt(e.target.value)} /></label>
        </div>
        <button type="button" onClick={() => void run()} disabled={busy || !at} className="inline-flex items-center gap-2 rounded-xl bg-[#852BAF] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><FiPlay /> {busy ? "Checking…" : "Preview from server"}</button>
        {error && <p className="text-sm text-rose-600" role="alert">{error}</p>}
        {result && (
          <dl className="grid gap-2 rounded-xl border border-slate-200 p-4 text-sm sm:grid-cols-2" data-testid="backend-preview-result">
            <div><dt className="text-xs text-slate-500">Source</dt><dd className="font-semibold text-slate-900">{SOURCE_LABELS[result.source]}</dd></div>
            <div><dt className="text-xs text-slate-500">Campaign</dt><dd className="font-medium text-slate-900">{result.campaign ? `${result.campaign.title} (#${result.campaign.content_id})` : "—"}</dd></div>
            <div><dt className="text-xs text-slate-500">Ends</dt><dd>{result.expires_at ? formatIst(result.expires_at) : result.campaign ? "No expiry" : "—"}</dd></div>
            <div><dt className="text-xs text-slate-500">Next change</dt><dd>{formatIst(result.next_change_at)}</dd></div>
          </dl>
        )}
      </div>
      <aside>
        <p className="mb-2 text-xs font-semibold text-slate-600">Server preview <span className="font-normal text-slate-400">· saved content</span></p>
        {slot && <SplashPhonePreview imageUrl={result?.campaign?.image_url || null} title={result?.campaign?.title || (result ? "Nothing is shown" : "Run a preview")} ctaText={result?.campaign?.cta_text}
          slotKey={slot.key} slotKind={slot.kind} device={platform} displaySeconds={result?.campaign?.display.display_seconds ?? null} pageLabel={page?.label} />}
      </aside>
    </div>
  );
}
