import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FiBriefcase, FiCalendar, FiCheckCircle, FiSave, FiSend, FiUsers, FiX, FiZap } from "react-icons/fi";
import { notificationApi, type CampaignInput, type TestDeviceUser, type TestResult } from "../notificationApi";
import type { AudiencePreview, AudienceType, Campaign, Category, ContentType, DeliveryMode, Language, ManagerMeta, MediaAsset, MediaMap, RecurrenceType, RenderedPreview, Template } from "../notificationTypes";
import { Card, LanguageTabs, Modal, Notice, NotificationPreviews, Spinner, Tag, inputCls, labelCls, primaryBtn, secondaryBtn } from "../components";
import MediaDestinationSection, { type MediaDestinationValue } from "./MediaDestinationSection";
import TestDevicePicker, { type TestTarget } from "./TestDevicePicker";
import { defaultTestTarget, sendNowBlockedReason, expiryTooSoon, zonedInputsToUtc, AUDIENCE_LABELS, LANGUAGE_LABELS, SKIP_REASON_LABELS, apiErrorMessage, campaignVariablesNeeded, newClientRequestId, toZonedInputs } from "../notificationUtils";
import type { TabNavigation } from "../NotificationManager";

const TIMEZONES = ["Asia/Kolkata", "UTC", "Asia/Dubai", "Asia/Singapore", "Europe/London", "America/New_York"];

interface FormState {
  name: string;
  source: "template" | "manual";
  template_id: number | null;
  module: string;
  category: Category;
  announcement_type: string;
  priority: "low" | "normal" | "high";
  title_en: string; body_en: string; title_hi: string; body_hi: string; title_mr: string; body_mr: string;
  approved_languages: Language[];
  variables: Record<string, string>;
  target_screen: string;
  reference_type: string;
  reference_id: string;
  content_type: ContentType;
  destination_type: string;
  destination_id: string;
  catalog_product_ids: number[];
  media: MediaMap;
  audience_type: AudienceType;
  user_ids: number[];
  company_ids: number[];
  audience_module: string;
  delivery_mode: DeliveryMode;
  send_date: string; send_time: string; timezone: string;
  recurrence_type: RecurrenceType; end_date: string; max_occurrences: string;
  expiry_date: string; expiry_time: string;
}

const EMPTY: FormState = {
  name: "", source: "manual", template_id: null, module: "common", category: "marketing", announcement_type: "", priority: "normal",
  title_en: "", body_en: "", title_hi: "", body_hi: "", title_mr: "", body_mr: "",
  approved_languages: [], variables: {}, target_screen: "", reference_type: "", reference_id: "",
  content_type: "standard", destination_type: "", destination_id: "", catalog_product_ids: [], media: {},
  audience_type: "test", user_ids: [], company_ids: [], audience_module: "",
  delivery_mode: "once", send_date: "", send_time: "09:00", timezone: "Asia/Kolkata",
  recurrence_type: "none", end_date: "", max_occurrences: "", expiry_date: "", expiry_time: "",
};

function moduleValueFor(meta: ManagerMeta, campaign: Campaign): string {
  if (campaign.module === "common" && campaign.target_screen === "Support") return "support";
  return meta.modules.find((option) => option.module === campaign.module && !option.screen)?.value || "common";
}

function fromCampaign(meta: ManagerMeta, campaign: Campaign): FormState {
  const send = toZonedInputs(campaign.scheduled_at, campaign.timezone);
  const end = toZonedInputs(campaign.recurrence_end_at, campaign.timezone);
  const expiry = toZonedInputs(campaign.expires_at, campaign.timezone);
  return {
    ...EMPTY,
    name: campaign.name, source: campaign.source, template_id: campaign.template_id,
    module: moduleValueFor(meta, campaign), category: campaign.category, announcement_type: campaign.announcement_type || "", priority: campaign.priority,
    title_en: campaign.title_en, body_en: campaign.body_en,
    title_hi: campaign.title_hi || "", body_hi: campaign.body_hi || "", title_mr: campaign.title_mr || "", body_mr: campaign.body_mr || "",
    approved_languages: campaign.approved_languages, variables: campaign.variables || {},
    target_screen: campaign.target_screen || "", reference_type: campaign.reference_type || "", reference_id: campaign.reference_id || "",
    content_type: campaign.content_type || "standard", destination_type: campaign.destination_type || "", destination_id: campaign.destination_id || "",
    catalog_product_ids: (campaign.catalog_product_ids || []).map(Number), media: campaign.media || {},
    audience_type: campaign.audience_type,
    user_ids: campaign.audience_filter?.user_ids || [], company_ids: campaign.audience_filter?.company_ids || [],
    audience_module: meta.modules.find((option) => option.module === campaign.audience_filter?.module && !option.screen)?.value || "",
    delivery_mode: campaign.delivery_mode, send_date: send.date, send_time: send.time || "09:00", timezone: campaign.timezone,
    recurrence_type: campaign.recurrence_type, end_date: end.date, max_occurrences: campaign.max_occurrences ? String(campaign.max_occurrences) : "",
    expiry_date: expiry.date, expiry_time: expiry.time,
  };
}

