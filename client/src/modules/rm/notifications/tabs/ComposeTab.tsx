import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FiCheckCircle, FiSave, FiSend, FiUsers, FiX, FiZap } from "react-icons/fi";
import { notificationApi, type CampaignInput, type TestResult } from "../notificationApi";
import type { AudiencePreview, AudienceType, Campaign, Category, DeliveryMode, Language, ManagerMeta, RecurrenceType, RenderedPreview, Template } from "../notificationTypes";
import { Card, LanguageTabs, Modal, Notice, PushPreview, Spinner, Tag, inputCls, labelCls, primaryBtn, secondaryBtn } from "../components";
import { AUDIENCE_LABELS, LANGUAGE_LABELS, SKIP_REASON_LABELS, apiErrorMessage, campaignVariablesNeeded, toZonedInputs } from "../notificationUtils";
import { confirmDialog } from "../../../../common/utils/confirmDialog";
import type { TabNavigation } from "../NotificationManager";

const TIMEZONES = ["Asia/Kolkata", "UTC", "Asia/Dubai", "Asia/Singapore", "Europe/London", "America/New_York"];

interface FormState {
  name: string;
  source: "template" | "manual";
  template_id: number | null;
  module: string;
  category: Category;
  priority: "low" | "normal" | "high";
  title_en: string; body_en: string; title_hi: string; body_hi: string; title_mr: string; body_mr: string;
  approved_languages: Language[];
  variables: Record<string, string>;
  target_screen: string;
  reference_type: string;
  reference_id: string;
  image_url: string;
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
  name: "", source: "manual", template_id: null, module: "common", category: "marketing", priority: "normal",
  title_en: "", body_en: "", title_hi: "", body_hi: "", title_mr: "", body_mr: "",
  approved_languages: [], variables: {}, target_screen: "", reference_type: "", reference_id: "", image_url: "",
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
    module: moduleValueFor(meta, campaign), category: campaign.category, priority: campaign.priority,
    title_en: campaign.title_en, body_en: campaign.body_en,
    title_hi: campaign.title_hi || "", body_hi: campaign.body_hi || "", title_mr: campaign.title_mr || "", body_mr: campaign.body_mr || "",
    approved_languages: campaign.approved_languages, variables: campaign.variables || {},
    target_screen: campaign.target_screen || "", reference_type: campaign.reference_type || "", reference_id: campaign.reference_id || "",
    image_url: campaign.image_url || "", audience_type: campaign.audience_type,
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
    title_en: form.title_en, body_en: form.body_en, title_hi: form.title_hi, body_hi: form.body_hi, title_mr: form.title_mr, body_mr: form.body_mr,
    approved_languages: form.approved_languages, variables: form.variables,
    target_screen: form.target_screen || null, reference_type: form.reference_type || null, reference_id: form.reference_id || null,
    image_url: form.image_url || null, audience_type: form.audience_type,
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
  const isAdmin = meta.role === "admin";
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
  const [companies, setCompanies] = useState<{ company_id: number; company_name: string; active_employees: number }[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [employeeResults, setEmployeeResults] = useState<{ user_id: number; name: string; company_name: string | null }[]>([]);
  const [selectedNames, setSelectedNames] = useState<Record<number, string>>({});

  const editable = !campaign || (campaign.can_manage && (
    ["draft", "rejected", "pending_approval", "approved"].includes(campaign.status) ||
    (campaign.status === "scheduled" && Number(campaign.occurrences_started) === 0)
  ));
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    notificationApi.templates({ usable: 1, limit: 100 }).then((result) => setTemplates(result.rows)).catch(() => setTemplates([]));
    notificationApi.companies().then(setCompanies).catch(() => setCompanies([]));
  }, []);

  // Load an existing campaign, or start from a template chosen in the library.
  useEffect(() => {
    let active = true;
    if (campaignId) {
      setLoading(true);
      notificationApi.campaign(campaignId)
        .then((result) => { if (active) { setCampaign(result); setForm(fromCampaign(meta, result)); } })
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

  const audienceKey = JSON.stringify([form.audience_type, form.user_ids, form.company_ids, form.audience_module, form.category]);
  useEffect(() => {
    setAudience(null);
    const timer = window.setTimeout(() => {
      notificationApi.previewAudience({
        audience_type: form.audience_type,
        audience_filter: { user_ids: form.user_ids, company_ids: form.company_ids, module: form.audience_module || null },
        category: form.category,
      }).then(setAudience).catch((error) => setAudience({ allowed: false, reason: apiErrorMessage(error) }));
    }, 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audienceKey]);

  useEffect(() => {
    if (!["individual", "selected"].includes(form.audience_type) || employeeSearch.trim().length < 2) { setEmployeeResults([]); return undefined; }
    const timer = window.setTimeout(() => {
      notificationApi.employees({ search: employeeSearch.trim() }).then(setEmployeeResults).catch(() => setEmployeeResults([]));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [employeeSearch, form.audience_type]);

  const audienceOptions = meta.audienceTypes.filter((type) => (type === "all_companies" ? isAdmin : type === "assigned_companies" ? !isAdmin : true));

  const save = async (): Promise<Campaign | null> => {
    setBusy("save");
    try {
      const input = toInput(form);
      const saved = campaign ? await notificationApi.updateCampaign(campaign.campaign_id, input) : await notificationApi.createCampaign(input);
      if (saveAsTemplate) {
        try {
          await notificationApi.createTemplate({
            template_key: form.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 90) || `campaign_${saved.campaign_id}`,
            module: form.module, notification_type: form.category === "engagement" ? "engagement" : "marketing", priority: form.priority,
            title_en: form.title_en, body_en: form.body_en, title_hi: form.title_hi, body_hi: form.body_hi, title_mr: form.title_mr, body_mr: form.body_mr,
          });
          toast.success("Also saved as a reusable template (disabled until an admin enables it).");
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
    const saved = await save();
    if (!saved) return;
    setBusy("test");
    try {
      setTestResults(await notificationApi.testCampaign(saved.campaign_id, previewLang === "en" ? {} : { language: previewLang }));
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const submit = async () => {
    const ok = await confirmDialog({
      title: "Submit for approval?",
      text: `An admin will review this campaign for ${audience?.eligible ?? "the selected"} eligible employees. Nothing is sent until it is approved and scheduled.`,
      icon: "question",
      confirmButtonText: "Submit",
    });
    if (!ok) return;
    const saved = await save();
    if (!saved) return;
    setBusy("submit");
    try {
      await notificationApi.submitCampaign(saved.campaign_id);
      toast.success("Submitted for approval.");
      nav.go("campaigns");
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <Spinner />;

  const titleField = `title_${lang}` as const;
  const bodyField = `body_${lang}` as const;
  const shown = rendered?.[previewLang];
  const detailScreen = form.target_screen === "OrderDetails" || form.target_screen === "ServiceOrderDetails";

  return (
    <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
      <div className="space-y-5">
        {!tablesReady && <Notice>Saving, testing and submitting need the campaign tables. You can still compose and preview here.</Notice>}
        {campaign && (
          <Notice tone={campaign.status === "rejected" ? "red" : "blue"}>
            Editing campaign #{campaign.campaign_id} ({campaign.status.replace("_", " ")}).
            {campaign.status === "rejected" && campaign.rejection_reason && <> Rejected: “{campaign.rejection_reason}”.</>}
            {campaign.status !== "draft" && editable && " Saving changes returns it to draft and needs a new approval."}
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
                {selectedTemplate && !selectedTemplate.is_enabled && <p className="mt-1 text-xs font-semibold text-amber-700">This template is disabled: you can draft and test, but it cannot be submitted until an admin enables it.</p>}
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
                <option value="announcement">Announcement (company information)</option>
              </select>
            </label>
            <label><span className={labelCls}>Priority</span>
              <select className={inputCls} disabled={!editable} value={form.priority} onChange={(event) => set("priority", event.target.value as FormState["priority"])}>
                <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option>
              </select>
            </label>
            <label><span className={labelCls}>Opens app screen</span>
              <select className={inputCls} disabled={!editable} value={form.target_screen} onChange={(event) => set("target_screen", event.target.value)}>
                <option value="">Default for module</option>
                {meta.targetScreens.map((screen) => <option key={screen} value={screen}>{screen}</option>)}
              </select>
            </label>
            {detailScreen && (
              <>
                <label><span className={labelCls}>Reference type</span><input className={inputCls} disabled={!editable} placeholder={form.target_screen === "OrderDetails" ? "order" : "service_order"} value={form.reference_type} onChange={(event) => set("reference_type", event.target.value)} /></label>
                <label><span className={labelCls}>Reference ID *</span><input className={inputCls} disabled={!editable} value={form.reference_id} onChange={(event) => set("reference_id", event.target.value)} /></label>
              </>
            )}
            <label className="sm:col-span-2"><span className={labelCls}>Image URL (optional, https on an approved host)</span><input className={inputCls} disabled={!editable} placeholder="https://cdn.rewardplanners.com/…" value={form.image_url} onChange={(event) => set("image_url", event.target.value)} /></label>
          </div>
        </Card>

        <Card title="3. Message" subtitle="Employees receive the language chosen in their app. Unapproved or missing translations fall back to English.">
          <div className="space-y-3 p-5">
            <LanguageTabs value={lang} onChange={setLang} approved={form.approved_languages} available={{ hi: Boolean(form.title_hi && form.body_hi), mr: Boolean(form.title_mr && form.body_mr) }} />
            <label className="block"><span className={labelCls}>{LANGUAGE_LABELS[lang]} title {lang === "en" && "*"}</span>
              <input className={inputCls} disabled={!editable} maxLength={255} value={form[titleField]}
                onChange={(event) => setForm((current) => ({ ...current, [titleField]: event.target.value, approved_languages: current.approved_languages.filter((item) => item !== lang) }))} />
            </label>
            <label className="block"><span className={labelCls}>{LANGUAGE_LABELS[lang]} message {lang === "en" && "*"}</span>
              <textarea className={`${inputCls} min-h-28`} disabled={!editable} maxLength={1000} value={form[bodyField]}
                onChange={(event) => setForm((current) => ({ ...current, [bodyField]: event.target.value, approved_languages: current.approved_languages.filter((item) => item !== lang) }))} />
            </label>
            <p className="text-xs text-gray-500">Use <code>{"{{first_name}}"}</code> to greet each employee by name.</p>
            {lang !== "en" && (
              isAdmin ? (
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" disabled={!editable || !(form[titleField] && form[bodyField])} checked={form.approved_languages.includes(lang)}
                    onChange={(event) => set("approved_languages", event.target.checked ? [...form.approved_languages, lang] : form.approved_languages.filter((item) => item !== lang))} />
                  I reviewed and approve this {LANGUAGE_LABELS[lang]} translation
                </label>
              ) : <p className="text-xs text-amber-700">{form.approved_languages.includes(lang) ? `${LANGUAGE_LABELS[lang]} is approved.` : `An admin reviews the ${LANGUAGE_LABELS[lang]} text during approval. Until then, employees who chose it receive English.`}</p>
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
              <p className="text-sm text-gray-600">Test users: {meta.testUsers.length ? meta.testUsers.map((user) => user.name).join(", ") : <span className="font-semibold text-amber-700">none configured (an admin sets NOTIFICATION_TEST_USER_IDS)</span>}. Use “Send test”; test-only campaigns are not submitted.</p>
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
                ) : <p className="text-sm text-gray-500">No companies are available in your scope.</p>}
              </div>
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
                <label className="block"><span className={labelCls}>Find employees (name or email)</span>
                  <input className={inputCls} disabled={!editable} value={employeeSearch} onChange={(event) => setEmployeeSearch(event.target.value)} placeholder="Type at least 2 characters" />
                </label>
                {employeeResults.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded-xl border border-gray-100">
                    {employeeResults.map((employee) => (
                      <button key={employee.user_id} type="button" className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-purple-50"
                        onClick={() => {
                          setSelectedNames((current) => ({ ...current, [employee.user_id]: employee.name }));
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
              {([["now", "Send after approval"], ["once", "Schedule once"], ["recurring", "Recurring"]] as const).map(([mode, label]) => (
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
              : <PushPreview title={shown?.title || form.title_en} message={shown?.message || form.body_en} imageUrl={form.image_url || null}
                  note={shown?.fallback ? `An employee who chose ${LANGUAGE_LABELS[previewLang]} receives English (translation missing or not approved).` : "{{first_name}} is shown as “Asha”."} />}
          </div>
        </Card>

        <Card>
          <div className="space-y-3 p-5">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" disabled={!editable} checked={saveAsTemplate} onChange={(event) => setSaveAsTemplate(event.target.checked)} /> Also save as a reusable template
            </label>
            <div className="grid gap-2">
              <button type="button" className={secondaryBtn} disabled={!tablesReady || !editable || busy !== null} onClick={saveDraft}><FiSave /> {busy === "save" ? "Saving…" : "Save draft"}</button>
              <button type="button" className={secondaryBtn} disabled={!tablesReady || busy !== null || !meta.testUsers.length || (campaign !== null && !campaign.can_manage)} onClick={sendTest}
                title={meta.testUsers.length ? "Saves, then sends to the configured test users only" : "No test users are configured"}>
                <FiZap /> {busy === "test" ? "Sending test…" : `Send test${previewLang !== "en" ? ` (${LANGUAGE_LABELS[previewLang]})` : ""}`}
              </button>
              <button type="button" className={primaryBtn} disabled={!tablesReady || !editable || busy !== null || form.audience_type === "test" || !audience?.allowed} onClick={submit}
                title={form.audience_type === "test" ? "Choose a real audience to submit" : undefined}>
                <FiSend /> {busy === "submit" ? "Submitting…" : "Submit for approval"}
              </button>
            </div>
            {campaign && <button type="button" className="w-full text-center text-xs font-bold text-[#852BAF] hover:underline" onClick={() => nav.go("compose")}>Start a new notification</button>}
          </div>
        </Card>
      </aside>

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
                  {result.errors.length > 0 && <p className="text-xs text-red-600">{result.errors.join(", ")}</p>}
                </div>
                {result.firebase_accepted > 0
                  ? <Tag tone="green"><FiCheckCircle /> Accepted on {result.firebase_accepted}/{result.devices_attempted}</Tag>
                  : <Tag tone={result.devices_attempted ? "red" : "amber"}>{result.devices_attempted ? "Not accepted" : "No device"}</Tag>}
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

