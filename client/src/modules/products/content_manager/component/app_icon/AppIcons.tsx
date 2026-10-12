import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FiEdit2, FiPause, FiPlus, FiRefreshCw, FiSmartphone, FiTrash2 } from "react-icons/fi";
import { toast } from "sonner";
import Swal from "sweetalert2";
import { appIconError, deactivateAppIconCampaign, deleteAppIconCampaign, getAppIconCampaign, listAppIconCampaigns, resolveAppIcon, type AppIconCampaign, type AppIconPlatform } from "../../api/AppIconApi";
import { appIconStatus, parseAppIconDate } from "../../utils/appIcons";
import AppIconForm from "./AppIconForm";

const platformLabel = (platform: AppIconPlatform) => platform === "ios" ? "iOS" : "Android";
const dateLabel = (value: string) => parseAppIconDate(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const statusStyle: Record<string, string> = { "Live now": "bg-emerald-50 text-emerald-700", Scheduled: "bg-sky-50 text-sky-700", Expired: "bg-amber-50 text-amber-800", Disabled: "bg-slate-100 text-slate-600" };

function LiveIcon({ platform }: { platform: AppIconPlatform }) {
  const query = useQuery({ queryKey: ["content", "resolved-app-icon", platform], queryFn: () => resolveAppIcon(platform), refetchInterval: 30000, retry: false });
  useEffect(() => { if (query.error) toast.error(appIconError(query.error)); }, [query.error]);
  return <article className="rounded-lg border border-slate-200 bg-white p-4">
    <div className="flex items-center justify-between gap-3"><p className="flex items-center gap-2 text-sm font-semibold text-slate-700"><FiSmartphone />{platformLabel(platform)}</p><button title={`Refresh ${platformLabel(platform)} live icon`} aria-label={`Refresh ${platformLabel(platform)} live icon`} onClick={() => void query.refetch()} disabled={query.isFetching} className="p-2 text-slate-500 disabled:opacity-50"><FiRefreshCw /></button></div>
    <p className="mt-2 break-all text-lg font-bold text-slate-900">{query.isError ? "Unavailable" : query.data?.icon_key ?? "Loading..."}</p>
  </article>;
}

export default function AppIcons() {
  const client = useQueryClient();
  const [filter, setFilter] = useState<AppIconPlatform | "">("");
  const [form, setForm] = useState<{ campaign?: AppIconCampaign } | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const campaigns = useQuery({ queryKey: ["content", "app-icons"], queryFn: () => listAppIconCampaigns(), retry: false, refetchInterval: 30000 });
  useEffect(() => { if (campaigns.error) toast.error(appIconError(campaigns.error)); }, [campaigns.error]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["content", "app-icons"] });
    void client.invalidateQueries({ queryKey: ["content", "resolved-app-icon"] });
  };
  async function action(campaign: AppIconCampaign, type: "edit" | "deactivate" | "delete") {
    if (busy !== null) return;
    setBusy(campaign.id);
    try {
      if (type === "edit") { setForm({ campaign: await getAppIconCampaign(campaign.id) }); return; }
      if (type === "delete") {
        const result = await Swal.fire({ title: "Delete campaign?", text: `Delete ${campaign.icon_key} for ${platformLabel(campaign.platform)}?`, icon: "warning", showCancelButton: true, confirmButtonText: "Delete", confirmButtonColor: "#dc2626" });
        if (!result.isConfirmed) return;
        await deleteAppIconCampaign(campaign.id);
      } else { await deactivateAppIconCampaign(campaign.id); }
      toast.success(type === "delete" ? "Campaign deleted" : "Campaign deactivated"); refresh();
    } catch (error) { toast.error(appIconError(error)); }
    finally { setBusy(null); }
  }
  const rows = (campaigns.data ?? []).filter((campaign) => !filter || campaign.platform === filter);

  return <main className="space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-purple-100 pb-5">
      <div><p className="text-xs font-semibold text-[#852BAF]">Content management</p><h1 className="mt-1 text-3xl font-bold text-slate-900">App Icons</h1></div>
      <button onClick={() => setForm({})} disabled={campaigns.isPending || campaigns.isError || busy !== null} className="inline-flex items-center gap-2 rounded-lg bg-[#852BAF] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><FiPlus />New campaign</button>
    </header>
    <section aria-labelledby="live-icons-title"><h2 id="live-icons-title" className="mb-3 text-base font-semibold text-slate-800">Currently live</h2><div className="grid gap-4 sm:grid-cols-2"><LiveIcon platform="ios" /><LiveIcon platform="android" /></div></section>
    <p className="text-sm text-slate-500">Icons change when users next open the app. Artwork is bundled in the app; images are not uploaded here.</p>
    <section aria-labelledby="campaigns-title">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 id="campaigns-title" className="text-base font-semibold text-slate-800">Campaigns</h2><div className="flex items-center gap-2"><label htmlFor="app-icon-platform-filter" className="text-sm text-slate-600">Platform</label><select id="app-icon-platform-filter" value={filter} onChange={(event) => setFilter(event.target.value as AppIconPlatform | "")} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="">All platforms</option><option value="ios">iOS</option><option value="android">Android</option></select><button title="Refresh campaigns" aria-label="Refresh campaigns" onClick={() => void campaigns.refetch()} disabled={campaigns.isFetching} className="p-2 text-slate-500 disabled:opacity-50"><FiRefreshCw /></button></div></div>
      {campaigns.isPending ? <p className="py-12 text-center text-sm text-slate-500">Loading campaigns...</p> : campaigns.isError ? <div role="alert" className="py-12 text-center text-sm text-red-700"><p>{appIconError(campaigns.error)}</p><button onClick={() => void campaigns.refetch()} className="mt-3 font-semibold">Retry</button></div> : <div className="overflow-x-auto border-y border-slate-200 bg-white">
        <table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr>{["Platform", "Icon key", "Start", "End", "Priority", "Status", "Actions"].map((label) => <th key={label} scope="col" className="whitespace-nowrap px-4 py-3 font-semibold">{label}</th>)}</tr></thead>
          <tbody>{rows.map((campaign) => { const status = appIconStatus(campaign, now); return <tr key={campaign.id} className="border-t border-slate-100">
            <td className="px-4 py-3">{platformLabel(campaign.platform)}</td><td className="px-4 py-3 font-medium">{campaign.icon_key}</td><td className="whitespace-nowrap px-4 py-3">{dateLabel(campaign.starts_at)}</td><td className="whitespace-nowrap px-4 py-3">{dateLabel(campaign.ends_at)}</td><td className="px-4 py-3 tabular-nums">{campaign.priority}</td><td className="px-4 py-3"><span className={`inline-block whitespace-nowrap rounded px-2 py-1 text-xs font-semibold ${statusStyle[status]}`}>{status}</span></td>
            <td className="px-4 py-3"><div className="flex gap-1">{([['edit', FiEdit2, 'Edit'], ['deactivate', FiPause, 'Deactivate'], ['delete', FiTrash2, 'Delete']] as const).map(([type, Icon, label]) => <button key={type} title={label} aria-label={`${label} ${campaign.icon_key} campaign ${campaign.id}`} disabled={busy !== null || (type === "deactivate" && !campaign.is_active)} onClick={() => void action(campaign, type)} className={`rounded p-2 hover:bg-slate-100 disabled:opacity-30 ${type === "delete" ? "text-red-600" : "text-slate-600"}`}><Icon size={16} /></button>)}</div></td>
          </tr>; })}{rows.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500">No campaigns found.</td></tr>}</tbody>
        </table>
      </div>}
    </section>
    {form && <AppIconForm campaign={form.campaign} campaigns={campaigns.data ?? []} onClose={() => setForm(null)} onSaved={refresh} />}
  </main>;
}