function toInput(form: FormState): CampaignInput {
  return {
    name: form.name, source: form.source, template_id: form.template_id, module: form.module, category: form.category, priority: form.priority,
    announcement_type: form.category === "announcement" ? form.announcement_type || null : null,
    title_en: form.title_en, body_en: form.body_en, title_hi: form.title_hi, body_hi: form.body_hi, title_mr: form.title_mr, body_mr: form.body_mr,
    approved_languages: form.approved_languages, variables: form.variables,
    target_screen: form.target_screen || null, reference_type: form.reference_type || null, reference_id: form.reference_id || null,
    content_type: form.content_type, media: form.content_type === "standard" ? null : form.media,
    destination_type: form.destination_type || null, destination_id: form.destination_id || null,
    catalog_product_ids: form.content_type === "catalog" ? form.catalog_product_ids : [],
    audience_type: form.audience_type,
    audience_filter: { user_ids: form.user_ids, company_ids: form.company_ids, module: form.audience_module || null },
    delivery_mode: form.delivery_mode, timezone: form.timezone,
    send_date: form.delivery_mode === "now" ? undefined : form.send_date, send_time: form.delivery_mode === "now" ? undefined : form.send_time,
    recurrence_type: form.delivery_mode === "recurring" ? form.recurrence_type : "none",
    end_date: form.delivery_mode === "recurring" ? form.end_date : undefined,
    max_occurrences: form.delivery_mode === "recurring" && form.max_occurrences ? Number(form.max_occurrences) : null,
    expiry_date: form.expiry_date || undefined, expiry_time: form.expiry_time || undefined,
  };
}

