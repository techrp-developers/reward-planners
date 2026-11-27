import { useEffect, useState } from 'react';
import { isAxiosError } from 'axios';
import { api } from '../../../common/api/api';
import { button, field, label } from '../components/styles';
import { cakeFields, eventFields, statusLabels, kindLabels, type CelebrationKind, type CelebrationRequest } from './fields';

export default function CelebrationRequests({ manager = false, kind }: { manager?: boolean; kind?: CelebrationKind }) {
  const [rows, setRows] = useState<CelebrationRequest[]>([]);
  const [status, setStatus] = useState('');
  const [type, setType] = useState(kind || '');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const startLoading = () => { setLoading(true); setError(''); };
  const reload = () => { startLoading(); setRevision(value => value + 1); };
  useEffect(() => {
    const controller = new AbortController();
    api.get('/celebrations', { params: { kind: kind || type, status, page }, signal: controller.signal })
      .then(({ data }) => { setRows(data.data); setHasMore(data.hasMore); })
      .catch(() => { if (!controller.signal.aborted) setError('Unable to load celebration requests. Please retry.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [kind, type, status, page, revision]);
  return <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div>
      <h2 className="text-sm font-semibold text-slate-900">{manager ? 'Celebration requests' : 'Your company requests'}</h2>
      <p className="text-sm text-slate-500">{manager ? 'Review cake and event requirements and reply to HR.' : 'Track confirmation and replies from the vendor manager.'}</p>
    </div><div className="flex flex-wrap gap-2">
      {manager && <select aria-label="Filter celebration type" className={field} value={type} onChange={event => { startLoading(); setType(event.target.value); setPage(1); }}><option value="">All celebrations</option><option value="cake">Cake requests</option><option value="event">Event requests</option></select>}
      <select aria-label="Filter request status" className={field} value={status} onChange={event => { startLoading(); setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option>{Object.entries(statusLabels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select>
      <button className={button.secondary} onClick={reload}>Refresh requests</button>
    </div></div>
    {loading ? <p role="status" className="p-6 text-center text-slate-500">Loading requests...</p> : error ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p> : !rows.length ? <p className="rounded-2xl border border-dashed border-purple-200 bg-white p-8 text-center text-slate-500">No celebration requests yet.</p> : rows.map(row => <RequestCard key={`${row.id}-${row.version}`} row={row} manager={manager} onSaved={reload} />)}
    <div className="flex items-center justify-end gap-3 text-sm"><button className={button.secondary} disabled={loading || page === 1} onClick={() => { startLoading(); setPage(value => value - 1); }}>Previous</button><span>Page {page}</span><button className={button.secondary} disabled={loading || !hasMore} onClick={() => { startLoading(); setPage(value => value + 1); }}>Next</button></div>
  </section>;
}
function RequestCard({ row, manager, onSaved }: { row: CelebrationRequest; manager: boolean; onSaved: () => void }) {
  const [status, setStatus] = useState(row.status);
  const [reply, setReply] = useState(row.manager_reply || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    setBusy(true); setError('');
    try { await api.patch(`/celebrations/${row.id}`, { status, manager_reply: reply, version: row.version }); onSaved(); }
    catch (error) { setError(isAxiosError(error) ? error.response?.data?.message || 'Unable to save update.' : 'Unable to save update.'); }
    finally { setBusy(false); }
  }
  const details = row.details;
  const detailFields = [...(row.kind === 'cake' ? cakeFields : eventFields), { key: 'department', title: 'Department' },
    { key: 'dietary', title: 'Dietary preference' }, { key: 'services', title: 'Services requested' },
    { key: 'budget', title: 'Total budget (INR)' }, { key: 'requirements', title: 'Special requirements' }];
  return <details className="rounded-2xl border border-purple-100 bg-white shadow-sm">
    <summary className="cursor-pointer p-5"><span className="font-semibold text-[#852BAF]">{row.reference}</span><span className="ml-2 font-semibold">{manager ? `${row.company_name} · ` : ''}{details.title}</span>
      <span className="ml-3 inline-block rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700">{statusLabels[row.status]}</span>
      <span className="mt-2 block text-xs text-slate-500">{kindLabels[row.kind]} · {details.date} at {details.time} IST</span>
    </summary>
    <div className="space-y-4 border-t border-purple-50 p-5">
      <div className="grid gap-4 text-sm sm:grid-cols-2"><div><p className="font-semibold">Contact</p><p>{details.contact_name}</p><p className="break-all">{details.contact_email}</p><p>{details.contact_phone}</p></div>
        <div><p className="font-semibold">{row.kind === 'cake' ? 'Delivery address' : 'Venue'}</p><p className="whitespace-pre-wrap">{details.location}</p></div>
        {detailFields.filter(item => details[item.key] !== null && details[item.key] !== undefined && details[item.key] !== '').map(item => <div key={item.key}><p className="font-semibold">{item.title}</p><p className="whitespace-pre-wrap">{String(details[item.key]).replace(/_/g, ' ')}</p></div>)}
      </div>
      {manager ? <div className="space-y-3 rounded-xl bg-purple-50/50 p-4"><label className={label}>Request status<select className={field} value={status} disabled={busy} onChange={event => setStatus(event.target.value)}>{Object.entries(statusLabels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
        <label className={label}>Reply to HR<textarea className={field} maxLength={4000} rows={3} disabled={busy} value={reply} onChange={event => setReply(event.target.value)} placeholder="Share availability, pricing or confirmation details." /></label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}<button className={button.primary} disabled={busy} onClick={() => void save()}>{busy ? 'Saving...' : 'Save update'}</button></div>
        : row.manager_reply && <div className="rounded-xl bg-purple-50 p-4"><p className="text-sm font-semibold text-purple-800">Vendor manager reply</p><p className="whitespace-pre-wrap text-sm">{row.manager_reply}</p></div>}
    </div>
  </details>;
}
