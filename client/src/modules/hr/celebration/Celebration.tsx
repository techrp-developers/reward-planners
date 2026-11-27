import { useEffect, useRef, useState, type FormEvent } from 'react';
import { isAxiosError } from 'axios';
import { FiCalendar, FiGift } from 'react-icons/fi';
import { api } from '../../../common/api/api';
import { useAuth } from '../../../common/auth/useAuth';
import { button, field, label } from '../components/styles';
import { Card, CardHeader, PageHeader } from '../components/ui';
import CelebrationRequests from './CelebrationRequests';
import { cakeFields, eventFields, commonFields, kindLabels, type CelebrationKind, type CelebrationForm } from './fields';

export default function Celebration() {
  const { user } = useAuth();
  const initialForm = (): CelebrationForm => ({ title: '', occasion: '', department: '', date: '', time: '', location: '',
    contact_name: user?.name || '', contact_email: user?.email || '', contact_phone: user?.phone || '', budget: '', requirements: '',
    flavour: '', weight_kg: '1', quantity: '1', dietary: 'eggless', cake_message: '', event_type: '', guests: '', duration_hours: '2', services: '' });
  const [tab, setTab] = useState<CelebrationKind | 'dining'>('cake');
  const kind: CelebrationKind = tab === 'dining' ? 'cake' : tab;
  const [forms, setForms] = useState<Record<CelebrationKind, CelebrationForm>>(() => ({ cake: initialForm(), event: initialForm() }));
  const [requestKeys, setRequestKeys] = useState(() => ({ cake: crypto.randomUUID(), event: crypto.randomUUID() }));
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [historyRevision, setHistoryRevision] = useState(0);
  const [departments, setDepartments] = useState<string[]>([]);
  const [departmentError, setDepartmentError] = useState(false);
  const [departmentLoading, setDepartmentLoading] = useState(true);
  const [departmentRevision, setDepartmentRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api.get('/employees/departments', { signal: controller.signal })
      .then(({ data }) => setDepartments(data.data.map((item: { name: string }) => item.name)))
      .catch(() => { if (!controller.signal.aborted) setDepartmentError(true); })
      .finally(() => { if (!controller.signal.aborted) setDepartmentLoading(false); });
    return () => controller.abort();
  }, [departmentRevision]);
  const form = forms[kind];
  const update = (key: string, value: string) => setForms(current => ({ ...current, [kind]: { ...current[kind], [key]: value } }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current) return;
    sending.current = true; setBusy(true); setError(''); setSuccess('');
    try {
      const { data } = await api.post('/celebrations', { ...form, kind, request_key: requestKeys[kind] });
      setSuccess(`Request ${data.data.reference} sent to the vendor manager. Your ${kind === 'cake' ? 'cake delivery' : 'event booking'} is awaiting confirmation.`);
      setForms(current => ({ ...current, [kind]: initialForm() }));
      setRequestKeys(current => ({ ...current, [kind]: crypto.randomUUID() }));
      setHistoryRevision(value => value + 1);
    } catch (error) {
      setError(isAxiosError(error) ? error.response?.data?.message || 'Unable to submit your request. Your details are saved in this form; please retry.' : 'Unable to submit your request. Please retry.');
    } finally { sending.current = false; setBusy(false); }
  }
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  return <div className="space-y-6">
    <PageHeader title="Celebration" description="Make birthdays, milestones and team occasions special. Share your plans and let us help organise the celebration." />
    <div className="flex flex-wrap gap-2" aria-label="Celebration sections">
      {(['cake', 'event', 'dining'] as const).map(value => <button type="button" aria-pressed={tab === value} key={value} disabled={busy} className={tab === value ? button.primary : button.secondary} onClick={() => { setTab(value); setError(''); setSuccess(''); }}>{value === 'cake' ? <FiGift /> : <FiCalendar />}{value === 'dining' ? 'Hosting & Dining' : kindLabels[value]}</button>)}
    </div>
    {success && <p role="status" className="rounded-xl bg-green-50 p-4 text-sm text-green-800">{success}</p>}
    {tab === 'dining' ? <section aria-label="Hosting & Dining"><Card className="min-h-64"><CardHeader title="Hosting & Dining" /></Card></section> : <>
    <Card>
    <form onSubmit={submit}>
      <CardHeader title={kindLabels[kind]} description={`${kind === 'cake' ? 'Choose a cake and tell us when and where it should arrive.' : 'Tell us about your event, guest count and the services you need.'} All times are India time (IST).`} />
      <div className="p-5">
      <fieldset disabled={busy} className="grid gap-4 md:grid-cols-2">
        {[...(kind === 'cake' ? cakeFields : eventFields), ...commonFields].map(item => <label className={label} key={item.key}>{item.title}{item.required ? ' *' : ''}<input className={field} type={item.type || 'text'} required={item.required} maxLength={item.maxLength} min={item.type === 'date' ? today : item.min} max={item.max} step={item.step} value={form[item.key]} onChange={event => update(item.key, event.target.value)} /></label>)}
        <label className={label}>Department (optional)<select className={field} disabled={departmentLoading || departmentError} value={form.department} onChange={event => update('department', event.target.value)}><option value="">{departmentLoading ? 'Loading departments...' : 'Select department / entire company'}</option>{departments.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
        {kind === 'cake' && <label className={label}>Dietary preference<select className={field} value={form.dietary} onChange={event => update('dietary', event.target.value)}><option value="eggless">Eggless</option><option value="with_egg">With egg</option><option value="no_preference">No preference</option></select></label>}
        {departmentError && <p className="text-sm text-red-700">Departments could not be loaded. <button className="underline" type="button" onClick={() => { setDepartmentLoading(true); setDepartmentError(false); setDepartmentRevision(value => value + 1); }}>Retry</button></p>}
        <label className={`${label} md:col-span-2`}>{kind === 'cake' ? 'Delivery address' : 'Venue / preferred location'} *<textarea className={field} rows={2} required maxLength={1000} value={form.location} onChange={event => update('location', event.target.value)} /></label>
        {kind === 'event' && <label className={`${label} md:col-span-2`}>Services required<textarea className={field} rows={2} maxLength={2000} placeholder="For example: venue, catering, decoration, activities or entertainment" value={form.services} onChange={event => update('services', event.target.value)} /></label>}
        <label className={`${label} md:col-span-2`}>Special requirements<textarea className={field} rows={3} maxLength={4000} placeholder={kind === 'cake' ? 'Allergies, design preferences, delivery instructions...' : 'Theme, accessibility, dietary needs or other requirements...'} value={form.requirements} onChange={event => update('requirements', event.target.value)} /></label>
      </fieldset>
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
      <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-slate-200 pt-5"><button className={button.primary} disabled={busy} type="submit">{busy ? 'Sending request...' : kind === 'cake' ? 'Send cake request' : 'Send event request'}</button><p className="text-xs text-slate-500">The vendor manager will confirm availability and pricing. No payment is taken here.</p></div>
      </div>
    </form>
    </Card>
    <CelebrationRequests key={`${kind}-${historyRevision}`} kind={kind} />
    </>}
  </div>;
}