export default function ComposeTab({ meta, nav, campaignId, templateId }: { meta: ManagerMeta; nav: TabNavigation; campaignId: number | null; templateId: number | null }) {
  const tablesReady = meta.infrastructure.campaignTables;
  const [form, setForm] = useState<FormState>(EMPTY);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(Boolean(campaignId));
  const [lang, setLang] = useState<Language>("en");
  const [previewLang, setPreviewLang] = useState<Language>("en");
  const [rendered, setRendered] = useState<Record<Language, RenderedPreview> | null>(null);
  const [audience, setAudience] = useState<AudiencePreview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[] | null>(null);
  // Send test goes to one chosen device; a ref (not just state) blocks a
  // second click that lands before React re-renders the disabled button.
  const [testUsers, setTestUsers] = useState<TestDeviceUser[] | null>(null);
  const [testTarget, setTestTarget] = useState<TestTarget>(null);
  const sending = useRef(false);
  useEffect(() => {
    if (!meta.testUsers.length) { setTestUsers([]); return; }
    let active = true;
    notificationApi.testDevices()
      .then((users) => { if (!active) return; setTestUsers(users); setTestTarget(defaultTestTarget(users)); })
      .catch(() => { if (active) setTestUsers([]); });
    return () => { active = false; };
  }, [meta.testUsers.length]);
  const [companies, setCompanies] = useState<{ company_id: number; company_name: string; active_employees: number }[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [employeeResults, setEmployeeResults] = useState<{ user_id: number; name: string; company_id: number; company_name: string | null }[]>([]);
  const [employeeSearching, setEmployeeSearching] = useState(false);
  const [selectedNames, setSelectedNames] = useState<Record<number, string>>({});
  // Company of each picked employee, so a revoked company also drops its employees.
  const [selectedCompanyOf, setSelectedCompanyOf] = useState<Record<number, number>>({});
  const [messageError, setMessageError] = useState("");
  const [assets, setAssets] = useState<Record<number, MediaAsset>>({});
  const [confirmSend, setConfirmSend] = useState<{ mode: "now" | "schedule"; campaign: Campaign } | null>(null);
  const [clientRequestId, setClientRequestId] = useState(newClientRequestId);
  const addAssets = (list: MediaAsset[]) => setAssets((current) => ({ ...current, ...Object.fromEntries(list.map((asset) => [asset.media_id, asset])) }));

  const editable = !campaign || (campaign.can_manage && (
    ["draft", "rejected", "pending_approval", "approved"].includes(campaign.status) ||
    (campaign.status === "scheduled" && Number(campaign.occurrences_started) === 0)
  ));
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    notificationApi.templates({ usable: 1, limit: 100 }).then((result) => setTemplates(result.rows)).catch(() => setTemplates([]));
  }, []);

  // Companies in scope: reloaded whenever meta is refreshed (e.g. after Manage
  // Companies), so new assignments appear and revoked ones disappear at once.
  const scopeKey = JSON.stringify([meta.scope.global, meta.scope.companyCount, meta.userId]);
  useEffect(() => {
    let active = true;
    notificationApi.companies().then((list) => { if (active) setCompanies(list); }).catch(() => { if (active) setCompanies([]); });
    return () => { active = false; };
  }, [meta]);

  // Drop selections that left the scope (revoked or deactivated company).
  useEffect(() => {
    if (meta.scope.global) return;
    const inScope = new Set(companies.map((company) => company.company_id));
    setForm((current) => {
      const companyIds = current.company_ids.filter((id) => inScope.has(id));
      const userIds = current.user_ids.filter((id) => selectedCompanyOf[id] === undefined || inScope.has(selectedCompanyOf[id]));
      return companyIds.length === current.company_ids.length && userIds.length === current.user_ids.length ? current : { ...current, company_ids: companyIds, user_ids: userIds };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companies]);

  // Load an existing campaign, or start from a template chosen in the library.
  useEffect(() => {
    let active = true;
    if (campaignId) {
      setLoading(true);
      notificationApi.campaign(campaignId)
        .then((result) => { if (active) { setCampaign(result); setForm(fromCampaign(meta, result)); addAssets(result.media_assets || []); } })
        .catch((error) => toast.error(apiErrorMessage(error, "Campaign could not be loaded.")))
        .finally(() => { if (active) setLoading(false); });
    } else {
      setCampaign(null);
      setForm(EMPTY);
    }
    return () => { active = false; };
  }, [campaignId, meta]);

  const applyTemplate = (template: Template) => {
    setForm((current) => ({
      ...current,
      source: "template",
      template_id: template.template_id,
      name: current.name || template.name,
      module: template.module_option,
      category: template.campaign_category || "marketing",
      priority: (template.priority as FormState["priority"]) || "normal",
      title_en: template.title_en, body_en: template.body_en,
      title_hi: template.title_hi || "", body_hi: template.body_hi || "",
      title_mr: template.title_mr || "", body_mr: template.body_mr || "",
      approved_languages: template.approved_languages,
    }));
  };

  useEffect(() => {
    if (!templateId || campaignId || !templates.length) return;
    const template = templates.find((item) => item.template_id === templateId);
    if (template) applyTemplate(template);
  }, [templateId, campaignId, templates]);

  const selectedTemplate = templates.find((template) => template.template_id === form.template_id) || null;
  const variablesNeeded = useMemo(() => campaignVariablesNeeded(form.title_en, form.body_en, form.title_hi, form.body_hi, form.title_mr, form.body_mr), [form.title_en, form.body_en, form.title_hi, form.body_hi, form.title_mr, form.body_mr]);

  // Server-side render: the same code path the delivery worker uses.
  const previewKey = JSON.stringify([form.title_en, form.body_en, form.title_hi, form.body_hi, form.title_mr, form.body_mr, form.variables, form.approved_languages]);
  useEffect(() => {
    if (!form.title_en || !form.body_en) { setRendered(null); return undefined; }
    const timer = window.setTimeout(() => {
      notificationApi.renderPreview(toInput({ ...form, name: form.name || "preview" })).then(setRendered).catch(() => setRendered(null));
    }, 400);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey]);

  // The scope is part of the key: a changed assignment invalidates the preview.
  // `active` discards a slower, older response so it cannot overwrite a newer one.
  const audienceKey = JSON.stringify([form.audience_type, form.user_ids, form.company_ids, form.audience_module, form.category, scopeKey]);
  useEffect(() => {
    let active = true;
    setAudience(null);
    const timer = window.setTimeout(() => {
      notificationApi.previewAudience({
        audience_type: form.audience_type,
        audience_filter: { user_ids: form.user_ids, company_ids: form.company_ids, module: form.audience_module || null },
        category: form.category,
      }).then((result) => { if (active) setAudience(result); })
        .catch((error) => { if (active) setAudience({ allowed: false, reason: apiErrorMessage(error) }); });
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audienceKey]);

  useEffect(() => {
    if (!["individual", "selected"].includes(form.audience_type) || employeeSearch.trim().length < 2) { setEmployeeResults([]); setEmployeeSearching(false); return undefined; }
    let active = true;
    setEmployeeSearching(true);
    const timer = window.setTimeout(() => {
      notificationApi.employees({ search: employeeSearch.trim() })
        .then((rows) => { if (active) setEmployeeResults(rows); })
        .catch(() => { if (active) setEmployeeResults([]); })
        .finally(() => { if (active) setEmployeeSearching(false); });
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [employeeSearch, form.audience_type, scopeKey]);

  const canManageCompanies = Boolean(meta.permissions.manageCompanyAssignments);
  const noCompaniesInScope = !meta.scope.global && companies.length === 0;
  const manageCompaniesHint = (text: string) => (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-purple-100 bg-purple-50/40 p-3">
      <p className="text-sm text-gray-600">{text}</p>
      {canManageCompanies && <button type="button" className={secondaryBtn} onClick={() => nav.go("companies")}><FiBriefcase /> Manage Companies</button>}
    </div>
  );

  // English title and message are required for every save (the server enforces it too).
  const requireMessage = () => {
    const title = form.title_en.trim();
    const body = form.body_en.trim();
    if (title && body) { setMessageError(""); return true; }
    const missing = !title && !body ? "English title and message are required." : !title ? "English title is required." : "English message is required.";
    setMessageError(missing);
    setLang("en");
    toast.error(missing);
    return false;
  };

  // all_companies needs notifications.send_all_companies (RMs on the
  // server's explicit global-sender list); RMs otherwise target assigned companies.
  const audienceOptions = meta.audienceTypes.filter((type) => (
    type === "all_companies" ? meta.permissions.sendAllCompanies : type === "assigned_companies" ? !meta.scope.global : true
  ));

  const save = async (overrides: Partial<FormState> = {}): Promise<Campaign | null> => {
    if (!requireMessage()) return null;
    setBusy("save");
    try {
      const input = toInput({ ...form, ...overrides });
      const saved = campaign
        ? await notificationApi.updateCampaign(campaign.campaign_id, input)
        : await notificationApi.createCampaign({ ...input, client_request_id: clientRequestId });
      if (saveAsTemplate) {
        try {
          await notificationApi.createTemplate({
            template_key: form.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 90) || `campaign_${saved.campaign_id}`,
            module: form.module, notification_type: form.category === "engagement" ? "engagement" : "marketing", priority: form.priority,
            title_en: form.title_en, body_en: form.body_en, title_hi: form.title_hi, body_hi: form.body_hi, title_mr: form.title_mr, body_mr: form.body_mr,
          });
          toast.success("Also saved as a reusable template (disabled until you enable it in the Template Library).");
          setSaveAsTemplate(false);
        } catch (error) {
          toast.error(`Campaign saved, but the template was not: ${apiErrorMessage(error)}`);
        }
      }
      setCampaign(saved);
      setForm(fromCampaign(meta, saved));
      if (!campaign) nav.go("compose", { campaign: String(saved.campaign_id) });
      return saved;
    } catch (error) {
      toast.error(apiErrorMessage(error));
      return null;
    } finally {
      setBusy(null);
    }
  };

  const saveDraft = async () => { if (await save()) toast.success("Draft saved. Nothing has been sent."); };

  const sendTest = async () => {
    if (!testTarget) { toast.error("Choose the test device first."); return; }
    if (sending.current) return;
    sending.current = true;
    try {
      const saved = await save();
      if (!saved) return;
      setBusy("test");
      const results = await notificationApi.testCampaign(saved.campaign_id, {
        user_id: testTarget.userId,
        device_id: testTarget.deviceId,
        ...(previewLang === "en" ? {} : { language: previewLang }),
      });
      setTestResults(results);
      if (results.some((result) => result.firebase_accepted > 0)) toast.success("Test accepted by Firebase. Check the test phone.");
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      sending.current = false;
      setBusy(null);
    }
  };

  // Send Now / Schedule: save, then one confirmation (not an approval).
  const startSend = async (mode: "now" | "schedule") => {
    if (mode === "schedule" && (form.delivery_mode === "now" || !form.send_date || !form.send_time)) {
      toast.error("Choose “Schedule once” or “Recurring” and a send date and time first.");
      return;
    }
    const saved = await save(mode === "now" ? { delivery_mode: "now" } : {});
    if (saved) setConfirmSend({ mode, campaign: saved });
  };

  const confirmAndSend = async () => {
    if (!confirmSend || sending.current) return;
    sending.current = true;
    setBusy("send");
    try {
      const { campaign: target, mode } = confirmSend;
      const result = await notificationApi.sendCampaign(target.campaign_id, {
        mode,
        ...(mode === "schedule" ? { send_date: form.send_date, send_time: form.send_time, timezone: form.timezone } : {}),
        confirm_recipients: audience?.total,
      });
      if (result.warning) toast.warning(result.warning);
      toast.success(mode === "now" ? "Queued for sending now." : "Campaign scheduled.");
      setConfirmSend(null);
      setClientRequestId(newClientRequestId());
      nav.go(mode === "now" ? "campaigns" : "scheduled");
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      sending.current = false;
      setBusy(null);
    }
  };

  if (loading) return <Spinner />;
  const sendNowBlocked = sendNowBlockedReason(meta);

  const titleField = `title_${lang}` as const;
  const bodyField = `body_${lang}` as const;
  const shown = rendered?.[previewLang];
  // The image this language's recipients get: localized, else default. The
  // text may fall back to English (shown.language) independently.
  const previewMediaId = form.content_type === "standard" ? null : form.media[previewLang] || form.media.default || form.media.en || null;
  const previewImage = previewMediaId ? assets[previewMediaId]?.public_url || null : null;
  const mediaValue: MediaDestinationValue = {
    content_type: form.content_type, destination_type: form.destination_type, destination_id: form.destination_id,
    catalog_product_ids: form.catalog_product_ids, media: form.media,
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
      <div className="space-y-5">
        {!tablesReady && <Notice>Saving, testing and submitting need the campaign tables. You can still compose and preview here.</Notice>}
        {campaign && (
          <Notice tone={campaign.status === "rejected" ? "red" : "blue"}>
            Editing campaign #{campaign.campaign_id} ({campaign.status.replace("_", " ")}).
            {campaign.status === "rejected" && campaign.rejection_reason && <> Rejected: “{campaign.rejection_reason}”.</>}
            {campaign.status === "scheduled" && editable && " Saving changes takes it off the schedule until you send or schedule it again."}
            {!editable && " This campaign can no longer be edited."}
          </Notice>
        )}

        <Card title="1. Content source">
          <div className="space-y-4 p-5">
            <div className="grid gap-2 sm:grid-cols-2">
              {(["template", "manual"] as const).map((source) => (
                <button key={source} type="button" disabled={!editable}
                  onClick={() => setForm((current) => ({ ...current, source, template_id: source === "manual" ? null : current.template_id }))}
                  className={`rounded-xl border p-4 text-left transition ${form.source === source ? "border-[#852BAF] bg-purple-50" : "border-gray-200 hover:border-purple-200"}`}>
                  <p className="font-bold text-gray-900">{source === "template" ? "Use an existing template" : "Write a new notification"}</p>
                  <p className="mt-1 text-xs text-gray-500">{source === "template" ? "Start from a stored marketing, engagement or announcement template." : "Write your own title and message."}</p>
                </button>
              ))}
            </div>
            {form.source === "template" && (
              <label className="block"><span className={labelCls}>Template</span>
                <select className={inputCls} disabled={!editable} value={form.template_id || ""} onChange={(event) => {
                  const template = templates.find((item) => item.template_id === Number(event.target.value));
                  if (template) applyTemplate(template);
                }}>
                  <option value="">Select a template…</option>
                  {templates.map((template) => <option key={template.template_id} value={template.template_id}>{template.name} ({template.notification_type}){template.is_enabled ? "" : " · disabled"}</option>)}
                </select>
                {selectedTemplate && !selectedTemplate.is_enabled && <p className="mt-1 text-xs font-semibold text-amber-700">This template is disabled: you can draft and test, but not send it until you enable it in the Template Library. To send now, enable it there or choose “Write a new notification”.</p>}
                <p className="mt-1 text-xs text-gray-500">System event templates (orders, payments, OTPs) are not listed: campaigns cannot imitate them.</p>
              </label>
            )}
          </div>
        </Card>

        <Card title="2. Details">
          <div className="grid gap-3 p-5 sm:grid-cols-2">
            <label className="sm:col-span-2"><span className={labelCls}>Campaign name *</span><input className={inputCls} disabled={!editable} maxLength={150} value={form.name} onChange={(event) => set("name", event.target.value)} /></label>
            <label><span className={labelCls}>Module *</span>
              <select className={inputCls} disabled={!editable} value={form.module} onChange={(event) => set("module", event.target.value)}>
                {meta.modules.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <span className="mt-1 block text-[11px] text-gray-400">Module is the notification category. It does not choose who receives it.</span>
            </label>
            <label><span className={labelCls}>Category *</span>
              <select className={inputCls} disabled={!editable || form.source === "template"} value={form.category} onChange={(event) => set("category", event.target.value as Category)}>
                <option value="marketing">Marketing (needs employee opt-in)</option>
                <option value="engagement">Engagement (needs employee opt-in)</option>
                <option value="announcement">Announcement (company information, no offers)</option>
              </select>
            </label>
            {form.category === "announcement" && (
              <label><span className={labelCls}>Announcement type *</span>
                <select className={inputCls} disabled={!editable} value={form.announcement_type} onChange={(event) => set("announcement_type", event.target.value)}>
                  <option value="">Select…</option>
                  {meta.announcementTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
                <span className="mt-1 block text-[11px] text-gray-400">Announcements use the Common or Support module, open Home/Announcements/Events/Support/inbox, and must not promote offers. Quiet hours and a daily limit still apply.</span>
              </label>
            )}
            <label><span className={labelCls}>Priority</span>
              <select className={inputCls} disabled={!editable} value={form.priority} onChange={(event) => set("priority", event.target.value as FormState["priority"])}>
                <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option>
              </select>
            </label>
          </div>
        </Card>

        <MediaDestinationSection
          meta={meta}
          editable={editable}
          module={form.module}
          value={mediaValue}
          onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
          assets={assets}
          onAssets={addAssets}
          approvedLanguages={form.approved_languages}
          hasHindi={Boolean(form.title_hi && form.body_hi)}
          hasMarathi={Boolean(form.title_mr && form.body_mr)}
        />

        <Card title="3. Message" subtitle="Employees receive the language chosen in their app. Unapproved or missing translations fall back to English.">
          <div className="space-y-3 p-5">
            <LanguageTabs value={lang} onChange={setLang} approved={form.approved_languages} available={{ hi: Boolean(form.title_hi && form.body_hi), mr: Boolean(form.title_mr && form.body_mr) }} />
            <label className="block"><span className={labelCls}>{LANGUAGE_LABELS[lang]} title {lang === "en" && "*"}</span>
              <input className={inputCls} disabled={!editable} maxLength={255} value={form[titleField]}
                onChange={(event) => { setMessageError(""); setForm((current) => ({ ...current, [titleField]: event.target.value, approved_languages: current.approved_languages.filter((item) => item !== lang) })); }}
                aria-invalid={lang === "en" && Boolean(messageError) && !form.title_en.trim()} />
            </label>
            <label className="block"><span className={labelCls}>{LANGUAGE_LABELS[lang]} message {lang === "en" && "*"}</span>
              <textarea className={`${inputCls} min-h-28`} disabled={!editable} maxLength={1000} value={form[bodyField]}
                onChange={(event) => { setMessageError(""); setForm((current) => ({ ...current, [bodyField]: event.target.value, approved_languages: current.approved_languages.filter((item) => item !== lang) })); }}
                aria-invalid={lang === "en" && Boolean(messageError) && !form.body_en.trim()} />
            </label>
            {messageError && <p className="text-sm font-semibold text-red-600" role="alert">{messageError}</p>}
            <p className="text-xs text-gray-500">Use <code>{"{{first_name}}"}</code> to greet each employee by name.</p>
            {lang !== "en" && (
              meta.permissions.approveTranslations ? (
                <div className="space-y-1">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" disabled={!editable || !(form[titleField] && form[bodyField])} checked={form.approved_languages.includes(lang)}
                      onChange={(event) => set("approved_languages", event.target.checked ? [...form.approved_languages, lang] : form.approved_languages.filter((item) => item !== lang))} />
                    I reviewed this {LANGUAGE_LABELS[lang]} translation and approve it for sending
                  </label>
                  <p className="text-[11px] text-gray-500">Unchecked or edited translations are never sent; those employees receive English. Check machine translations carefully.</p>
                </div>
              ) : <p className="text-xs text-amber-700">{form.approved_languages.includes(lang) ? `${LANGUAGE_LABELS[lang]} is approved.` : `${LANGUAGE_LABELS[lang]} is not approved, so employees who chose it receive English.`}</p>
            )}
            {variablesNeeded.length > 0 && (
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <p className="mb-2 text-xs font-extrabold uppercase tracking-wider text-gray-500">Placeholder values (same for every recipient)</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {variablesNeeded.map((name) => (
                    <label key={name}><span className={`${labelCls} font-mono`}>{`{{${name}}}`}</span>
                      <input className={inputCls} disabled={!editable} maxLength={200} value={form.variables[name] || ""} onChange={(event) => set("variables", { ...form.variables, [name]: event.target.value })} />
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card title="4. Audience" subtitle="Default is test users only. Your company assignments are enforced by the server.">
          <div className="space-y-4 p-5">
            <label className="block"><span className={labelCls}>Send to</span>
              <select className={inputCls} disabled={!editable} value={form.audience_type} onChange={(event) => setForm((current) => ({ ...current, audience_type: event.target.value as AudienceType, user_ids: [], company_ids: [] }))}>
                {audienceOptions.map((type) => <option key={type} value={type}>{AUDIENCE_LABELS[type]}</option>)}
              </select>
            </label>

            {form.audience_type === "test" && (
              <p className="text-sm text-gray-600">Test users: {meta.testUsers.length ? meta.testUsers.map((user) => user.name).join(", ") : <span className="font-semibold text-amber-700">none configured (set NOTIFICATION_TEST_USER_IDS in the server configuration)</span>}. Use “Send test”. To send to employees, choose a real audience.</p>
            )}

            {(form.audience_type === "company" || form.audience_type === "module_users") && (
              <div>
                <span className={labelCls}>{form.audience_type === "company" ? "Companies *" : "Limit to companies (optional)"}</span>
                {companies.length ? (
                  <div className="grid max-h-48 gap-1 overflow-y-auto rounded-xl border border-gray-100 p-2 sm:grid-cols-2">
                    {companies.map((company) => (
                      <label key={company.company_id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-gray-50">
                        <input type="checkbox" disabled={!editable} checked={form.company_ids.includes(company.company_id)}
                          onChange={(event) => set("company_ids", event.target.checked ? [...form.company_ids, company.company_id] : form.company_ids.filter((id) => id !== company.company_id))} />
                        <span className="flex-1 truncate">{company.company_name}</span><span className="text-xs text-gray-400">{company.active_employees}</span>
                      </label>
                    ))}
                  </div>
                ) : manageCompaniesHint(form.audience_type === "company" ? "No companies are assigned to you yet, so there is nothing to select." : "No companies are assigned to you yet, so this audience is empty.")}
              </div>
            )}

            {form.audience_type === "assigned_companies" && (
              companies.length ? (
                <div>
                  <span className={labelCls}>Included companies ({companies.length})</span>
                  <div className="flex flex-wrap gap-1.5">{companies.map((company) => <Tag key={company.company_id} tone="purple">{company.company_name} · {company.active_employees}</Tag>)}</div>
                </div>
              ) : manageCompaniesHint("No companies are assigned to you yet, so this audience is empty.")
            )}

            {form.audience_type === "module_users" && (
              <label className="block"><span className={labelCls}>Module users *</span>
                <select className={inputCls} disabled={!editable} value={form.audience_module} onChange={(event) => set("audience_module", event.target.value)}>
                  <option value="">Select module…</option>
                  {meta.modules.filter((option) => !option.screen).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <span className="mt-1 block text-[11px] text-gray-400">Employees who received a notification from this module in the last 90 days.</span>
              </label>
            )}

            {(form.audience_type === "individual" || form.audience_type === "selected") && (
              <div className="space-y-2">
                {noCompaniesInScope && manageCompaniesHint("No companies are assigned to you yet, so there are no employees to search.")}
                <label className="block"><span className={labelCls}>Find employees (name or email)</span>
                  <input className={inputCls} disabled={!editable || noCompaniesInScope} value={employeeSearch} onChange={(event) => setEmployeeSearch(event.target.value)} placeholder="Type at least 2 characters" />
                </label>
                {employeeSearching && <p className="text-xs text-gray-500">Searching…</p>}
                {!employeeSearching && employeeSearch.trim().length >= 2 && employeeResults.length === 0 && !noCompaniesInScope && (
                  <p className="text-xs text-gray-500">No employees in your assigned companies match “{employeeSearch.trim()}”.</p>
                )}
                {employeeResults.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded-xl border border-gray-100">
                    {employeeResults.map((employee) => (
                      <button key={employee.user_id} type="button" className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-purple-50"
                        onClick={() => {
                          setSelectedNames((current) => ({ ...current, [employee.user_id]: employee.name }));
                          setSelectedCompanyOf((current) => ({ ...current, [employee.user_id]: employee.company_id }));
                          set("user_ids", form.audience_type === "individual" ? [employee.user_id] : [...new Set([...form.user_ids, employee.user_id])]);
                        }}>
                        <span className="font-semibold text-gray-800">{employee.name}</span><span className="text-xs text-gray-500">{employee.company_name}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {form.user_ids.map((id) => (
                    <span key={id} className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2.5 py-1 text-xs font-bold text-[#852BAF]">
                      {selectedNames[id] || `Employee #${id}`}
                      {editable && <button type="button" aria-label="Remove" onClick={() => set("user_ids", form.user_ids.filter((item) => item !== id))}><FiX /></button>}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-xl bg-slate-50 p-4">
              <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-gray-500"><FiUsers /> Estimated recipients</p>
              {!audience && <p className="mt-2 text-sm text-gray-500">Calculating…</p>}
              {audience && !audience.allowed && <p className="mt-2 text-sm font-semibold text-red-600">{audience.reason}</p>}
              {audience?.allowed && (
                <div className="mt-2 space-y-1 text-sm text-gray-700">
                  <p><span className="text-2xl font-black text-gray-900">{audience.eligible?.toLocaleString()}</span> eligible of {audience.total?.toLocaleString()} active employees</p>
                  <p className="text-xs text-gray-500">
                    {audience.withDevice} with a registered device · EN {audience.languages?.en} · HI {audience.languages?.hi} · MR {audience.languages?.mr}
                    {form.category !== "announcement" && ` · ${audience.noPreferenceRecord} without a consent record (not sent)`}
                  </p>
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card title="5. Delivery">
          <div className="space-y-4 p-5">
            <div className="grid gap-2 sm:grid-cols-3">
              {([["now", "Send immediately"], ["once", "Schedule once"], ["recurring", "Recurring"]] as const).map(([mode, label]) => (
                <button key={mode} type="button" disabled={!editable} onClick={() => setForm((current) => ({ ...current, delivery_mode: mode, recurrence_type: mode === "recurring" && current.recurrence_type === "none" ? "daily" : current.recurrence_type }))}
                  className={`rounded-xl border px-3 py-2.5 text-sm font-bold transition ${form.delivery_mode === mode ? "border-[#852BAF] bg-purple-50 text-[#852BAF]" : "border-gray-200 text-gray-600 hover:border-purple-200"}`}>
                  {label}
                </button>
              ))}
            </div>
            {form.delivery_mode !== "now" && (
              <div className="grid gap-3 sm:grid-cols-3">
                <label><span className={labelCls}>{form.delivery_mode === "recurring" ? "Start date *" : "Send date *"}</span><input type="date" className={inputCls} disabled={!editable} value={form.send_date} onChange={(event) => set("send_date", event.target.value)} /></label>
                <label><span className={labelCls}>Send time *</span><input type="time" className={inputCls} disabled={!editable} value={form.send_time} onChange={(event) => set("send_time", event.target.value)} /></label>
                <label><span className={labelCls}>Timezone</span>
                  <select className={inputCls} disabled={!editable} value={form.timezone} onChange={(event) => set("timezone", event.target.value)}>
                    {TIMEZONES.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
                  </select>
                </label>
              </div>
            )}
            {form.delivery_mode === "recurring" && (
              <div className="grid gap-3 sm:grid-cols-3">
                <label><span className={labelCls}>Repeats</span>
                  <select className={inputCls} disabled={!editable} value={form.recurrence_type} onChange={(event) => set("recurrence_type", event.target.value as RecurrenceType)}>
                    <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
                  </select>
                </label>
                <label><span className={labelCls}>End date</span><input type="date" className={inputCls} disabled={!editable} value={form.end_date} onChange={(event) => set("end_date", event.target.value)} /></label>
                <label><span className={labelCls}>Max occurrences</span><input type="number" min={1} max={365} className={inputCls} disabled={!editable} value={form.max_occurrences} onChange={(event) => set("max_occurrences", event.target.value)} /></label>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-3">
              <label><span className={labelCls}>Expires on (optional)</span><input type="date" className={inputCls} disabled={!editable} value={form.expiry_date} onChange={(event) => set("expiry_date", event.target.value)} /></label>
              <label><span className={labelCls}>Expiry time</span><input type="time" className={inputCls} disabled={!editable || !form.expiry_date} value={form.expiry_time} onChange={(event) => set("expiry_time", event.target.value)} /></label>
            </div>
            {expiryTooSoon({ date: form.expiry_date, time: form.expiry_time }, form.timezone, form.delivery_mode !== "now" && form.send_date ? zonedInputsToUtc(form.send_date, form.send_time, form.timezone) ?? new Date() : new Date()) && (
              <p role="alert" className="text-xs font-semibold text-red-600">This expiry is less than 10 minutes after the send time, so the campaign would expire before it is sent. Clear the expiry or choose a later time.</p>
            )}
            <p className="text-xs text-gray-500">Times are entered in the selected timezone and stored in UTC. The server worker sends the campaign; your browser does not need to stay open.</p>
          </div>
        </Card>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
        <Card title="Live preview" subtitle="Rendered by the server, exactly as employees receive it">
          <div className="space-y-3 p-5">
            <LanguageTabs value={previewLang} onChange={setPreviewLang} approved={form.approved_languages} available={{ hi: Boolean(form.title_hi && form.body_hi), mr: Boolean(form.title_mr && form.body_mr) }} />
            {shown?.error
              ? <Notice tone="red">{shown.error}</Notice>
              : <NotificationPreviews title={shown?.title || form.title_en} message={shown?.message || form.body_en} imageUrl={previewImage}
                  note={shown?.fallback ? `An employee who chose ${LANGUAGE_LABELS[previewLang]} receives English text (translation missing or not approved).` : "{{first_name}} is shown as “Asha”."} />}
          </div>
        </Card>

        <Card>
          <div className="space-y-3 p-5">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" disabled={!editable} checked={saveAsTemplate} onChange={(event) => setSaveAsTemplate(event.target.checked)} /> Also save as a reusable template
            </label>
            {meta.testUsers.length > 0 && <TestDevicePicker users={testUsers} value={testTarget} onChange={setTestTarget} disabled={busy !== null} />}
            <div className="grid gap-2">
              <button type="button" className={secondaryBtn} disabled={!tablesReady || !editable || busy !== null} onClick={saveDraft}><FiSave /> {busy === "save" ? "Saving…" : "Save draft"}</button>
              <button type="button" className={secondaryBtn} disabled={!tablesReady || busy !== null || !meta.testUsers.length || !testTarget || (campaign !== null && !campaign.can_manage)} onClick={sendTest}
                title={!meta.testUsers.length ? "No test users are configured" : !testTarget ? "Choose the test device" : "Saves, then sends one test to the chosen device only"}>
                <FiZap /> {busy === "test" ? "Sending test…" : `Send test${previewLang !== "en" ? ` (${LANGUAGE_LABELS[previewLang]})` : ""}`}
              </button>
              {meta.permissions.send && (
                <>
                  <button type="button" className={primaryBtn} disabled={!tablesReady || !editable || busy !== null || form.audience_type === "test" || !audience?.allowed || sendNowBlocked !== null}
                    onClick={() => startSend("now")}
                    title={sendNowBlocked ?? (form.audience_type === "test" ? "Choose a real audience, or use Send test" : undefined)}>
                    <FiSend /> Send now
                  </button>
                  <button type="button" className={secondaryBtn} disabled={!tablesReady || !editable || busy !== null || form.audience_type === "test" || !audience?.allowed || form.delivery_mode === "now"}
                    onClick={() => startSend("schedule")}
                    title={form.delivery_mode === "now" ? "Choose “Schedule once” or “Recurring” in Delivery" : undefined}>
                    <FiCalendar /> Schedule
                  </button>
                </>
              )}
            </div>
            {sendNowBlocked && meta.permissions.send && (
              <p role="status" className="text-xs font-semibold text-amber-700">{sendNowBlocked}</p>
            )}
            {campaign && <button type="button" className="w-full text-center text-xs font-bold text-[#852BAF] hover:underline" onClick={() => nav.go("compose")}>Start a new notification</button>}
          </div>
        </Card>
      </aside>

      {confirmSend && (
        <Modal title={confirmSend.mode === "now" ? "Send this notification now?" : "Schedule this notification?"} onClose={() => (busy ? undefined : setConfirmSend(null))}>
          <div className="space-y-4">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="sm:col-span-2"><dt className="text-xs font-bold text-gray-500">Title (English)</dt><dd className="font-semibold text-gray-900">{confirmSend.campaign.title_en}</dd></div>
              <div><dt className="text-xs font-bold text-gray-500">Module</dt><dd>{meta.modules.find((option) => option.value === form.module)?.label || confirmSend.campaign.module}</dd></div>
              <div><dt className="text-xs font-bold text-gray-500">Audience</dt><dd>{AUDIENCE_LABELS[confirmSend.campaign.audience_type]}</dd></div>
              <div><dt className="text-xs font-bold text-gray-500">Recipients</dt><dd><span className="text-lg font-black">{audience?.eligible ?? "—"}</span> eligible of {audience?.total ?? "—"} active employees</dd></div>
              <div><dt className="text-xs font-bold text-gray-500">Delivery</dt><dd>{confirmSend.mode === "now" ? "Immediately" : `${form.send_date} ${form.send_time} (${form.timezone})${form.delivery_mode === "recurring" ? `, repeats ${form.recurrence_type}` : ""}`}</dd></div>
              <div><dt className="text-xs font-bold text-gray-500">Languages</dt><dd>English{confirmSend.campaign.approved_languages.map((code) => `, ${LANGUAGE_LABELS[code]}`).join("")}{confirmSend.campaign.approved_languages.length < 2 ? " (others receive English)" : ""}</dd></div>
              <div><dt className="text-xs font-bold text-gray-500">Image</dt><dd>{confirmSend.campaign.content_type === "standard" ? "None (text only)" : previewImage ? "Yes" : "Selected; checked again before sending"}</dd></div>
            </dl>
            {form.category !== "announcement" && <Notice tone="blue">Only employees who opted in to {form.category} notifications receive it; quiet hours and daily limits are applied.</Notice>}
            {audience?.total && audience.total > meta.limits.largeSendThreshold ? <Notice>This is a large send ({audience.total} employees). Confirming sends it to this exact audience.</Notice> : null}
            <p className="text-xs text-gray-500">This confirms your own send; no admin approval is involved. Your name is recorded in the campaign audit log.</p>
            <div className="flex justify-end gap-2">
              <button type="button" className={secondaryBtn} disabled={busy !== null} onClick={() => setConfirmSend(null)}>Back</button>
              <button type="button" className={primaryBtn} disabled={busy !== null} onClick={confirmAndSend}>
                {busy === "send" ? "Working…" : confirmSend.mode === "now" ? "Send now" : "Schedule"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {testResults && (
        <Modal title="Test send results" onClose={() => setTestResults(null)}>
          <div className="space-y-3">
            <Notice tone="blue">“Accepted by Firebase” means FCM took the message. Check the test phone to confirm it was shown.</Notice>
            {testResults.map((result) => (
              <div key={result.user_id} className="flex items-start justify-between gap-3 rounded-xl border border-gray-100 p-3">
                <div>
                  <p className="font-bold text-gray-900">{result.name}</p>
                  <p className="text-xs text-gray-500">{LANGUAGE_LABELS[result.language]} · inbox {result.inbox_saved ? "saved" : "not saved"}</p>
                  {result.skipped_reason && <p className="text-xs text-amber-700">{SKIP_REASON_LABELS[result.skipped_reason] || result.skipped_reason.replace(/_/g, " ")}</p>}
                  <p className="text-xs text-gray-500">
                    {result.image_sent ? "Sent with image" : result.image_fallback ? "Image unavailable: sent as text only" : "Text only"}
                    {result.destination ? ` · opens ${result.destination}` : ""}
                    {result.destination_blocked ? " · destination unavailable (real sends would skip)" : ""}
                  </p>
                  {result.device && <p className="text-xs text-gray-500">Device #{result.device.id} · {result.device.platform} · {result.device.token}</p>}
                  {result.errors.length > 0 && <p className="text-xs text-red-600">{result.errors.join(", ")} (not retried)</p>}
                </div>
                {result.firebase_accepted > 0
                  ? <Tag tone="green"><FiCheckCircle /> Accepted by Firebase</Tag>
                  : <Tag tone={result.devices_attempted ? "red" : "amber"}>{result.devices_attempted ? "Not accepted" : "No device"}</Tag>}
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

