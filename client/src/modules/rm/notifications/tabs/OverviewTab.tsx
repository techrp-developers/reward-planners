import { useEffect, useState } from "react";
import { notificationApi, type OverviewData } from "../notificationApi";
import type { ManagerMeta } from "../notificationTypes";
import { Card, Metric, Notice, Spinner, inputCls, labelCls, secondaryBtn } from "../components";
import { apiErrorMessage } from "../notificationUtils";
import type { TabNavigation } from "../NotificationManager";

export default function OverviewTab({ meta, nav }: { meta: ManagerMeta; nav: TabNavigation }) {
  const [filters, setFilters] = useState({ module: "", from: "", to: "" });
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
    notificationApi.overview(params)
      .then((result) => { if (active) { setData(result); setError(""); } })
      .catch((requestError) => { if (active) setError(apiErrorMessage(requestError)); });
    return () => { active = false; };
  }, [filters]);

  return (
    <div className="space-y-5">
      <Card>
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          <label>
            <span className={labelCls}>Module</span>
            <select className={inputCls} value={filters.module} onChange={(event) => setFilters({ ...filters, module: event.target.value })}>
              <option value="">All modules</option>
              {meta.modules.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label><span className={labelCls}>From</span><input type="date" className={inputCls} value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></label>
          <label><span className={labelCls}>To</span><input type="date" className={inputCls} value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></label>
        </div>
      </Card>

      {error && <Notice tone="red">{error}</Notice>}
      {!data && !error && <Spinner />}
      {data && (
        <>
          <div>
            <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wider text-gray-500">Operational</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Notification records" value={data.operational.notificationRecords} hint={`${data.operational.campaignNotificationRecords.toLocaleString()} from campaigns`} />
              <Metric label="Read in inbox" value={data.operational.readInInbox} hint="Inbox read status, not push opens" tone="bg-emerald-600" />
              <Metric label="Templates" value={data.operational.templates} hint={`${data.operational.enabledTemplates} enabled`} tone="bg-blue-600" />
              <Metric label="Active registrations" value={data.operational.androidRegistrations + data.operational.iosRegistrations}
                hint={`${data.operational.androidRegistrations} Android · ${data.operational.iosRegistrations} iOS${data.operational.unknownPlatformRegistrations ? ` · ${data.operational.unknownPlatformRegistrations} unknown` : ""}`} tone="bg-slate-800" />
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wider text-gray-500">Campaigns</h2>
            {data.campaigns ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="Scheduled / sending" value={data.campaigns.scheduled} tone="bg-violet-600" />
                <Metric label="Drafts" value={data.campaigns.drafts + data.campaigns.pendingApproval + data.campaigns.approved} hint="Not sent yet (includes legacy reviewed items)" tone="bg-amber-500" />
                <Metric label="Completed" value={data.campaigns.completed} tone="bg-emerald-600" />
                <Metric label="Failed" value={data.campaigns.failed} tone="bg-red-600" />
              </div>
            ) : <Notice>Campaign metrics appear once the campaign tables are installed.</Notice>}
          </div>

          <div>
            <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wider text-gray-500">Push delivery (selected period)</h2>
            {data.attempts ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <Metric label="Accepted by Firebase" value={data.attempts.firebaseAccepted} hint="FCM accepted the message; device display is not measured" tone="bg-emerald-600" />
                <Metric label="Failed send attempts" value={data.attempts.failed} tone="bg-red-600" />
                <Metric label="Opened" value="Not tracked" hint="The app does not report notification taps yet" tone="bg-gray-400" />
              </div>
            ) : <Notice>Per-device delivery results need <code>notification_push_attempts</code> (migration 20261026_02). Sending still works without it.</Notice>}
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondaryBtn} onClick={() => nav.go("compose")}>Create notification</button>
            <button type="button" className={secondaryBtn} onClick={() => nav.go("scheduled")}>View scheduled</button>
          </div>
        </>
      )}
    </div>
  );
}
