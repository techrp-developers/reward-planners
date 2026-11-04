import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { FiCopy, FiEdit2, FiEye, FiPlus, FiSearch, FiSend } from "react-icons/fi";
import { notificationApi } from "../notificationApi";
import type { Language, ManagerMeta, Template } from "../notificationTypes";
import { Card, EmptyState, LanguageTabs, Modal, Notice, Pagination, PushPreview, Spinner, Tag, inputCls, labelCls, primaryBtn, secondaryBtn } from "../components";
import { LANGUAGE_LABELS, apiErrorMessage } from "../notificationUtils";
import type { TabNavigation } from "../NotificationManager";

const LIMIT = 20;
type EditorState = { mode: "edit" | "create"; template: Partial<Template> } | null;

export default function TemplatesTab({ meta, nav }: { meta: ManagerMeta; nav: TabNavigation }) {
  const [filters, setFilters] = useState({ search: "", module: "", type: "", enabled: "" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; rows: Template[] } | null>(null);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<EditorState>(null);
  const [preview, setPreview] = useState<Template | null>(null);

  const load = useCallback(() => {
    const params: Record<string, string | number> = { page, limit: LIMIT };
    for (const [key, value] of Object.entries(filters)) if (value) params[key] = value;
    notificationApi.templates(params)
      .then((result) => { setData(result); setError(""); })
      .catch((requestError) => setError(apiErrorMessage(requestError)));
  }, [filters, page]);
  useEffect(load, [load]);

  const update = (key: keyof typeof filters, value: string) => { setPage(1); setFilters({ ...filters, [key]: value }); };

  return (
    <>
      <Card
        title="Template library"
        subtitle="Stored notification templates. You enable or disable marketing and engagement templates; disabled ones can be drafted with but not sent until you enable them. System event templates are managed by the backend."
        actions={<button type="button" className={primaryBtn} onClick={() => setEditor({ mode: "create", template: { notification_type: "marketing", priority: "normal", module_option: "common" } })}><FiPlus /> New template</button>}
      >
        <div className="grid gap-3 border-b border-gray-100 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="relative"><span className={labelCls}>Search</span>
            <FiSearch className="absolute bottom-2.5 left-3 text-gray-400" />
            <input className={`${inputCls} pl-9`} placeholder="Key, name or title" value={filters.search} onChange={(event) => update("search", event.target.value)} />
          </label>
          <label><span className={labelCls}>Module</span>
            <select className={inputCls} value={filters.module} onChange={(event) => update("module", event.target.value)}>
              <option value="">All modules</option>
              {meta.modules.filter((option) => !option.screen).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label><span className={labelCls}>Type</span>
            <select className={inputCls} value={filters.type} onChange={(event) => update("type", event.target.value)}>
              <option value="">All types</option><option value="transactional">Transactional</option><option value="marketing">Marketing</option><option value="engagement">Engagement</option>
            </select>
          </label>
          <label><span className={labelCls}>Status</span>
            <select className={inputCls} value={filters.enabled} onChange={(event) => update("enabled", event.target.value)}>
              <option value="">Enabled + disabled</option><option value="1">Enabled</option><option value="0">Disabled</option>
            </select>
          </label>
        </div>

        {error && <div className="p-4"><Notice tone="red">{error}</Notice></div>}
        {!data && !error && <Spinner />}
        {data && !data.rows.length && <EmptyState title="No templates match these filters" />}
        {data && data.rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-gray-50 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                <tr><th className="px-4 py-3">Template</th><th className="px-4 py-3">Module</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">English title</th><th className="px-4 py-3">Languages</th><th className="px-4 py-3">Priority</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.rows.map((template) => (
                  <tr key={template.template_id} className="hover:bg-purple-50/30">
                    <td className="px-4 py-3"><p className="font-semibold text-gray-900">{template.name}</p><p className="font-mono text-[11px] text-gray-500">{template.template_key}</p></td>
                    <td className="px-4 py-3 text-gray-700">{meta.modules.find((option) => option.value === template.module_option)?.label || template.module}</td>
                    <td className="px-4 py-3">
                      <Tag tone={template.notification_type === "transactional" ? "blue" : "purple"}>{template.notification_type}</Tag>
                      {!template.campaign_category && <p className="mt-1 text-[11px] text-gray-400">System event only</p>}
                    </td>
                    <td className="max-w-xs px-4 py-3 text-gray-700"><p className="truncate">{template.title_en}</p></td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <Tag tone="green">EN</Tag>
                        {(["hi", "mr"] as Language[]).map((lang) => (template as unknown as Record<string, boolean>)[`has_${lang}`]
                          ? <Tag key={lang} tone={template.approved_languages.includes(lang) ? "green" : "amber"}>{lang.toUpperCase()} {template.approved_languages.includes(lang) ? "approved" : "draft"}</Tag>
                          : <Tag key={lang}>{lang.toUpperCase()} —</Tag>)}
                      </div>
                    </td>
                    <td className="px-4 py-3 capitalize text-gray-700">{template.priority}</td>
                    <td className="px-4 py-3">{template.is_enabled ? <Tag tone="green">Enabled</Tag> : <Tag>Disabled</Tag>}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <IconButton label="Preview" onClick={() => setPreview(template)}><FiEye /></IconButton>
                        <IconButton label="Edit" onClick={() => setEditor({ mode: "edit", template })}><FiEdit2 /></IconButton>
                        <IconButton label="Duplicate" onClick={() => setEditor({
                          mode: "create",
                          template: { ...template, template_key: `${template.template_key}_copy`.slice(0, 100), notification_type: template.campaign_category === "engagement" ? "engagement" : "marketing", approved_languages: [] },
                        })}><FiCopy /></IconButton>
                        <IconButton
                          label={template.campaign_category ? "Use template" : "Event templates are sent by the system and cannot be used for campaigns"}
                          disabled={!template.campaign_category}
                          onClick={() => nav.go("compose", { template: String(template.template_id) })}
                        ><FiSend /></IconButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pagination page={page} limit={LIMIT} total={data.total} onPage={setPage} />}
      </Card>

      {preview && <TemplatePreview template={preview} onClose={() => setPreview(null)} />}
      {editor && <TemplateEditor meta={meta} state={editor} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); load(); }} />}
    </>
  );
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} disabled={disabled} onClick={onClick}
      className="rounded-lg p-2 text-gray-500 transition hover:bg-purple-50 hover:text-[#852BAF] disabled:cursor-not-allowed disabled:opacity-30">
      {children}
    </button>
  );
}

