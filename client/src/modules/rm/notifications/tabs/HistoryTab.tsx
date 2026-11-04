import { useEffect, useState } from "react";
import { notificationApi, type HistoryRow } from "../notificationApi";
import type { ManagerMeta } from "../notificationTypes";
import { Card, EmptyState, Notice, Pagination, Spinner, Tag, inputCls, labelCls } from "../components";
import { apiErrorMessage, formatInZone } from "../notificationUtils";

const LIMIT = 25;

export default function HistoryTab({ meta }: { meta: ManagerMeta }) {
  const [companies, setCompanies] = useState<{ company_id: number; company_name: string }[]>([]);
  const [filters, setFilters] = useState({ company_id: "", module: "", type: "", priority: "", is_read: "", source: "", campaign_status: "", from: "", to: "" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; rows: HistoryRow[] } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => { notificationApi.companies().then(setCompanies).catch(() => setCompanies([])); }, []);

  useEffect(() => {
    let active = true;
    const params: Record<string, string | number> = { page, limit: LIMIT };
    for (const [key, value] of Object.entries(filters)) if (value) params[key] = value;
    notificationApi.history(params)
      .then((result) => { if (active) { setData(result); setError(""); } })
      .catch((requestError) => { if (active) setError(apiErrorMessage(requestError)); });
    return () => { active = false; };
  }, [filters, page]);

  const update = (key: keyof typeof filters, value: string) => { setPage(1); setFilters({ ...filters, [key]: value }); };

  return (
    <Card title="All notifications" subtitle="System events and campaign messages for employees in your scope. History is read-only; send a new campaign to remind someone again.">
      <div className="grid gap-3 border-b border-gray-100 p-4 sm:grid-cols-3 lg:grid-cols-5">
        <label><span className={labelCls}>Company</span>
          <select className={inputCls} value={filters.company_id} onChange={(event) => update("company_id", event.target.value)}>
            <option value="">All companies</option>
            {companies.map((company) => <option key={company.company_id} value={company.company_id}>{company.company_name}</option>)}
          </select>
        </label>
        <label><span className={labelCls}>Module</span>
          <select className={inputCls} value={filters.module} onChange={(event) => update("module", event.target.value)}>
            <option value="">All modules</option>
            {meta.modules.filter((option) => !option.screen).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label><span className={labelCls}>Type</span><input className={inputCls} placeholder="e.g. order_paid" value={filters.type} onChange={(event) => update("type", event.target.value.trim())} /></label>
        <label><span className={labelCls}>Source</span>
          <select className={inputCls} value={filters.source} onChange={(event) => update("source", event.target.value)}>
            <option value="">System + campaign</option><option value="system">System</option><option value="campaign">Campaign</option>
          </select>
        </label>
        <label><span className={labelCls}>Campaign status</span>
          <select className={inputCls} value={filters.campaign_status} onChange={(event) => update("campaign_status", event.target.value)} disabled={!meta.infrastructure.campaignTables}>
            <option value="">Any</option>
            {["sending", "completed", "partially_failed", "failed", "cancelled"].map((status) => <option key={status} value={status}>{status.replace("_", " ")}</option>)}
          </select>
        </label>
        <label><span className={labelCls}>Priority</span>
          <select className={inputCls} value={filters.priority} onChange={(event) => update("priority", event.target.value)}>
            <option value="">Any</option><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option>
          </select>
        </label>
        <label><span className={labelCls}>Read status</span>
          <select className={inputCls} value={filters.is_read} onChange={(event) => update("is_read", event.target.value)}>
            <option value="">Any</option><option value="1">Read</option><option value="0">Unread</option>
          </select>
        </label>
        <label><span className={labelCls}>From</span><input type="date" className={inputCls} value={filters.from} onChange={(event) => update("from", event.target.value)} /></label>
        <label><span className={labelCls}>To</span><input type="date" className={inputCls} value={filters.to} onChange={(event) => update("to", event.target.value)} /></label>
      </div>

      {error && <div className="p-4"><Notice tone="red">{error}</Notice></div>}
      {!data && !error && <Spinner />}
      {data && !data.rows.length && <EmptyState title="No notifications match these filters" />}
      {data && data.rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-gray-50 text-[11px] font-bold uppercase tracking-wider text-gray-500">
              <tr><th className="px-4 py-3">Sent</th><th className="px-4 py-3">Employee</th><th className="px-4 py-3">Module / type</th><th className="px-4 py-3">Notification</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.rows.map((row) => (
                <tr key={row.notification_id} className="align-top hover:bg-purple-50/30">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">{formatInZone(row.created_at)}</td>
                  <td className="px-4 py-3"><p className="font-semibold text-gray-900">{row.employee_name || `User ${row.user_id}`}</p><p className="text-xs text-gray-500">{row.company_name || "—"}</p></td>
                  <td className="px-4 py-3"><p className="font-semibold text-gray-700">{row.module}</p><p className="text-xs text-gray-500">{row.type}</p></td>
                  <td className="max-w-sm px-4 py-3"><p className="font-semibold text-gray-900">{row.title}</p><p className="line-clamp-2 text-xs text-gray-500">{row.message}</p></td>
                  <td className="px-4 py-3">{row.source === "campaign" ? <Tag tone="purple">Campaign #{row.campaign_id}{row.language ? ` · ${row.language}` : ""}</Tag> : <Tag>System</Tag>}</td>
                  <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{row.is_read ? <Tag tone="green">Read</Tag> : <Tag tone="amber">Unread</Tag>}{row.priority === "high" && <Tag tone="red">High</Tag>}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pagination page={page} limit={LIMIT} total={data.total} onPage={setPage} />}
    </Card>
  );
}
