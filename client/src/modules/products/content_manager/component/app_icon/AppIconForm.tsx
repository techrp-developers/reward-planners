import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { FiAlertTriangle, FiX } from "react-icons/fi";
import { toast } from "sonner";
import { appIconError, getAppIconKeys, saveAppIconCampaign, type AppIconCampaign, type AppIconPlatform } from "../../api/AppIconApi";
import { ANDROID_KEYS_WITH_ARTWORK, appIconLocalInput, overlappingAppIcons } from "../../utils/appIcons";

const field = "mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100";
interface Props { campaign?: AppIconCampaign; campaigns: AppIconCampaign[]; onClose: () => void; onSaved: () => void }
type FormPlatform = AppIconPlatform | "both";

const platformLabel = (platform: AppIconPlatform) => platform === "ios" ? "iOS" : "Android";

export default function AppIconForm({ campaign, campaigns, onClose, onSaved }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [platform, setPlatform] = useState<FormPlatform>(campaign?.platform ?? "ios");
  const [iconKey, setIconKey] = useState(campaign?.icon_key ?? "");
  const [start, setStart] = useState(campaign ? appIconLocalInput(campaign.starts_at) : "");
  const [end, setEnd] = useState(campaign ? appIconLocalInput(campaign.ends_at) : "");
  const [priority, setPriority] = useState(String(campaign?.priority ?? 0));
  const [active, setActive] = useState(campaign ? Boolean(campaign.is_active) : true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const iosKeys = useQuery({ queryKey: ["content", "app-icon-keys", "ios"], queryFn: () => getAppIconKeys("ios"), staleTime: 0, retry: false, enabled: platform === "ios" || platform === "both" });
  const androidKeys = useQuery({ queryKey: ["content", "app-icon-keys", "android"], queryFn: () => getAppIconKeys("android"), staleTime: 0, retry: false, enabled: platform === "android" || platform === "both" });
  const choices = (() => {
    if (platform === "android") return (androidKeys.data?.icon_keys ?? []).filter((key) => ANDROID_KEYS_WITH_ARTWORK.includes(key));
    if (platform === "both") {
      const androidArtwork = new Set((androidKeys.data?.icon_keys ?? []).filter((key) => ANDROID_KEYS_WITH_ARTWORK.includes(key)));
      return (iosKeys.data?.icon_keys ?? []).filter((key) => androidArtwork.has(key));
    }
    return iosKeys.data?.icon_keys ?? [];
  })();
  const platformsToSave: AppIconPlatform[] = platform === "both" ? ["ios", "android"] : [platform];
  const overlaps = active ? platformsToSave.flatMap((item) => overlappingAppIcons(campaigns, item, start, end, campaign?.id)) : [];
  const keysLoading = platform === "ios" ? iosKeys.isFetching : platform === "android" ? androidKeys.isFetching : iosKeys.isFetching || androidKeys.isFetching;
  const keysError = platform === "ios" ? iosKeys.error : platform === "android" ? androidKeys.error : iosKeys.error || androidKeys.error;

  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => { if (keysError) toast.error(appIconError(keysError)); }, [keysError]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const starts = new Date(start);
    const ends = new Date(end);
    const number = Number(priority);
    if (!iconKey || !choices.includes(iconKey) || !start || !end || !priority.trim()) {
      setError("All fields are required. Select an available icon key."); return;
    }
    if (!Number.isFinite(starts.getTime()) || !Number.isFinite(ends.getTime()) || ends <= starts) {
      setError("End must be after start."); return;
    }
    if (!Number.isInteger(number) || number < -2147483648 || number > 2147483647) {
      setError("Priority must be a 32-bit integer."); return;
    }
    setError(""); setSaving(true);
    try {
      await Promise.all(platformsToSave.map((item) => saveAppIconCampaign({ platform: item, icon_key: iconKey, starts_at: starts.toISOString(), ends_at: ends.toISOString(), priority: number, is_active: active }, campaign?.id)));
      toast.success(campaign ? "Campaign updated" : "Campaign created");
      onSaved(); onClose();
    } catch (err) { const message = appIconError(err); setError(message); toast.error(message); }
    finally { setSaving(false); }
  }

  return (
    <dialog ref={dialog} onCancel={(event) => { event.preventDefault(); if (!saving) onClose(); }} aria-labelledby="app-icon-form-title" className="fixed inset-0 m-auto max-h-[90dvh] w-[540px] max-w-[92vw] overflow-y-auto rounded-lg bg-white p-6 shadow-2xl backdrop:bg-black/40">
      <div className="flex items-center justify-between gap-3">
        <h2 id="app-icon-form-title" className="text-xl font-bold text-slate-900">{campaign ? "Edit campaign" : "New campaign"}</h2>
        <button type="button" onClick={onClose} disabled={saving} title="Close" aria-label="Close" className="p-2 text-slate-500 disabled:opacity-50"><FiX size={20} /></button>
      </div>
      <form onSubmit={submit} className="mt-5 space-y-4">
        <fieldset disabled={saving} className="grid min-w-0 gap-4 sm:grid-cols-2">
          <label className="text-xs font-semibold text-slate-600">Platform
            <select required value={platform} onChange={(event) => { setPlatform(event.target.value as FormPlatform); setIconKey(""); }} className={field}>
              <option value="ios">iOS</option><option value="android">Android</option>{!campaign && <option value="both">Both</option>}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">Icon key
            <select required value={choices.includes(iconKey) ? iconKey : ""} onChange={(event) => setIconKey(event.target.value)} disabled={keysLoading || !!keysError} className={field}>
              <option value="">{keysLoading ? "Loading..." : "Select icon"}</option>
              {choices.map((key) => <option key={key} value={key}>{key}</option>)}
            </select>
          </label>
          {keysError && <button type="button" onClick={() => { if (platform !== "android") void iosKeys.refetch(); if (platform !== "ios") void androidKeys.refetch(); }} className="text-left text-sm text-red-700 sm:col-span-2">Unable to load icon keys. Retry</button>}
          <label className="min-w-0 text-xs font-semibold text-slate-600">Start
            <input required type="datetime-local" step="0.001" value={start} onChange={(event) => setStart(event.target.value)} className={field} />
          </label>
          <label className="min-w-0 text-xs font-semibold text-slate-600">End
            <input required type="datetime-local" step="0.001" value={end} onChange={(event) => setEnd(event.target.value)} className={field} />
          </label>
          <p className="text-xs text-slate-500 sm:col-span-2">Times are in your local timezone.</p>
          <label className="text-xs font-semibold text-slate-600">Priority
            <input required type="number" step="1" min="-2147483648" max="2147483647" value={priority} onChange={(event) => setPriority(event.target.value)} className={field} />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" role="switch" checked={active} onChange={(event) => setActive(event.target.checked)} className="h-4 w-4 accent-[#852BAF]" />Active</label>
        </fieldset>
        {overlaps.length > 0 && <div role="status" className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><FiAlertTriangle className="mt-0.5 shrink-0" /><p>Overlaps {overlaps.length} active campaign{overlaps.length === 1 ? "" : "s"} on {platform === "both" ? "these platforms" : platformLabel(platform)}. Higher priority wins.</p></div>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <button type="button" disabled={saving} onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={saving || keysLoading || !!keysError} className="rounded-lg bg-[#852BAF] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Save campaign"}</button>
        </div>
      </form>
    </dialog>
  );
}
