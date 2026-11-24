import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FiArchive,
  FiCalendar,
  FiEdit2,
  FiEye,
  FiImage,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiStar,
} from "react-icons/fi";
import axios from "axios";
import { Link } from "react-router-dom";
import Swal from "sweetalert2";
import { api } from "../../../../common/api/api";
import { routes } from "../../../../routes";

type Status = "draft" | "active" | "archived";
type EffectiveStatus = "draft" | "scheduled" | "live" | "expired" | "archived";
type StatusFilter = "all" | EffectiveStatus;

interface Campaign {
  campaign_id: number;
  title: string;
  banner_image: string | null;
  background_type: "solid" | "gradient" | "image";
  background_color: string;
  gradient_end_color: string;
  start_at: string | null;
  end_at: string | null;
  status: Status;
  display_order: number;
  featured_product_count: number;
  updated_at?: string | null;
}

const formatDate = (value?: string | null) => {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
};

const getEffectiveStatus = (campaign: Campaign, now: number): EffectiveStatus => {
  if (campaign.status !== "active") return campaign.status;
  const startsAt = campaign.start_at ? new Date(campaign.start_at).getTime() : null;
  const endsAt = campaign.end_at ? new Date(campaign.end_at).getTime() : null;
  if (startsAt !== null && Number.isFinite(startsAt) && startsAt > now) return "scheduled";
  if (endsAt !== null && Number.isFinite(endsAt) && endsAt < now) return "expired";
  return "live";
};

const statusPresentation: Record<EffectiveStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-amber-50 text-amber-800" },
  scheduled: { label: "Scheduled", className: "bg-blue-50 text-blue-800" },
  live: { label: "Live", className: "bg-emerald-50 text-emerald-800" },
  expired: { label: "Expired", className: "bg-slate-100 text-slate-600" },
  archived: { label: "Archived", className: "bg-slate-100 text-slate-600" },
};

const campaignBackground = (campaign: Campaign): React.CSSProperties => ({
  backgroundColor: campaign.background_color || "#4B0082",
  backgroundImage:
    campaign.background_type === "image" && campaign.banner_image
      ? `url("${campaign.banner_image}")`
      : campaign.background_type === "gradient"
        ? `linear-gradient(135deg, ${campaign.background_color || "#4B0082"}, ${campaign.gradient_end_color || "#6A00FF"})`
        : undefined,
  backgroundSize: "cover",
  backgroundPosition: "center",
});

