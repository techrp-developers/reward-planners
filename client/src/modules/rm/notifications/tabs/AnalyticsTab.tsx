import { useEffect, useState } from "react";
import { notificationApi, type AnalyticsData } from "../notificationApi";
import type { ManagerMeta } from "../notificationTypes";
import { Card, EmptyState, Notice, Spinner, inputCls, labelCls } from "../components";
import { LANGUAGE_LABELS, SKIP_REASON_LABELS, apiErrorMessage, toNumber } from "../notificationUtils";

const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "—");

export default function AnalyticsTab({ meta }: { meta: ManagerMeta }) {
  const [range, setRange] = useState({ from: "", to: "" });
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!meta.infrastructure.campaignTables) return undefined;
    let active = true;
    notificationApi.analytics(Object.fromEntries(Object.entries(range).filter(([, value]) => value)))
      .then((result) => { if (active) { setData(result); setError(""); } })
      .catch((requestError) => { if (active) setError(apiErrorMessage(requestError)); });
    return () => { active = false; };
  }, [range, meta.infrastructure.campaignTables]);

  if (!meta.infrastructure.campaignTables) {
    return <Card><EmptyState title="Analytics need the campaign tables" text="Apply migrations/20261027_01_create_notification_campaigns.sql." /></Card>;
  }

  return (
    <div className="space-y-5">
      <Card>
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          <label><span className={labelCls}>From</span><input type="date" className={inputCls} value={range.from} onChange={(event) => setRange({ ...range, from: event.target.value })} /></label>
          <label><span className={labelCls}>To</span><input type="date" className={inputCls} value={range.to} onChange={(event) => setRange({ ...range, to: event.target.value })} /></label>
          <p className="self-end pb-2 text-xs text-gray-500">“Accepted” means Firebase accepted the push. “Read” is the in-app inbox read flag; push taps are not tracked.</p>
        </div>
      </Card>
      {error && <Notice tone="red">{error}</Notice>}
      {!data && !error && <Spinner />}
      {data && (
        <>
          <Card title="By module">
            {!data.byModule.length ? <EmptyState title="No campaign deliveries in this period" /> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-gray-50 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                    <tr><th className="px-4 py-3">Module</th><th className="px-4 py-3 text-right">Campaigns</th><th className="px-4 py-3 text-right">Recipients</th><th className="px-4 py-3 text-right">Sent to inbox</th><th className="px-4 py-3 text-right">Accepted by Firebase</th><th className="px-4 py-3 text-right">Failed</th><th className="px-4 py-3 text-right">Skipped</th><th className="px-4 py-3 text-right">Read in inbox</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.byModule.map((row) => (
                      <tr key={row.module}>
                        <td className="px-4 py-3 font-semibold text-gray-900">{row.module}</td>
                        <td className="px-4 py-3 text-right">{toNumber(row.campaigns)}</td>
                        <td className="px-4 py-3 text-right">{toNumber(row.recipients)}</td>
                        <td className="px-4 py-3 text-right">{toNumber(row.sent)}</td>
                        <td className="px-4 py-3 text-right text-emerald-700">{toNumber(row.firebase_accepted)} <span className="text-xs text-gray-400">({pct(toNumber(row.firebase_accepted), toNumber(row.recipients))})</span></td>
                        <td className="px-4 py-3 text-right text-red-600">{toNumber(row.failed)}</td>
                        <td className="px-4 py-3 text-right text-amber-700">{toNumber(row.skipped)}</td>
                        <td className="px-4 py-3 text-right">{toNumber(row.read_in_inbox)} <span className="text-xs text-gray-400">({pct(toNumber(row.read_in_inbox), toNumber(row.sent))})</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Delivered language" subtitle="The language actually sent (after English fallback)">
              {!data.byLanguage.length ? <EmptyState title="No data" /> : (
                <table className="w-full text-left text-sm">
                  <tbody className="divide-y divide-gray-100">
                    {data.byLanguage.map((row) => (
                      <tr key={row.language}><td className="px-5 py-3 font-semibold">{LANGUAGE_LABELS[row.language] || row.language}</td><td className="px-5 py-3 text-right">{toNumber(row.sent)} sent of {toNumber(row.recipients)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
            <Card title="Not sent: reasons">
              {!data.skipReasons.length ? <EmptyState title="Nothing skipped or failed" /> : (
                <table className="w-full text-left text-sm">
                  <tbody className="divide-y divide-gray-100">
                    {data.skipReasons.map((row) => (
                      <tr key={`${row.status}-${row.reason}`}><td className="px-5 py-3">{SKIP_REASON_LABELS[row.reason || ""] || row.reason || "Unknown"} <span className="text-xs text-gray-400">({row.status})</span></td><td className="px-5 py-3 text-right font-semibold">{toNumber(row.total)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>

          <Card title="Daily results" subtitle="Last 31 days with activity">
            {!data.byDay.length ? <EmptyState title="No data" /> : (
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-[11px] font-bold uppercase tracking-wider text-gray-500"><tr><th className="px-5 py-3">Day</th><th className="px-5 py-3 text-right">Sent</th><th className="px-5 py-3 text-right">Accepted by Firebase</th><th className="px-5 py-3 text-right">Failed</th></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {data.byDay.map((row) => (
                    <tr key={row.day}><td className="px-5 py-3">{String(row.day).slice(0, 10)}</td><td className="px-5 py-3 text-right">{toNumber(row.sent)}</td><td className="px-5 py-3 text-right text-emerald-700">{toNumber(row.firebase_accepted)}</td><td className="px-5 py-3 text-right text-red-600">{toNumber(row.failed)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
