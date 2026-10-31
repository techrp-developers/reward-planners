import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FiBarChart2, FiBell, FiBriefcase, FiCalendar, FiClock, FiEdit3, FiGrid, FiLayers, FiList, FiSettings } from "react-icons/fi";
import { notificationApi } from "./notificationApi";
import type { ManagerMeta } from "./notificationTypes";
import { Notice, Spinner } from "./components";
import { apiErrorMessage } from "./notificationUtils";
import OverviewTab from "./tabs/OverviewTab";
import HistoryTab from "./tabs/HistoryTab";
import TemplatesTab from "./tabs/TemplatesTab";
import ComposeTab from "./tabs/ComposeTab";
import CampaignsTab from "./tabs/CampaignsTab";
import AnalyticsTab from "./tabs/AnalyticsTab";
import SettingsTab from "./tabs/SettingsTab";
import CompaniesTab from "./tabs/CompaniesTab";
import NotificationAccessDenied from "./NotificationAccessDenied";
import { primaryBtn } from "./components";

const TABS = [
  { key: "overview", label: "Overview", Icon: FiGrid },
  { key: "history", label: "All Notifications", Icon: FiList },
  { key: "templates", label: "Templates", Icon: FiLayers },
  { key: "compose", label: "Create Notification", Icon: FiEdit3 },
  { key: "scheduled", label: "Scheduled", Icon: FiCalendar },
  { key: "campaigns", label: "Campaign History", Icon: FiClock },
  { key: "analytics", label: "Analytics", Icon: FiBarChart2 },
  { key: "companies", label: "Manage Companies", Icon: FiBriefcase },
  { key: "settings", label: "Settings", Icon: FiSettings },
] as const;
export type TabKey = (typeof TABS)[number]["key"];

// An older backend build may omit newer fields; default them so a version
// mismatch shows reduced features instead of crashing a tab.
function normalizeMeta(data: Partial<ManagerMeta>): ManagerMeta {
  const meta = data as ManagerMeta;
  return {
    ...meta,
    modules: meta.modules ?? [],
    categories: meta.categories ?? ["marketing", "engagement", "announcement"],
    audienceTypes: meta.audienceTypes ?? ["test"],
    targetScreens: meta.targetScreens ?? [],
    contentTypes: meta.contentTypes ?? ["standard"],
    announcementTypes: meta.announcementTypes ?? [],
    destinations: meta.destinations ?? [],
    imageHosts: meta.imageHosts ?? [],
    testUsers: meta.testUsers ?? [],
    permissions: { send: false, sendAllCompanies: false, approveTranslations: false, manageCompanyAssignments: false, ...(data.permissions ?? {}) },
    limits: { promotionalDailyCap: 2, largeSendThreshold: 200, employeeTimezone: "Asia/Kolkata", ...(data.limits ?? {}) },
    infrastructure: { campaignTables: false, attemptsTable: false, mediaTables: false, ...(data.infrastructure ?? {}) },
    serverOutdated: !data.destinations || !data.permissions,
  };
}

export interface TabNavigation {
  go: (tab: TabKey, params?: Record<string, string>) => void;
}

