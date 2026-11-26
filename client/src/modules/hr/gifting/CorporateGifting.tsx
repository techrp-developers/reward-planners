import { useEffect, useState, type FormEvent } from 'react';
import { isAxiosError } from 'axios';
import { FiGift, FiPlus, FiTrash2 } from 'react-icons/fi';
import { api } from '../../../common/api/api';
import { useAuth } from '../../../common/auth/useAuth';
import { button, field, label, brandGradient } from '../components/styles';
import GiftingEnquiries from './GiftingEnquiries';
import { type GiftItem, type GiftProduct, money, variantLabel } from './types';

export default function CorporateGifting() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'catalogue' | 'enquiries'>('catalogue');
  const [products, setProducts] = useState<GiftProduct[]>([]);
  const [items, setItems] = useState<GiftItem[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [departmentLoading, setDepartmentLoading] = useState(true);
  const [departmentError, setDepartmentError] = useState('');
  const [departmentRevision, setDepartmentRevision] = useState(0);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [catalogueError, setCatalogueError] = useState('');
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [form, setForm] = useState({ recipient_type: 'team', recipient_details: '', occasion: '', contact_name: user?.name || '', contact_email: user?.email || '', contact_phone: '', delivery_date: '', delivery_address: '', budget: '', requirements: '' });
  useEffect(() => {
    const controller = new AbortController();
    api.get('/employees/departments', { signal: controller.signal })
      .then(({ data }) => setDepartments(data.data.map((department: { name: string }) => department.name)))
      .catch(() => { if (!controller.signal.aborted) setDepartmentError('Unable to load departments.'); })
      .finally(() => { if (!controller.signal.aborted) setDepartmentLoading(false); });
    return () => controller.abort();
  }, [departmentRevision]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setCatalogueError('');
    const timer = setTimeout(() => {
      api.get('/corporate-gifting/catalogue', { params: { search, page }, signal: controller.signal })
        .then(({ data }) => { setProducts(data.data); setMore(data.hasMore); })
        .catch(() => { if (!controller.signal.aborted) setCatalogueError('Unable to load the catalogue. Please retry.'); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [search, page, revision]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!items.length || busy || (form.recipient_type === 'team' && (departmentLoading || departmentError || !departments.includes(form.recipient_details)))) return;
    setBusy(true); setError(''); setSuccess('');
    try {
      const { data } = await api.post('/corporate-gifting', { ...form, request_key: requestKey, items: items.map(({ variant_id, quantity }) => ({ variant_id, quantity })) });
      setSuccess(`Enquiry ${data.data.reference} sent to the vendor manager. You can track it below.`);
      setItems([]); setRequestKey(crypto.randomUUID()); setTab('enquiries');
    } catch (error) { setError(isAxiosError(error) ? error.response?.data?.message || 'Unable to send enquiry. Your selection has been kept; please retry.' : 'Unable to send enquiry. Please retry.'); }
    finally { setBusy(false); }
  }
  const total = items.reduce((sum, item) => sum + Number(item.sale_price || 0) * item.quantity, 0);
  return <div className="space-y-6">
    <header className={`${brandGradient} rounded-2xl p-6 text-white`}><FiGift className="mb-3 h-8 w-8" /><h1 className="text-2xl font-semibold">Corporate Gifting</h1><p className="mt-2 max-w-2xl text-sm text-purple-100">Thoughtful gifts for one person or the whole team. Explore our catalogue and ask your vendor manager for a tailored quotation.</p></header>
    <div className="flex gap-2"><button className={tab === 'catalogue' ? button.primary : button.secondary} onClick={() => setTab('catalogue')}>Explore catalogue</button><button className={tab === 'enquiries' ? button.primary : button.secondary} onClick={() => setTab('enquiries')}>My enquiries</button></div>
    {success && <p role="status" className="rounded-xl bg-green-50 p-4 text-sm text-green-800">{success}</p>}
    {tab === 'enquiries' ? <GiftingEnquiries /> : <div className="grid items-start gap-6 xl:grid-cols-[1fr_380px]">
      <section className="space-y-4"><div className="flex gap-2"><input className={field} aria-label="Search gift catalogue" placeholder="Search products or SKU" maxLength={100} value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /><button className={button.secondary} onClick={() => setRevision(value => value + 1)}>Refresh</button></div>
        {loading ? <p role="status" className="p-10 text-center text-slate-500">Loading catalogue...</p> : catalogueError ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{catalogueError}</p> : !products.length ? <p className="rounded-xl bg-white p-10 text-center text-slate-500">No products found. Try another search.</p> : <div className="grid gap-4 sm:grid-cols-2">{products.map(product => {
          const selected = items.some(item => item.variant_id === product.variant_id);
          return <article key={product.variant_id} className="flex flex-col overflow-hidden rounded-2xl border border-purple-100 bg-white shadow-sm">
            {product.image_url ? <img src={product.image_url} alt={product.product_name} loading="lazy" className="h-40 w-full bg-slate-50 object-contain p-3" /> : <div className="grid h-40 place-items-center bg-purple-50 text-purple-300"><FiGift size={44} /></div>}
            <div className="flex flex-1 flex-col gap-2 p-4"><p className="text-xs text-slate-500">{product.vendor_name}</p><h2 className="font-semibold text-slate-900">{product.product_name}</h2><p className="text-xs text-slate-500">{variantLabel(product)}</p><p className="line-clamp-2 text-sm text-slate-500">{product.short_description}</p><p className="mt-auto font-semibold text-[#852BAF]">{product.sale_price == null ? 'Price on request' : money(product.sale_price)} <span className="text-xs font-normal text-slate-400">/ unit, indicative</span></p>
              <button className={selected ? button.secondary : button.primary} disabled={busy || selected || items.length >= 50} onClick={() => setItems(current => [...current, { ...product, quantity: 1 }])}><FiPlus />{selected ? 'Added to enquiry' : 'Add to enquiry'}</button></div>
          </article>;
        })}</div>}
        <div className="flex items-center justify-center gap-3 text-sm"><button className={button.secondary} disabled={loading || page === 1} onClick={() => setPage(value => value - 1)}>Previous</button>Page {page}<button className={button.secondary} disabled={loading || !more} onClick={() => setPage(value => value + 1)}>Next</button></div>
      </section>
      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-purple-100 bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold">Your gifting enquiry</h2><p className="text-xs text-slate-500">Select one or more items and enter quantities for single or bulk gifting. Final pricing and availability will be confirmed by the vendor manager.</p>
        <fieldset disabled={busy} className="space-y-4">
          {!items.length ? <p className="rounded-xl bg-purple-50 p-4 text-sm text-purple-700">Add gifts from the catalogue to get started.</p> : items.map(item => <div key={item.variant_id} className="space-y-2 rounded-xl border border-purple-100 p-3"><p className="text-sm font-semibold">{item.product_name}</p><p className="text-xs text-slate-500">{item.sku}</p><div className="flex items-center gap-2"><label className="flex flex-1 items-center gap-2 text-sm">Qty<input type="number" required min={1} max={100000} step={1} className={field} value={item.quantity || ''} onChange={event => setItems(current => current.map(row => row.variant_id === item.variant_id ? { ...row, quantity: Number(event.target.value) } : row))} /></label><button type="button" aria-label={`Remove ${item.product_name}`} className={button.ghost} onClick={() => setItems(current => current.filter(row => row.variant_id !== item.variant_id))}><FiTrash2 /></button></div></div>)}
          {!!items.length && <p className="text-sm font-semibold">Indicative total: {money(total)}{items.some(item => item.sale_price == null) && ' + items priced on request'}</p>}
          <label className={label}>Gifting for<select className={field} value={form.recipient_type} onChange={event => setForm({ ...form, recipient_type: event.target.value, recipient_details: '' })}><option value="team">Team</option><option value="individual">Individual</option></select></label>
          {form.recipient_type === 'team' ? <div>
            <label className={label}>Team / department *<select className={field} required disabled={departmentLoading || !!departmentError || !departments.length} value={form.recipient_details} onChange={event => setForm({ ...form, recipient_details: event.target.value })}>
              <option value="">{departmentLoading ? 'Loading departments...' : 'Select a department'}</option>
              {departments.map(department => <option key={department} value={department}>{department}</option>)}
            </select></label>
            {departmentError ? <p role="alert" className="mt-2 text-sm text-red-700">{departmentError} <button type="button" className="underline" onClick={() => { setDepartmentLoading(true); setDepartmentError(''); setDepartmentRevision(value => value + 1); }}>Retry</button></p>
              : !departmentLoading && !departments.length && <p className="mt-2 text-sm text-slate-500">Add a department in the HR Departments section first.</p>}
          </div> : <label className={label}>Recipient name *<input className={field} required maxLength={250} value={form.recipient_details} onChange={event => setForm({ ...form, recipient_details: event.target.value })} /></label>}
          {([
            ['occasion', 'Occasion (optional)', 'text', false, 150],
            ['contact_name', 'Contact name', 'text', true, 150],
            ['contact_email', 'Contact email', 'email', true, 254],
            ['contact_phone', 'Contact phone', 'tel', true, 30],
            ['delivery_date', 'Preferred delivery date (optional)', 'date', false, undefined],
            ['budget', 'Total budget in INR (optional)', 'number', false, undefined],
          ] as const).map(([key, title, type, required, maxLength]) => <label key={key} className={label}>{title}{required ? ' *' : ''}<input className={field} type={type} required={required} maxLength={maxLength} min={type === 'number' ? 0 : undefined} max={type === 'number' ? 9999999999.99 : undefined} step={type === 'number' ? '0.01' : undefined} value={form[key]} onChange={event => setForm({ ...form, [key]: event.target.value })} /></label>)}
          <label className={label}>Delivery address *<textarea className={field} rows={3} required maxLength={1000} value={form.delivery_address} onChange={event => setForm({ ...form, delivery_address: event.target.value })} /></label>
          <label className={label}>Personalisation / special requirements<textarea className={field} rows={3} maxLength={4000} placeholder="Company logo, packaging, gift message or other requirements" value={form.requirements} onChange={event => setForm({ ...form, requirements: event.target.value })} /></label>
        </fieldset>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button className={`${button.primary} w-full`} type="submit" disabled={busy || !items.length || (form.recipient_type === 'team' && (departmentLoading || !!departmentError || !departments.includes(form.recipient_details)))}>{busy ? 'Sending enquiry...' : 'Send to vendor manager'}</button>
        <p className="text-xs text-slate-500">Submitting an enquiry does not place an order or take payment.</p>
      </form>
    </div>}
  </div>;
}