function TemplatePreview({ template, onClose }: { template: Template; onClose: () => void }) {
  const [lang, setLang] = useState<Language>("en");
  const hasText = lang === "en" || Boolean(template[`title_${lang}`] && template[`body_${lang}`]);
  const approved = lang === "en" || template.approved_languages.includes(lang);
  const shown: Language = hasText && approved ? lang : "en";
  return (
    <Modal title={`Preview · ${template.name}`} onClose={onClose}>
      <div className="space-y-4">
        <LanguageTabs value={lang} onChange={setLang} approved={template.approved_languages} available={{ hi: template.has_hi, mr: template.has_mr }} />
        <PushPreview
          title={template[`title_${shown}`] || ""}
          message={template[`body_${shown}`] || ""}
          note={shown !== lang ? `${LANGUAGE_LABELS[lang]} is ${hasText ? "not approved yet" : "not written"}; employees who chose it receive English.` : "Placeholders such as {{order_id}} are filled in at send time."}
        />
        <dl className="grid gap-2 text-xs sm:grid-cols-2">
          <div><dt className="font-bold text-gray-500">Trigger</dt><dd className="text-gray-800">{template.trigger_description}</dd></div>
          <div><dt className="font-bold text-gray-500">Audience</dt><dd className="text-gray-800">{template.target_audience}</dd></div>
          <div><dt className="font-bold text-gray-500">Placeholders</dt><dd className="font-mono text-gray-800">{template.placeholders.join(", ") || "none"}</dd></div>
          <div><dt className="font-bold text-gray-500">Deep link (stored only)</dt><dd className="font-mono text-gray-800">{template.deep_link_pattern || "—"}</dd></div>
          {template.notes && <div className="sm:col-span-2"><dt className="font-bold text-gray-500">Notes</dt><dd className="text-gray-800">{template.notes}</dd></div>}
        </dl>
      </div>
    </Modal>
  );
}

