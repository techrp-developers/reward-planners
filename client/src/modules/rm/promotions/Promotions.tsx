import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { FiMail, FiCalendar, FiImage } from 'react-icons/fi';
import { api } from '../../../common/api/api';
import PromotionTextEditor, { type TextOp } from './PromotionTextEditor';

type Company = { company_id: number; company_name: string };
type Employee = { id: number; name: string; email: string | null; employment_status: number };
type Campaign = { id: number; name: string; scheduled_at: number; status: string; total: number; sent: number; failed: number; uncertain: number };
const initial = { name: '', subject: '', message: '', companyId: '', audience: 'all', layout: 'hero', mediaType: 'image', mediaUrl: '', scheduledAt: '' };
const field = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-purple-500 focus:outline-none';
const button = 'rounded-lg bg-[#852BAF] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50';
const errorMessage = (error: unknown) => isAxiosError(error) ? error.response?.data?.message || 'Unable to connect. Please try again.' : 'Please check the form and try again.';

export default function Promotions() {
  const [form, setForm] = useState(initial);
  const [selected, setSelected] = useState<number[]>([]);
  const [search, setSearch] = useState('');
  const [scheduled, setScheduled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [imageLayout, setImageLayout] = useState('collage');
  const [imageLink, setImageLink] = useState('');
  const [above, setAbove] = useState<TextOp[]>([]);
  const [below, setBelow] = useState<TextOp[]>([]);
  const [editorVersion, setEditorVersion] = useState(0);
  const companies = useQuery({ queryKey: ['rm-promotion-companies'], queryFn: async () => (await api.get('/manager/employee-directory/companies')).data.data as Company[] });
  const employees = useQuery({ queryKey: ['rm-promotion-employees', form.companyId], enabled: !!form.companyId, queryFn: async () => (await api.get(`/manager/employee-directory/companies/${form.companyId}/employees`)).data.data.employees as Employee[] });
  const history = useQuery({ queryKey: ['rm-promotions'], queryFn: async () => (await api.get('/manager/promotions')).data.data as Campaign[], refetchInterval: 15000 });
  const eligible = (employees.data || []).filter(employee => Number(employee.employment_status) === 1 && employee.email);
  const visible = eligible.filter(employee => `${employee.name} ${employee.email}`.toLowerCase().includes(search.toLowerCase()));
  const update = (key: keyof typeof initial, value: string) => { setForm(previous => ({ ...previous, [key]: value })); setPreview(''); };
  const payload = () => ({ ...form, richText: { above, below }, images, imageLayout, companyId: Number(form.companyId), employeeIds: selected, scheduledAt: scheduled && form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null });
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setNotice(''); setBusy(true);
    try {
      const response = await api.post('/manager/promotions', payload());
      setNotice(`${scheduled ? 'Scheduled' : 'Queued'} for ${response.data.recipients} unique email addresses.`);
      setForm(initial); setSelected([]); setScheduled(false); setPreview('');
      setImages([]); setAbove([]); setBelow([]); setImageLink(''); setImageLayout('collage'); setEditorVersion(version => version + 1);
      await history.refetch();
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  async function showPreview() {
    setBusy(true); setError('');
    try { setPreview((await api.post('/manager/promotions/preview', payload())).data.html); }
    catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  async function cancel(id: number) {
    setBusy(true); setError('');
    try { await api.post(`/manager/promotions/${id}/cancel`); await history.refetch(); }
    catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  async function uploadImages(files: File[]) {
    if (!files.length) return;
    if (images.length + files.length > 5) { setError('You can add up to 5 images.'); return; }
    if (files.some(file => file.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) { setError('Choose JPG, PNG or WebP images no larger than 5 MB each.'); return; }
    setBusy(true); setError('');
    try {
      for (const file of files) {
        const data = new FormData(); data.append('image', file);
        const response = await api.post('/manager/promotions/media', data);
        setImages(previous => [...previous, response.data.url]); setPreview('');
      }
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  function addImageLink() {
    try {
      const url = new URL(imageLink.trim());
      if (url.protocol !== 'https:' || url.username || url.password || imageLink.length > 2000) throw new Error();
      if (images.length >= 5) { setError('You can add up to 5 images.'); return; }
      setImages(previous => [...previous, imageLink.trim()]); setImageLink(''); setPreview(''); setError('');
    } catch { setError('Enter a valid public HTTPS image link.'); }
  }
  function moveImage(index: number, direction: number) {
    setImages(previous => { const next = [...previous]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; return next; }); setPreview('');
  }
  return <div className="mx-auto max-w-7xl space-y-6">
    <header className="rounded-2xl border border-purple-100 bg-white p-6"><span className="text-xs font-semibold uppercase tracking-widest text-purple-600">RM workspace</span><h1 className="mt-2 flex items-center gap-3 text-2xl font-semibold text-slate-900"><FiMail /> Promotions</h1><p className="mt-2 text-sm text-slate-500">Create email campaigns, choose your audience, and deliver at the right time.</p></header>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-green-50 p-4 text-sm text-green-700">{notice}</p>}
    <div className="grid items-start gap-6 xl:grid-cols-2">
      <form onSubmit={submit} className="space-y-5 rounded-2xl border border-slate-100 bg-white p-6">
        <h2 className="text-lg font-semibold">Create promotion</h2>
        <label className="block space-y-2 text-sm font-medium">Campaign name<input required maxLength={120} className={field} value={form.name} onChange={e => update('name', e.target.value)} placeholder="November employee rewards" /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-2 text-sm font-medium">Company<select required className={field} value={form.companyId} onChange={e => { update('companyId', e.target.value); setSelected([]); }}><option value="">Select company</option>{companies.data?.map(company => <option key={company.company_id} value={company.company_id}>{company.company_name}</option>)}</select></label>
          <label className="block space-y-2 text-sm font-medium">Send to<select className={field} value={form.audience} onChange={e => update('audience', e.target.value)}><option value="company">Company contact email</option><option value="all">All company employees</option><option value="custom">Selected employees</option></select></label>
        </div>
        {companies.isError && <p className="text-sm text-red-600">Unable to load companies. <button type="button" onClick={() => void companies.refetch()}>Retry</button></p>}
        {form.audience === 'custom' && <div className="space-y-2 rounded-xl border border-slate-200 p-3"><input aria-label="Search employees" className={field} placeholder="Search name or email" value={search} onChange={e => setSearch(e.target.value)} /><div className="flex justify-between text-xs text-purple-700"><span>{selected.length} selected</span><button type="button" onClick={() => setSelected(selected.length ? [] : eligible.map(employee => employee.id))}>{selected.length ? 'Clear selection' : 'Select all'}</button></div><div className="max-h-48 overflow-y-auto">{employees.isPending && form.companyId ? <p className="p-3 text-sm">Loading employees…</p> : employees.isError ? <button type="button" onClick={() => void employees.refetch()}>Unable to load employees. Retry</button> : visible.length ? visible.map(employee => <label key={employee.id} className="flex items-center gap-3 border-b border-slate-50 py-2 text-sm"><input type="checkbox" checked={selected.includes(employee.id)} onChange={e => setSelected(ids => e.target.checked ? [...ids, employee.id] : ids.filter(id => id !== employee.id))} /><span>{employee.name}<span className="block text-xs text-slate-500">{employee.email}</span></span></label>) : <p className="p-3 text-sm text-slate-500">No eligible employees found.</p>}</div></div>}
        <p className="text-xs text-slate-500">Employee audiences include active employment records with valid email addresses. Duplicate addresses receive one email. Recipients are saved when you queue the campaign.</p>
        <label className="block space-y-2 text-sm font-medium">Subject<input required maxLength={200} className={field} value={form.subject} onChange={e => update('subject', e.target.value)} placeholder="Your next reward is here" /></label>
        <p className="text-xs text-slate-500">Compose your email in order: introduction, images, then closing text. Either text section can be left empty. Add headings inside the editor; the subject is used for the email subject line.</p>
        <PromotionTextEditor key={`above-${editorVersion}`} label="Text above images" disabled={busy} onChange={ops => { setAbove(ops); setPreview(''); }} />
        <section className="space-y-3 rounded-xl bg-slate-50 p-4">
          <h3 className="flex items-center gap-2 text-sm font-medium"><FiImage /> Images ({images.length}/5)</h3>
          <fieldset disabled={busy}><legend className="mb-2 text-sm">Image arrangement</legend><div className="grid grid-cols-3 gap-2">{[['collage', 'Collage'], ['column', 'Column'], ['row', 'Row']].map(([value, label]) => <label key={value} className={`cursor-pointer rounded-lg border p-3 text-sm ${imageLayout === value ? 'border-purple-500 bg-purple-50' : 'border-slate-200'}`}><input type="radio" name="imageLayout" checked={imageLayout === value} onChange={() => { setImageLayout(value); setPreview(''); }} /> {label}</label>)}</div></fieldset>
          <p className="text-xs text-slate-500">Collage pairs images in a grid, with a full-width first image for odd counts. Column stacks images; row places them side by side.</p>
          <label className="block space-y-2 text-sm">Upload images (JPG, PNG, WebP; max 5 MB each)<input type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={busy || images.length >= 5} className={field} onChange={e => { void uploadImages(Array.from(e.target.files || [])); e.target.value = ''; }} /></label>
          <div className="flex gap-2"><input aria-label="Public image URL" className={field} placeholder="Or paste a public HTTPS image link" disabled={busy || images.length >= 5} value={imageLink} onChange={e => setImageLink(e.target.value)} /><button type="button" disabled={busy || images.length >= 5 || !imageLink.trim()} onClick={addImageLink} className={button}>Add</button></div>
          <div className="space-y-2">{images.map((url, index) => <div key={`${index}-${url}`} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-2"><img src={url} alt={`Promotion image ${index + 1}`} className="h-16 w-20 rounded object-contain" /><span className="flex-1 text-sm">Image {index + 1}</span><button type="button" aria-label={`Move image ${index + 1} earlier`} disabled={busy || index === 0} onClick={() => moveImage(index, -1)} className="p-2 disabled:opacity-30">&uarr;</button><button type="button" aria-label={`Move image ${index + 1} later`} disabled={busy || index === images.length - 1} onClick={() => moveImage(index, 1)} className="p-2 disabled:opacity-30">&darr;</button><button type="button" disabled={busy} onClick={() => { setImages(previous => previous.filter((_, i) => i !== index)); setPreview(''); }} className="text-xs text-red-600">Remove</button></div>)}</div>
          <p className="text-xs text-slate-500">Uploaded images are public so email recipients can view them.</p>
          <label className="block text-sm">Additional media (optional)<select className={field} value={form.mediaType} onChange={e => { update('mediaType', e.target.value); update('mediaUrl', ''); }}><option value="image">None</option><option value="video">Video link</option><option value="document">Document link</option></select></label>
          {form.mediaType !== 'image' && <label className="block text-sm">Public HTTPS video/document link<input type="url" className={field} value={form.mediaUrl} onChange={e => update('mediaUrl', e.target.value)} placeholder="https://..." /></label>}
        </section>
        <PromotionTextEditor key={`below-${editorVersion}`} label="Text below images" disabled={busy} onChange={ops => { setBelow(ops); setPreview(''); }} />
        <div className="space-y-3"><label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={scheduled} onChange={e => { setScheduled(e.target.checked); setPreview(''); }} /><FiCalendar /> Schedule delivery</label>{scheduled && <label className="block space-y-2 text-sm">Delivery time ({Intl.DateTimeFormat().resolvedOptions().timeZone})<input required type="datetime-local" className={field} value={form.scheduledAt} onChange={e => update('scheduledAt', e.target.value)} /></label>}<p className="text-xs text-slate-500">Queued emails start on the next minute while the server's scheduled jobs are running.</p></div>
        <div className="flex flex-wrap gap-3"><button disabled={busy || companies.isError || (form.audience === 'custom' && !selected.length)} className={button} type="submit">{busy ? 'Working…' : scheduled ? 'Schedule promotion' : 'Queue email campaign'}</button><button disabled={busy} type="button" onClick={() => void showPreview()} className="rounded-lg border border-purple-200 px-4 py-2.5 text-sm font-semibold text-purple-700">Preview email</button></div>
      </form>
      <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white"><div className="border-b border-slate-100 p-5"><h2 className="font-semibold">Email preview</h2><p className="mt-1 text-xs text-slate-500">Preview your current content before scheduling.</p></div>{preview ? <iframe title="Promotion email preview" sandbox="" srcDoc={preview} className="h-[650px] w-full border-0" /> : <div className="flex min-h-96 flex-col items-center justify-center gap-3 p-8 text-center text-slate-400"><FiMail size={40} /><p className="text-sm">Fill in your campaign and click Preview email.</p></div>}</section>
    </div>
    <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white"><div className="flex items-center justify-between p-5"><div><h2 className="font-semibold">Recent promotions</h2><p className="text-xs text-slate-500">Latest 100 campaigns · Sent means accepted by the mail server.</p></div><button type="button" onClick={() => void history.refetch()} className="text-sm text-purple-700">Refresh</button></div>{history.isError ? <p role="alert" className="p-5 text-red-600">Unable to load campaigns. Please refresh.</p> : history.isPending ? <p className="p-5">Loading campaigns…</p> : !history.data?.length ? <p className="p-8 text-center text-sm text-slate-500">Your first promotion starts here.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr>{['Campaign', 'Delivery time', 'Status', 'Delivery', ''].map((heading, index) => <th key={index} className="px-5 py-3">{heading}</th>)}</tr></thead><tbody>{history.data.map(campaign => <tr key={campaign.id} className="border-t border-slate-100"><td className="px-5 py-4 font-medium">{campaign.name}</td><td className="px-5 py-4">{new Date(Number(campaign.scheduled_at)).toLocaleString()}</td><td className="px-5 py-4 capitalize">{campaign.status.replaceAll('_', ' ')}</td><td className="px-5 py-4">{campaign.sent}/{campaign.total} sent{Number(campaign.failed) > 0 && <span className="block text-xs text-red-600">{campaign.failed} failed</span>}{Number(campaign.uncertain) > 0 && <span className="block text-xs text-amber-700">{campaign.uncertain} interrupted; verify delivery</span>}</td><td className="px-5 py-4">{campaign.status === 'scheduled' && <button type="button" disabled={busy} onClick={() => void cancel(campaign.id)} className="text-red-600 disabled:opacity-50">Cancel</button>}</td></tr>)}</tbody></table></div>}</section>
  </div>;
}