export default function FeaturedCampaignList() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const load = useCallback(async (showError = true) => {
    try {
      setLoading(true);
      setLoadError(false);
      const { data } = await api.get("/campaign/campaigns", {
        params: { campaign_type: "featured", module: "product" },
      });
      setCampaigns(Array.isArray(data?.data) ? data.data : []);
      setNow(Date.now());
      return true;
    } catch {
      setLoadError(true);
      if (showError) {
        await Swal.fire("Unable to load featured campaigns", "Please check your connection and try again.", "error");
      }
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => campaigns.filter((campaign) => {
    const effectiveStatus = getEffectiveStatus(campaign, now);
    return (status === "all" || effectiveStatus === status)
      && campaign.title.toLowerCase().includes(search.trim().toLowerCase());
  }), [campaigns, now, search, status]);

  const updateStatus = async (campaign: Campaign, nextStatus: Status) => {
    const actionLabel = nextStatus === "active"
      ? "publish"
      : nextStatus === "archived"
        ? "archive"
        : "return to draft";
    const confirmation = await Swal.fire({
      title: `${actionLabel[0].toUpperCase()}${actionLabel.slice(1)} campaign?`,
      text: nextStatus === "active"
        ? "The campaign will be shown in the mobile app when its schedule is active."
        : nextStatus === "archived"
          ? "This campaign will stop appearing in the mobile app. You can restore it later."
          : "This campaign will no longer appear in the mobile app.",
      icon: nextStatus === "archived" ? "warning" : "question",
      showCancelButton: true,
      confirmButtonText: actionLabel[0].toUpperCase() + actionLabel.slice(1),
      confirmButtonColor: nextStatus === "archived" ? "#64748B" : "#852BAF",
    });
    if (!confirmation.isConfirmed) return;

    try {
      setUpdatingId(campaign.campaign_id);
      await api.patch(`/campaign/campaigns/${campaign.campaign_id}/status`, { status: nextStatus });
      const refreshed = await load(false);
      await Swal.fire({
        icon: refreshed ? "success" : "warning",
        title: refreshed
          ? `Campaign ${nextStatus === "active" ? "published" : nextStatus === "archived" ? "archived" : "saved as draft"}`
          : "Campaign updated",
        text: refreshed ? undefined : "The change was saved, but the campaign list could not refresh. Use Refresh to try again.",
        timer: refreshed ? 1300 : undefined,
        showConfirmButton: !refreshed,
      });
    } catch (error: unknown) {
      const message = axios.isAxiosError(error) ? error.response?.data?.message : null;
      await Swal.fire("Unable to update campaign", message || "Please check the campaign and try again.", "error");
    } finally {
      setUpdatingId(null);
    }
  };

  const campaignLink = (campaign: Campaign) =>
    routes.manager.featuredProducts.edit.replace(":id", String(campaign.campaign_id));

  const renderStatus = (campaign: Campaign) => {
    const presentation = statusPresentation[getEffectiveStatus(campaign, now)];
    return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${presentation.className}`}>{presentation.label}</span>;
  };

  const renderActions = (campaign: Campaign) => (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        aria-label={`Preview ${campaign.title}`}
        to={`${campaignLink(campaign)}?preview=1`}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 transition hover:border-purple-200 hover:bg-purple-50 hover:text-[#852BAF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#852BAF]"
      >
        <FiEye /> Preview
      </Link>
      <Link
        aria-label={`Edit ${campaign.title}`}
        to={campaignLink(campaign)}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-purple-100 bg-purple-50 px-3 text-xs font-semibold text-[#852BAF] transition hover:bg-[#852BAF] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#852BAF]"
      >
        <FiEdit2 /> Edit
      </Link>
      {campaign.status === "archived" ? (
        <button
          type="button"
          disabled={updatingId === campaign.campaign_id}
          onClick={() => void updateStatus(campaign, "draft")}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          Restore draft
        </button>
      ) : (
        <>
          {campaign.status === "draft" ? (
            <button
              type="button"
              disabled={updatingId === campaign.campaign_id}
              onClick={() => void updateStatus(campaign, "active")}
              className="inline-flex h-9 items-center rounded-lg bg-[#852BAF] px-3 text-xs font-bold text-white hover:bg-[#702393] disabled:opacity-50"
            >
              Publish
            </button>
          ) : (
            <button
              type="button"
              disabled={updatingId === campaign.campaign_id}
              onClick={() => void updateStatus(campaign, "draft")}
              className="inline-flex h-9 items-center rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              Set draft
            </button>
          )}
          <button
            type="button"
            aria-label={`Archive ${campaign.title}`}
            disabled={updatingId === campaign.campaign_id}
            onClick={() => void updateStatus(campaign, "archived")}
            className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
            title="Archive campaign"
          >
            <FiArchive />
          </button>
        </>
      )}
    </div>
  );

  return <div className="space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#852BAF]">Mobile storefront</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Featured products</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">Manage the campaign heading, featured products, appearance, and schedule shown in the mobile app.</p>
      </div>
      <Link to={routes.manager.featuredProducts.create} className="inline-flex w-fit items-center gap-2 rounded-xl bg-[#852BAF] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#702393] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#852BAF]">
        <FiPlus /> Create campaign
      </Link>
    </header>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search campaigns</span>
          <FiSearch aria-hidden="true" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search campaigns by heading"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-purple-400 focus:bg-white focus:ring-4 focus:ring-purple-100"
          />
        </label>
        <label className="sm:w-48">
          <span className="sr-only">Filter by campaign status</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100"
          >
            <option value="all">All campaign states</option>
            <option value="draft">Draft</option>
            <option value="scheduled">Scheduled</option>
            <option value="live">Live</option>
            <option value="expired">Expired</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          aria-label="Refresh campaigns"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-600 transition hover:border-purple-200 hover:text-[#852BAF] disabled:opacity-50"
        >
          <FiRefreshCw className={loading ? "animate-spin" : ""} /> <span className="sm:hidden">Refresh</span>
        </button>
      </div>

      {loading ? (
        <div className="space-y-3 p-5" aria-label="Loading campaigns">
          {[0, 1, 2].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl bg-slate-100" />)}
        </div>
      ) : loadError ? (
        <div className="grid min-h-56 place-items-center p-8 text-center">
          <div><p className="text-sm font-semibold text-slate-700">Campaigns couldn’t be loaded.</p><button type="button" onClick={() => void load()} className="mt-3 rounded-lg bg-purple-50 px-4 py-2 text-sm font-semibold text-[#852BAF] hover:bg-purple-100">Try again</button></div>
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr><th className="px-5 py-3.5">Campaign</th><th className="px-4 py-3.5">Products</th><th className="px-4 py-3.5">Schedule</th><th className="px-4 py-3.5">Priority</th><th className="px-4 py-3.5">State</th><th className="px-5 py-3.5 text-right">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((campaign) => <tr key={campaign.campaign_id} className="transition hover:bg-purple-50/20">
                  <td className="px-5 py-4">
                    <div className="flex min-w-60 items-center gap-3">
                      <span aria-hidden="true" className="grid h-12 w-20 shrink-0 place-items-center rounded-lg bg-cover bg-center text-white" style={campaignBackground(campaign)}>
                        {campaign.background_type !== "image" && <FiStar />}
                        {campaign.background_type === "image" && !campaign.banner_image && <FiImage />}
                      </span>
                      <div className="min-w-0"><p className="truncate font-semibold text-slate-900">{campaign.title}</p><p className="mt-0.5 text-xs text-slate-500">Updated {formatDate(campaign.updated_at)}</p></div>
                    </div>
                  </td>
                  <td className="px-4 py-4 font-medium text-slate-700">{campaign.featured_product_count ?? 0}</td>
                  <td className="px-4 py-4 text-xs text-slate-600"><div className="flex items-start gap-2"><FiCalendar className="mt-0.5 shrink-0 text-slate-400" /><span>{formatDate(campaign.start_at)}<span className="my-1 block text-slate-400">to {formatDate(campaign.end_at)}</span></span></div></td>
                  <td className="px-4 py-4 text-slate-600">#{campaign.display_order}</td>
                  <td className="px-4 py-4">{renderStatus(campaign)}</td>
                  <td className="px-5 py-4"><div className="flex justify-end">{renderActions(campaign)}</div></td>
                </tr>)}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 p-3 md:hidden">
            {filtered.map((campaign) => <article key={campaign.campaign_id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className="grid h-14 w-20 shrink-0 place-items-center rounded-lg bg-cover bg-center text-white" style={campaignBackground(campaign)}>
                  {campaign.background_type !== "image" && <FiStar />}
                  {campaign.background_type === "image" && !campaign.banner_image && <FiImage />}
                </span>
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{campaign.title}</h2>{renderStatus(campaign)}</div>
                  <p className="mt-1 text-xs text-slate-500">{campaign.featured_product_count ?? 0} products · Priority #{campaign.display_order}</p>
                  <p className="mt-2 text-xs text-slate-500">Starts {formatDate(campaign.start_at)}</p>
                  <p className="mt-1 text-xs text-slate-500">Ends {formatDate(campaign.end_at)}</p>
                </div>
              </div>
              <div className="mt-4 border-t border-slate-100 pt-3">{renderActions(campaign)}</div>
            </article>)}
          </div>

          {!filtered.length && <div className="grid min-h-56 place-items-center p-8 text-center">
            <div><span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-purple-50 text-[#852BAF]"><FiStar /></span><p className="mt-3 text-sm font-semibold text-slate-800">{campaigns.length ? "No campaigns match these filters" : "No featured campaigns yet"}</p><p className="mt-1 max-w-sm text-sm text-slate-500">{campaigns.length ? "Try another search or campaign state." : "Create a campaign to choose its products, appearance, and schedule."}</p>{!campaigns.length && <Link to={routes.manager.featuredProducts.create} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#852BAF] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#702393]"><FiPlus /> Create campaign</Link>}</div>
          </div>}
        </>
      )}
    </section>
  </div>;
}