function TemplateEditor({ meta, state, onClose, onSaved }: { meta: ManagerMeta; state: NonNullable<EditorState>; onClose: () => void; onSaved: () => void }) {
  const original = state.template;
  const [form, setForm] = useState({
    template_key: original.template_key || "",
    module: original.module_option || "common",
    notification_type: original.notification_type || "marketing",
    priority: original.priority || "normal",
    title_en: original.title_en || "", body_en: original.body_en || "",
    title_hi: original.title_hi || "", body_hi: original.body_hi || "",
    title_mr: original.title_mr || "", body_mr: original.body_mr || "",
    approved_languages: (original.approved_languages || []) as Language[],
    is_enabled: Boolean(original.is_enabled),
    deep_link_pattern: original.deep_link_pattern || "",
    notes: original.notes || "",
  });
  const [lang, setLang] = useState<Language>("en");
  const [saving, setSaving] = useState(false);
  // The server decides per template: RMs fully manage every marketing and
  // engagement template (content, translations, priority, deep link, enable /
  // disable). System event (transactional) templates are read-only here.
  const perms = state.mode === "create"
    ? { edit: true, publish: meta.permissions.send, approveTranslations: meta.permissions.send, systemEvent: false }
    : original.permissions ?? { edit: false, publish: false, approveTranslations: false, systemEvent: original.notification_type === "transactional" };
  const locked = !perms.edit;

  const setText = (field: string, value: string) => {
    const language = field.slice(-2) as Language;
    // Editing a translation withdraws its approval until reviewed again.
    setForm((current) => ({ ...current, [field]: value, approved_languages: current.approved_languages.filter((item) => item !== language) }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const content = {
        priority: form.priority,
        title_en: form.title_en, body_en: form.body_en,
        title_hi: form.title_hi, body_hi: form.body_hi,
        title_mr: form.title_mr, body_mr: form.body_mr,
        ...(perms.approveTranslations ? { approved_languages: form.approved_languages } : {}),
        ...(perms.publish ? { is_enabled: form.is_enabled } : {}),
        ...(perms.edit && state.mode === "edit" ? { deep_link_pattern: form.deep_link_pattern || null } : {}),
      };
      if (state.mode === "create") {
        const created = await notificationApi.createTemplate({ ...content, template_key: form.template_key, module: form.module, notification_type: form.notification_type, notes: form.notes });
        toast.success(created.is_enabled ? "Template published and ready to use." : "Template saved as a draft.");
      } else {
        await notificationApi.updateTemplate(original.template_id as number, content);
        toast.success("Template saved.");
      }
      onSaved();
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const titleField = `title_${lang}` as const;
  const bodyField = `body_${lang}` as const;

  return (
    <Modal title={state.mode === "create" ? "New template" : `Edit · ${original.name}`} onClose={onClose} wide>
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          {locked && <Notice>{perms.systemEvent ? "This is a system event template (orders, payments, chat and similar). It is managed by the backend and cannot be changed here; use Duplicate to make a marketing or engagement copy." : "You cannot change this template."}</Notice>}
          {state.mode === "create" && (
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="sm:col-span-3"><span className={labelCls}>Template key</span><input className={`${inputCls} font-mono`} value={form.template_key} onChange={(event) => setForm({ ...form, template_key: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} /></label>
              <label><span className={labelCls}>Module</span>
                <select className={inputCls} value={form.module} onChange={(event) => setForm({ ...form, module: event.target.value })}>
                  {meta.modules.filter((option) => !option.screen).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label><span className={labelCls}>Type</span>
                <select className={inputCls} value={form.notification_type} onChange={(event) => setForm({ ...form, notification_type: event.target.value as Template["notification_type"] })}>
                  <option value="marketing">Marketing</option><option value="engagement">Engagement</option>
                </select>
              </label>
              <label><span className={labelCls}>Priority</span>
                <select className={inputCls} value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select>
              </label>
            </div>
          )}

          <LanguageTabs value={lang} onChange={setLang} approved={form.approved_languages} available={{ hi: Boolean(form.title_hi && form.body_hi), mr: Boolean(form.title_mr && form.body_mr) }} />
          <label className="block"><span className={labelCls}>{LANGUAGE_LABELS[lang]} title</span>
            <input className={inputCls} disabled={locked} maxLength={255} value={form[titleField]} onChange={(event) => setText(titleField, event.target.value)} />
          </label>
          <label className="block"><span className={labelCls}>{LANGUAGE_LABELS[lang]} message</span>
            <textarea className={`${inputCls} min-h-28`} disabled={locked} maxLength={1000} value={form[bodyField]} onChange={(event) => setText(bodyField, event.target.value)} />
          </label>
          {lang !== "en" && <p className="text-xs text-gray-500">Leave both empty to always send English. Translations are used only after you tick “I reviewed” below; check machine translations carefully.</p>}

          {perms.approveTranslations || perms.publish ? (
            <div className="space-y-3 rounded-xl border border-gray-100 bg-gray-50 p-4">
              <p className="text-xs font-extrabold uppercase tracking-wider text-gray-500">Review & publish</p>
              {perms.approveTranslations && (["hi", "mr"] as Language[]).map((language) => {
                const written = Boolean(form[`title_${language}`] && form[`body_${language}`]);
                return (
                  <label key={language} className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" disabled={!written} checked={form.approved_languages.includes(language)}
                      onChange={(event) => setForm({ ...form, approved_languages: event.target.checked ? [...form.approved_languages, language] : form.approved_languages.filter((item) => item !== language) })} />
                    I reviewed the {LANGUAGE_LABELS[language]} translation {!written && <span className="text-xs text-gray-400">(not written)</span>}
                  </label>
                );
              })}
              {perms.publish && (
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                  <input type="checkbox" checked={form.is_enabled} onChange={(event) => setForm({ ...form, is_enabled: event.target.checked })} /> Published (usable for sending)
                </label>
              )}
              {perms.edit && state.mode === "edit" && (
                <label className="block"><span className={labelCls}>Deep link pattern (stored only; the app does not open rp:// links yet)</span>
                  <input className={`${inputCls} font-mono`} value={form.deep_link_pattern} onChange={(event) => setForm({ ...form, deep_link_pattern: event.target.value })} />
                </label>
              )}
            </div>
          ) : <p className="text-xs text-gray-500">System event templates are published by the backend. Duplicate a template to make your own editable copy.</p>}
        </div>

        <div className="space-y-3">
          <PushPreview title={form[titleField] || form.title_en} message={form[bodyField] || form.body_en}
            note={lang !== "en" && !form.approved_languages.includes(lang) ? "Not approved: employees who chose this language get English." : undefined} />
          <div className="flex justify-end gap-2">
            <button type="button" className={secondaryBtn} onClick={onClose}>Cancel</button>
            <button type="button" className={primaryBtn} disabled={saving || locked || !form.title_en || !form.body_en} onClick={save}>{saving ? "Saving…" : "Save template"}</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