export default function NotificationManager() {
  const [params, setParams] = useSearchParams();
  const [meta, setMeta] = useState<ManagerMeta | null>(null);
  const [error, setError] = useState("");
  // The server refuses everyone but RMs (403); show that, not a generic error.
  const [denied, setDenied] = useState(false);
  // Manage Companies is a server-granted permission (relationship managers).
  const canManageCompanies = Boolean(meta?.permissions.manageCompanyAssignments);
  const tabs = TABS.filter((item) => item.key !== "companies" || canManageCompanies);
  const requested = TABS.find((item) => item.key === params.get("tab"))?.key;
  const tab = (requested && (requested !== "companies" || canManageCompanies) ? requested : "overview") as TabKey;

  const loadMeta = useCallback(() => notificationApi.meta()
    .then((data) => { setMeta(normalizeMeta(data)); setError(""); })
    .catch((requestError) => {
      if ((requestError as { response?: { status?: number } }).response?.status === 403) { setDenied(true); return; }
      setError(apiErrorMessage(requestError, "The Notification Manager could not be loaded."));
    }), []);
  useEffect(() => { void loadMeta(); }, [loadMeta]);

  // The server verifies Firebase credentials in the background after start-up;
  // re-read its status until that check has an answer (the server times it out).
  const credentialPending = meta?.firebase.credentialCheck === "pending";
  useEffect(() => {
    if (!credentialPending) return undefined;
    const timer = setInterval(() => { void loadMeta(); }, 5000);
    return () => clearInterval(timer);
  }, [credentialPending, loadMeta]);

  const nav: TabNavigation = {
    go: (next, extra = {}) => setParams({ tab: next, ...extra }),
  };

  if (denied) return <NotificationAccessDenied />;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 pb-8">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#5f2080] via-[#852BAF] to-[#FC3F78] p-6 text-white shadow-xl shadow-purple-200/60">
        <span className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10" />
        <div className="relative">
          <p className="text-xs font-semibold text-purple-100">RM workspace / Push Notification Manager</p>
          <h1 className="mt-2 flex items-center gap-3 text-2xl font-black tracking-tight sm:text-3xl"><FiBell /> Push Notification Manager</h1>
          <p className="mt-1 max-w-2xl text-sm text-purple-100">Compose, approve and schedule push notifications. Each employee receives the approved text in the language chosen in their app.</p>
        </div>
      </section>

      <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-gray-100 bg-white p-1.5 shadow-sm" aria-label="Notification Manager sections">
        {tabs.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => nav.go(key)}
            aria-current={tab === key ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-bold transition ${tab === key ? "bg-gradient-to-r from-[#852BAF] to-[#C64EFE] text-white shadow-sm" : "text-gray-500 hover:bg-purple-50 hover:text-[#852BAF]"}`}
          >
            <Icon /> {label}
          </button>
        ))}
      </nav>

      {error && <Notice tone="red">{error}</Notice>}
      {!meta && !error && <Spinner />}
      {meta && (
        <>
          {meta.serverOutdated && (
            <Notice tone="red">The backend is running an older version than this dashboard, so some features are hidden. Restart the server (npm run dev) and reload.</Notice>
          )}
          {!meta.permissions.send && !meta.serverOutdated && (
            <Notice tone="blue">Your account can prepare notifications and send tests, but not send campaigns.</Notice>
          )}
          {!meta.infrastructure.campaignTables && (
            <Notice>Campaign tables are not installed yet, so drafts, scheduling and reports are unavailable. The server team must apply <code>migrations/20261027_01_create_notification_campaigns.sql</code>. Templates, history and overview still work.</Notice>
          )}
          {meta.role === "rm" && !meta.scope.global && meta.scope.companyCount === 0 && tab !== "companies" && (
            meta.scope.assignmentsAvailable ? (
              <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-purple-100 bg-white p-5 shadow-sm">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-purple-50 text-xl text-[#852BAF]"><FiBriefcase /></span>
                <div className="min-w-0 flex-1">
                  <p className="font-extrabold text-gray-900">No companies assigned yet</p>
                  <p className="text-sm text-gray-500">
                    {canManageCompanies
                      ? "Assign companies to start selecting employees and creating notifications. Until then you can prepare campaigns and send tests."
                      : "You can prepare campaigns and send tests, but employee audiences stay locked until companies are assigned to you."}
                  </p>
                </div>
                {canManageCompanies && <button type="button" className={primaryBtn} onClick={() => nav.go("companies")}><FiBriefcase /> Manage Companies</button>}
              </div>
            ) : (
              <Notice tone="blue">RM company assignments are not configured yet. You can prepare campaigns and send tests to authorised test users only.</Notice>
            )
          )}
          {tab === "overview" && <OverviewTab meta={meta} nav={nav} />}
          {tab === "history" && <HistoryTab meta={meta} />}
          {tab === "templates" && <TemplatesTab meta={meta} nav={nav} />}
          {tab === "compose" && <ComposeTab meta={meta} nav={nav} campaignId={Number(params.get("campaign")) || null} templateId={Number(params.get("template")) || null} />}
          {tab === "scheduled" && <CampaignsTab meta={meta} nav={nav} mode="scheduled" />}
          {tab === "campaigns" && <CampaignsTab meta={meta} nav={nav} mode="history" />}
          {tab === "analytics" && <AnalyticsTab meta={meta} />}
          {tab === "settings" && <SettingsTab meta={meta} onRefresh={loadMeta} />}
          {tab === "companies" && canManageCompanies && <CompaniesTab meta={meta} onChanged={loadMeta} />}
        </>
      )}
    </div>
  );
}
