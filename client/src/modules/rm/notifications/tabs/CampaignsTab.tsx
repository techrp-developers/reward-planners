import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { FiEdit2, FiRefreshCw, FiSearch } from "react-icons/fi";
import { notificationApi, type AttemptRow, type RecipientRow } from "../notificationApi";
import type { Campaign, Language, ManagerMeta } from "../notificationTypes";
import { Card, EmptyState, LanguageTabs, Metric, Modal, Notice, NotificationPreviews, Pagination, Spinner, StatusPill, Tag, dangerBtn, inputCls, labelCls, primaryBtn, secondaryBtn } from "../components";
import { AUDIENCE_LABELS, LANGUAGE_LABELS, SKIP_REASON_LABELS, apiErrorMessage, campaignActions, formatInZone, toNumber, toZonedInputs } from "../notificationUtils";
import { confirmDialog } from "../../../../common/utils/confirmDialog";
import type { TabNavigation } from "../NotificationManager";

const LIMIT = 20;
const SCHEDULED_STATUSES = "scheduled,sending";

export default function CampaignsTab({ meta, nav, mode }: { meta: ManagerMeta; nav: TabNavigation; mode: "scheduled" | "history" }) {
  const [filters, setFilters] = useState({ status: "", module: "", search: "" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; rows: Campaign[] } | null>(null);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);

  const load = useCallback(() => {
    const params: Record<string, string | number> = { page, limit: LIMIT };
    params.status = mode === "scheduled" ? (filters.status || SCHEDULED_STATUSES) : filters.status;
    if (!params.status) delete params.status;
    if (filters.module) params.module = filters.module;
    if (filters.search) params.search = filters.search;
    notificationApi.campaigns(params)
      .then((result) => { setData(result); setError(""); })
      .catch((requestError) => setError(apiErrorMessage(requestError)));
  }, [filters, page, mode]);
  useEffect(load, [load]);

  // Keep sending campaigns live while the tab is open.
  useEffect(() => {
    if (!data?.rows.some((row) => row.status === "sending")) return undefined;
    const timer = window.setInterval(load, 15000);
    return () => window.clearInterval(timer);
  }, [data, load]);

  if (!meta.infrastructure.campaignTables) {
    return <Card><EmptyState title="Campaign tables are not installed" text="Apply migrations/20261027_01_create_notification_campaigns.sql to enable drafts, scheduling and reports." /></Card>;
  }

  const update = (key: keyof typeof filters, value: string) => { setPage(1); setFilters({ ...filters, [key]: value }); };
  const statusOptions = mode === "scheduled"
    ? ["scheduled", "sending"]
    : ["draft", "pending_approval", "approved", "rejected", "scheduled", "sending", "completed", "partially_failed", "failed", "cancelled", "expired"];

  return (
    <>
      <Card
        title={mode === "scheduled" ? "Scheduled & queued" : "Campaign history"}
        subtitle={meta.role === "admin" ? "All campaigns" : "Campaigns you created"}
        actions={<button type="button" className={secondaryBtn} onClick={load}><FiRefreshCw /> Refresh</button>}
      >
        <div className="grid gap-3 border-b border-gray-100 p-4 sm:grid-cols-3">
          <label className="relative"><span className={labelCls}>Search</span><FiSearch className="absolute bottom-2.5 left-3 text-gray-400" />
            <input className={`${inputCls} pl-9`} placeholder="Campaign name" value={filters.search} onChange={(event) => update("search", event.target.value)} />
          </label>
          <label><span className={labelCls}>Status</span>
            <select className={inputCls} value={filters.status} onChange={(event) => update("status", event.target.value)}>
              <option value="">{mode === "scheduled" ? "All upcoming" : "All statuses"}</option>
              {statusOptions.map((status) => <option key={status} value={status}>{status.replace("_", " ")}</option>)}
            </select>
          </label>
          <label><span className={labelCls}>Module</span>
            <select className={inputCls} value={filters.module} onChange={(event) => update("module", event.target.value)}>
              <option value="">All modules</option>
              {meta.modules.filter((option) => !option.screen).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>

        {error && <div className="p-4"><Notice tone="red">{error}</Notice></div>}
        {!data && !error && <Spinner />}
        {data && !data.rows.length && <EmptyState title={mode === "scheduled" ? "Nothing scheduled" : "No campaigns yet"} action={<button type="button" className={primaryBtn} onClick={() => nav.go("compose")}>Create notification</button>} />}
        {data && data.rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead className="bg-gray-50 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-4 py-3">Campaign</th><th className="px-4 py-3">Creator</th><th className="px-4 py-3">{mode === "scheduled" ? "Next run" : "Scheduled"}</th>
                  <th className="px-4 py-3 text-right">Recipients</th><th className="px-4 py-3 text-right">Queued</th><th className="px-4 py-3 text-right">Accepted</th>
                  <th className="px-4 py-3 text-right">Failed</th><th className="px-4 py-3 text-right">Retrying</th><th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.rows.map((campaign) => (
                  <tr key={campaign.campaign_id} className="cursor-pointer hover:bg-purple-50/30" onClick={() => setOpenId(campaign.campaign_id)}>
                    <td className="px-4 py-3"><p className="font-semibold text-gray-900">{campaign.name}</p><p className="text-xs text-gray-500">#{campaign.campaign_id} · {campaign.module} · {campaign.category}</p></td>
                    <td className="px-4 py-3 text-gray-700">{campaign.created_by_name || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-600">{formatInZone(mode === "scheduled" ? campaign.next_run_at || campaign.scheduled_at : campaign.scheduled_at, campaign.timezone)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{toNumber(campaign.recipients) || (campaign.estimated_recipients != null ? `~${campaign.estimated_recipients}` : "—")}</td>
                    <td className="px-4 py-3 text-right">{toNumber(campaign.queued)}</td>
                    <td className="px-4 py-3 text-right text-emerald-700">{toNumber(campaign.firebase_accepted)}</td>
                    <td className="px-4 py-3 text-right text-red-600">{toNumber(campaign.failed)}</td>
                    <td className="px-4 py-3 text-right text-amber-700">{toNumber(campaign.pending_retry)}</td>
                    <td className="px-4 py-3"><StatusPill status={campaign.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pagination page={page} limit={LIMIT} total={data.total} onPage={setPage} />}
      </Card>

      {openId && <CampaignDetail meta={meta} nav={nav} campaignId={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </>
  );
}

function CampaignDetail({ meta, nav, campaignId, onClose, onChanged }: { meta: ManagerMeta; nav: TabNavigation; campaignId: number; onClose: () => void; onChanged: () => void }) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [section, setSection] = useState<"overview" | "recipients" | "attempts" | "audit">("overview");
  const [lang, setLang] = useState<Language>("en");
  const [busy, setBusy] = useState(false);
  const [reschedule, setReschedule] = useState({ date: "", time: "" });
  const [recipients, setRecipients] = useState<{ total: number; rows: RecipientRow[] } | null>(null);
  const [recipientStatus, setRecipientStatus] = useState("");
  const [recipientPage, setRecipientPage] = useState(1);
  const [attempts, setAttempts] = useState<{ available: boolean; rows: AttemptRow[] } | null>(null);

  const load = useCallback(() => {
    notificationApi.campaign(campaignId).then((result) => {
      setCampaign(result);
      setReschedule(toZonedInputs(result.scheduled_at, result.timezone));
    }).catch((error) => toast.error(apiErrorMessage(error)));
  }, [campaignId]);
  useEffect(load, [load]);

  useEffect(() => {
    if (section !== "recipients") return;
    const params: Record<string, string | number> = { page: recipientPage, limit: 50 };
    if (recipientStatus) params.status = recipientStatus;
    notificationApi.recipients(campaignId, params).then(setRecipients).catch((error) => toast.error(apiErrorMessage(error)));
  }, [section, campaignId, recipientStatus, recipientPage]);

  useEffect(() => {
    if (section !== "attempts") return;
    notificationApi.attempts(campaignId, { limit: 100 }).then(setAttempts).catch((error) => toast.error(apiErrorMessage(error)));
  }, [section, campaignId]);

  const run = async (label: string, action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      toast.success(label);
      load();
      onChanged();
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  // One confirmation per send. If the audience changed since the estimate,
  // the server asks for the new count and the RM confirms again.
  const sendFromDetail = async (mode: "now" | "schedule") => {
    if (!campaign) return;
    const confirm = async (recipients: number | null) => confirmDialog({
      title: mode === "now" ? "Send this notification now?" : "Schedule this notification?",
      text: `${campaign.title_en}\n\nAbout ${recipients ?? "the selected"} employees (minus anyone without consent or in quiet hours). ` +
        `${mode === "now" ? "Sends immediately." : `Sends ${reschedule.date} ${reschedule.time} (${campaign.timezone}).`} No admin approval is involved.`,
      icon: "question",
      confirmButtonText: mode === "now" ? "Send now" : "Schedule",
    });
    if (!(await confirm(campaign.estimated_recipients))) return;
    const body = { mode, ...(mode === "schedule" ? { send_date: reschedule.date, send_time: reschedule.time, timezone: campaign.timezone } : {}) };
    await run(mode === "now" ? "Queued for sending now." : "Campaign scheduled.", async () => {
      try {
        return await notificationApi.sendCampaign(campaign.campaign_id, { ...body, confirm_recipients: campaign.estimated_recipients ?? undefined });
      } catch (error) {
        const data = (error as { response?: { data?: { code?: string; recipients?: number } } }).response?.data;
        if (data?.code !== "CONFIRMATION_REQUIRED" || !(await confirm(data.recipients ?? null))) throw error;
        return notificationApi.sendCampaign(campaign.campaign_id, { ...body, confirm_recipients: data.recipients });
      }
    });
  };

  if (!campaign) return <Modal title="Campaign" onClose={onClose}><Spinner /></Modal>;
  const actions = campaignActions(campaign);
  const summary = campaign.summary;
  const showLang: Language = lang !== "en" && campaign[`title_${lang}`] ? lang : "en";
  const isApproved = lang === "en" || campaign.approved_languages.includes(lang);
  const mediaId = campaign.content_type !== "standard" && campaign.media ? campaign.media[lang] || campaign.media.default || campaign.media.en : null;
  const imageUrl = mediaId ? campaign.media_assets?.find((asset) => asset.media_id === Number(mediaId))?.public_url || null : campaign.image_url;

  return (
    <Modal title={`${campaign.name} · #${campaign.campaign_id}`} onClose={onClose} wide>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={campaign.status} />
          <Tag tone="purple">{campaign.category}</Tag>
          <Tag>{campaign.module}</Tag>
          <Tag tone="blue">{AUDIENCE_LABELS[campaign.audience_type]}</Tag>
          <span className="text-xs text-gray-500">by {campaign.created_by_name || "—"}{campaign.approved_by_name ? ` · approved by ${campaign.approved_by_name}` : ""}</span>
        </div>
        {campaign.rejection_reason && <Notice tone="red">{campaign.status === "rejected" ? "Rejected: " : ""}{campaign.rejection_reason}</Notice>}
        {(campaign.warnings || []).map((warning) => <Notice key={warning}>{warning}</Notice>)}

        <div className="flex gap-1 border-b border-gray-100">
          {(["overview", "recipients", "attempts", "audit"] as const).map((key) => (
            <button key={key} type="button" onClick={() => setSection(key)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-bold capitalize ${section === key ? "border-[#852BAF] text-[#852BAF]" : "border-transparent text-gray-500 hover:text-gray-800"}`}>
              {key === "attempts" ? "Firebase attempts" : key}
            </button>
          ))}
        </div>

        {section === "overview" && (
          <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Metric label="Recipients" value={summary?.recipients ?? 0} hint={campaign.estimated_recipients != null ? `~${campaign.estimated_recipients} estimated` : undefined} />
                <Metric label="Queued" value={summary?.queued ?? 0} tone="bg-blue-600" />
                <Metric label="Attempted" value={summary?.attempted ?? 0} tone="bg-slate-700" />
                <Metric label="Inbox created" value={summary?.inboxCreated ?? 0} hint={summary?.inboxOnly ? `${summary.inboxOnly} inbox only (no device)` : "Saved in the employees' inbox"} tone="bg-sky-600" />
                <Metric label="Accepted by Firebase" value={summary?.firebaseAccepted ?? 0} hint="Not proof of display on the phone" tone="bg-emerald-600" />
                <Metric label="Opened" value={summary?.opened ?? "Not tracked"} hint={summary?.opened == null ? "Needs the updated app" : "Taps reported by the app"} tone="bg-violet-600" />
                <Metric label="Failed" value={summary?.failed ?? 0} tone="bg-red-600" />
                <Metric label="Skipped" value={summary?.skipped ?? 0} hint={summary?.pendingRetry ? `${summary.pendingRetry} retrying` : "Consent, quiet hours, caps"} tone="bg-amber-500" />
              </div>
              <dl className="grid gap-2 rounded-xl bg-gray-50 p-4 text-xs sm:grid-cols-2">
                <div><dt className="font-bold text-gray-500">Delivery</dt><dd className="text-gray-800">{campaign.delivery_mode === "now" ? "Immediately" : campaign.delivery_mode === "once" ? "Once" : `Repeats ${campaign.recurrence_type}`}</dd></div>
                <div><dt className="font-bold text-gray-500">Scheduled ({campaign.timezone})</dt><dd className="text-gray-800">{formatInZone(campaign.scheduled_at, campaign.timezone)}</dd></div>
                <div><dt className="font-bold text-gray-500">Next run</dt><dd className="text-gray-800">{formatInZone(campaign.next_run_at, campaign.timezone)}</dd></div>
                <div><dt className="font-bold text-gray-500">Occurrences started</dt><dd className="text-gray-800">{campaign.occurrences_started}{campaign.max_occurrences ? ` / ${campaign.max_occurrences}` : ""}</dd></div>
                <div><dt className="font-bold text-gray-500">Expires</dt><dd className="text-gray-800">{formatInZone(campaign.expires_at, campaign.timezone)}</dd></div>
                <div><dt className="font-bold text-gray-500">Content</dt><dd className="capitalize text-gray-800">{campaign.content_type || "standard"}</dd></div>
                <div><dt className="font-bold text-gray-500">Opens on tap</dt><dd className="text-gray-800">
                  {campaign.destination ? `${campaign.destination.label}${campaign.destination_id ? ` #${campaign.destination_id}` : ""}` : campaign.target_screen || "Module default"}
                  {campaign.destination?.mobileRoute === "proposed" && <span className="block text-[11px] text-amber-700">App route pending; falls back to module home</span>}
                </dd></div>
              </dl>
              {(campaign.catalog_products || []).length > 0 && (
                <div className="rounded-xl border border-gray-100 p-3">
                  <p className="mb-2 text-xs font-extrabold uppercase tracking-wider text-gray-500">Products (live)</p>
                  <div className="space-y-1.5">
                    {campaign.catalog_products!.map((product) => (
                      <div key={product.product_id} className="flex items-center gap-2 text-sm">
                        {product.image_url && <img src={product.image_url} alt="" className="h-8 w-8 rounded object-cover" />}
                        <span className="min-w-0 flex-1 truncate">{product.product_name}</span>
                        <span className={`text-xs ${product.available ? "text-gray-600" : "font-semibold text-red-600"}`}>{product.available ? `₹${product.price_from} · ${product.stock} in stock` : "unavailable"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <LanguageTabs value={lang} onChange={setLang} approved={campaign.approved_languages} available={{ hi: Boolean(campaign.title_hi), mr: Boolean(campaign.title_mr) }} />
              <NotificationPreviews title={campaign[`title_${showLang}`] || ""} message={campaign[`body_${showLang}`] || ""} imageUrl={imageUrl}
                note={showLang !== lang ? `No ${LANGUAGE_LABELS[lang]} text: English is sent.` : !isApproved ? `${LANGUAGE_LABELS[lang]} is not approved: English is sent unless approved below.` : "Placeholders are filled per employee at send time."} />

              {["pending_approval", "approved", "rejected"].includes(campaign.status) && (
                <Notice tone="blue">Created under the old approval workflow. No approval is needed any more: you can send or schedule it directly.</Notice>
              )}

              {(actions.sendNow || actions.schedule) && (
                <div className="space-y-3 rounded-xl border border-gray-100 p-4">
                  <p className="text-xs font-extrabold uppercase tracking-wider text-gray-500">{campaign.status === "scheduled" ? "Change delivery" : "Send"}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="date" className={inputCls} value={reschedule.date} onChange={(event) => setReschedule({ ...reschedule, date: event.target.value })} aria-label="Send date" />
                    <input type="time" className={inputCls} value={reschedule.time} onChange={(event) => setReschedule({ ...reschedule, time: event.target.value })} aria-label="Send time" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={primaryBtn} disabled={busy || !meta.firebase.enabled} title={meta.firebase.enabled ? undefined : "Push sending is not configured on the server"}
                      onClick={() => sendFromDetail("now")}>Send now</button>
                    <button type="button" className={secondaryBtn} disabled={busy || !reschedule.date || !reschedule.time}
                      onClick={() => sendFromDetail("schedule")}>{campaign.status === "scheduled" ? "Save new time" : "Schedule"} ({campaign.timezone})</button>
                  </div>
                  {!meta.firebase.enabled && <p className="text-xs text-amber-700">Firebase is not configured: scheduled campaigns wait until it is.</p>}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {actions.edit && <button type="button" className={secondaryBtn} onClick={() => { onClose(); nav.go("compose", { campaign: String(campaign.campaign_id) }); }}><FiEdit2 /> Edit</button>}
                {actions.test && <button type="button" className={secondaryBtn} disabled={busy || !meta.testUsers.length} onClick={() => run("Test sent to the configured test users.", () => notificationApi.testCampaign(campaign.campaign_id))}>Send test</button>}
                {actions.retry && <button type="button" className={secondaryBtn} disabled={busy || !meta.firebase.enabled} onClick={() => run("Retryable failures were queued again.", () => notificationApi.retryCampaign(campaign.campaign_id))}>Retry failed</button>}
                {actions.cancel && <button type="button" className={dangerBtn} disabled={busy} onClick={async () => {
                  const ok = await confirmDialog({ title: "Cancel this campaign?", text: "Unsent notifications are cancelled. Messages already sent cannot be recalled.", confirmButtonText: "Cancel campaign" });
                  if (ok) run("Campaign cancelled.", () => notificationApi.cancelCampaign(campaign.campaign_id));
                }}>Cancel campaign</button>}
              </div>
            </div>
          </div>
        )}

        {section === "recipients" && (
          <div className="space-y-3">
            <select className={`${inputCls} max-w-xs`} value={recipientStatus} onChange={(event) => { setRecipientPage(1); setRecipientStatus(event.target.value); }}>
              <option value="">All recipients</option>
              {["pending", "processing", "sent", "inbox_only", "failed", "skipped", "cancelled"].map((status) => <option key={status} value={status}>{status === "sent" ? "accepted by Firebase" : status.replace("_", " ")}</option>)}
            </select>
            {!recipients ? <Spinner /> : !recipients.rows.length ? <EmptyState title="No recipients yet" text="Recipients are created when the campaign starts sending." /> : (
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-gray-50 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                    <tr><th className="px-3 py-2">Employee</th><th className="px-3 py-2">Run</th><th className="px-3 py-2">Language</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Devices</th><th className="px-3 py-2">Detail</th><th className="px-3 py-2">Inbox</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {recipients.rows.map((row) => (
                      <tr key={row.recipient_id}>
                        <td className="px-3 py-2"><p className="font-semibold text-gray-900">{row.name || `User ${row.user_id}`}</p><p className="text-xs text-gray-500">{row.company_name}</p></td>
                        <td className="px-3 py-2 text-xs">#{row.occurrence_no}</td>
                        <td className="px-3 py-2 text-xs">{LANGUAGE_LABELS[row.language] || row.language}</td>
                        <td className="px-3 py-2"><Tag tone={row.status === "sent" ? "green" : row.status === "failed" ? "red" : row.status === "skipped" ? "amber" : row.status === "inbox_only" ? "blue" : "gray"}>{row.status === "sent" ? "accepted by Firebase" : row.status.replace("_", " ")}</Tag></td>
                        <td className="px-3 py-2 text-xs">{row.devices_accepted}/{row.devices_attempted} accepted · {row.attempts} tries</td>
                        <td className="px-3 py-2 text-xs text-gray-600">{SKIP_REASON_LABELS[row.skip_reason || ""] || row.skip_reason || row.last_error_code || "—"}</td>
                        <td className="px-3 py-2 text-xs">{row.is_read === null ? "—" : row.is_read ? "Read" : "Unread"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Pagination page={recipientPage} limit={50} total={recipients.total} onPage={setRecipientPage} />
              </div>
            )}
          </div>
        )}

        {section === "attempts" && (
          !attempts ? <Spinner /> : !attempts.available
            ? <Notice>Per-device attempts need the <code>notification_push_attempts</code> table (migration 20261026_02).</Notice>
            : !attempts.rows.length ? <EmptyState title="No Firebase attempts recorded yet" /> : (
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-gray-50 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                    <tr><th className="px-3 py-2">Time</th><th className="px-3 py-2">User</th><th className="px-3 py-2">Platform</th><th className="px-3 py-2">Firebase project</th><th className="px-3 py-2">Try</th><th className="px-3 py-2">Result</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {attempts.rows.map((row) => (
                      <tr key={row.attempt_id}>
                        <td className="whitespace-nowrap px-3 py-2 text-xs">{formatInZone(row.created_at)}</td>
                        <td className="px-3 py-2 text-xs">{row.user_id}</td>
                        <td className="px-3 py-2 text-xs">{row.platform || "—"}</td>
                        <td className="px-3 py-2 font-mono text-[11px]">{row.firebase_project_id || "—"}</td>
                        <td className="px-3 py-2 text-xs">{row.attempt_no}</td>
                        <td className="px-3 py-2">{row.status === "accepted" ? <Tag tone="green">Accepted by FCM</Tag> : <Tag tone="red">{row.error_code || "Failed"}</Tag>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
        )}

        {section === "audit" && (
          <ol className="space-y-2">
            {(campaign.audit || []).map((entry) => (
              <li key={entry.audit_id} className="flex items-start justify-between gap-3 rounded-xl border border-gray-100 px-3 py-2 text-sm">
                <div>
                  <p className="font-semibold capitalize text-gray-900">{entry.action.replace(/_/g, " ")} {entry.decision === "denied" && <Tag tone="red">denied</Tag>}</p>
                  {entry.details && <p className="text-xs text-gray-500">{Object.entries(entry.details).map(([key, value]) => `${key.replace(/_/g, " ")}: ${Array.isArray(value) ? value.join(", ") : String(value)}`).join(" · ")}</p>}
                </div>
                <p className="shrink-0 text-right text-xs text-gray-500">{entry.actor_name || entry.actor_role}<br />{formatInZone(entry.created_at)}</p>
              </li>
            ))}
            {!campaign.audit?.length && <EmptyState title="No audit entries" />}
          </ol>
        )}
      </div>
    </Modal>
  );
}
