import { useEffect, useState } from 'react';
import { isAxiosError } from 'axios';
import { api } from '../../../common/api/api';
import { button, field, label } from '../components/styles';
import { type GiftingEnquiry, money, statusLabels } from './types';

export default function GiftingEnquiries({ manager = false }: { manager?: boolean }) {
  const [rows, setRows] = useState<GiftingEnquiry[]>([]);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const startLoading = () => { setLoading(true); setError(''); };
  const reload = () => { startLoading(); setRevision(value => value + 1); };
  useEffect(() => {
    const controller = new AbortController();
    api.get('/corporate-gifting', { params: { status, page }, signal: controller.signal })
      .then(({ data }) => { setRows(data.data); setHasMore(data.hasMore); })
      .catch(() => { if (!controller.signal.aborted) setError('Unable to load gifting enquiries. Please retry.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [status, page, revision]);
  return <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-xl font-semibold text-slate-900">{manager ? 'Corporate Gifting enquiries' : 'Your company enquiries'}</h2>
        <p className="text-sm text-slate-500">{manager ? 'Review requirements and share updates with HR.' : 'Follow progress and read replies from your vendor manager.'}</p></div>
      <div className="flex gap-2"><select aria-label="Filter by enquiry status" className={field} value={status} onChange={event => { startLoading(); setStatus(event.target.value); setPage(1); }}>
        <option value="">All statuses</option>{Object.entries(statusLabels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
      </select><button className={button.secondary} onClick={reload}>Refresh</button></div>
    </div>
    {loading ? <p role="status" className="p-8 text-center text-slate-500">Loading enquiries...</p> : error ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p> : !rows.length ? <div className="rounded-2xl border border-dashed border-purple-200 bg-white p-10 text-center text-slate-500">No gifting enquiries {status ? 'with this status' : 'yet'}.</div> : rows.map(row => <Enquiry key={`${row.id}-${row.version}`} row={row} manager={manager} onSaved={reload} />)}
    <div className="flex items-center justify-end gap-3 text-sm"><button className={button.secondary} disabled={loading || page === 1} onClick={() => { startLoading(); setPage(value => value - 1); }}>Previous</button><span>Page {page}</span><button className={button.secondary} disabled={loading || !hasMore} onClick={() => { startLoading(); setPage(value => value + 1); }}>Next</button></div>
  </section>;
}

function Enquiry({ row, manager, onSaved }: { row: GiftingEnquiry; manager: boolean; onSaved: () => void }) {
  const [status, setStatus] = useState(row.status);
  const [reply, setReply] = useState(row.manager_reply || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    setBusy(true); setError('');
    try { await api.patch(`/corporate-gifting/${row.id}`, { status, manager_reply: reply, version: row.version }); onSaved(); }
    catch (error) { setError(isAxiosError(error) ? error.response?.data?.message || 'Unable to save update.' : 'Unable to save update.'); }
    finally { setBusy(false); }
  }
  return <details className="rounded-2xl border border-purple-100 bg-white shadow-sm">
    <summary className="cursor-pointer p-5"><span className="font-semibold text-[#852BAF]">{row.reference}</span> <span className="ml-2 font-medium">{manager ? `${row.company_name} · ` : ''}{row.recipient_details}</span>
      <span className="ml-3 inline-block rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700">{statusLabels[row.status]}</span>
      <span className="mt-2 block text-xs text-slate-500">{row.recipient_type === 'team' ? 'Team gifting' : 'Individual gifting'} · {row.items.reduce((sum, item) => sum + item.quantity, 0)} units · {new Date(row.created_at).toLocaleDateString()}</span>
    </summary>
    <div className="space-y-5 border-t border-purple-50 p-5">
      <div className="grid gap-4 text-sm sm:grid-cols-2"><div><p className="font-semibold">Contact</p><p>{row.contact_name}</p><p className="break-all">{row.contact_email} · {row.contact_phone}</p></div>
        <div><p className="font-semibold">Delivery</p><p className="whitespace-pre-wrap">{row.delivery_address}</p><p>{row.delivery_date ? String(row.delivery_date).slice(0, 10) : 'Date to be discussed'}</p></div>
        <div><p className="font-semibold">Occasion & budget</p><p>{row.occasion || 'Not specified'} · {row.budget === null ? 'Budget to be discussed' : money(row.budget)}</p></div>
        <div><p className="font-semibold">Requirements</p><p className="whitespace-pre-wrap">{row.requirements || 'None added'}</p></div></div>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-purple-50"><tr>{['Product / SKU', 'Vendor', 'Quantity', 'Indicative unit price'].map(title => <th className="p-3" key={title}>{title}</th>)}</tr></thead><tbody>{row.items.map(item => <tr key={item.variant_id} className="border-b border-slate-100"><td className="p-3">{item.product_name}<span className="block text-xs text-slate-500">{item.sku}</span></td><td className="p-3">{item.vendor_name}</td><td className="p-3">{item.quantity}</td><td className="p-3">{item.sale_price == null ? 'On request' : money(item.sale_price)}</td></tr>)}</tbody></table></div>
      {manager ? <div className="space-y-3 rounded-xl bg-purple-50/50 p-4"><label className={label}>Enquiry status<select className={field} value={status} disabled={busy} onChange={event => setStatus(event.target.value)}>{Object.entries(statusLabels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
        <label className={label}>Reply to HR<textarea className={field} rows={3} maxLength={4000} value={reply} disabled={busy} onChange={event => setReply(event.target.value)} placeholder="Share availability, quotation details or next steps. This reply is visible to HR." /></label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}<button className={button.primary} disabled={busy} onClick={() => void save()}>{busy ? 'Saving...' : 'Save update'}</button></div>
        : row.manager_reply && <div className="rounded-xl bg-purple-50 p-4 text-sm"><p className="mb-1 font-semibold text-purple-800">Vendor manager reply</p><p className="whitespace-pre-wrap">{row.manager_reply}</p></div>}
    </div>
  </details>;
}
