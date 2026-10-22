import { useEffect, useState } from "react";
import { api } from "../../../../common/api/api";
import { toast } from "sonner";

interface Variant { product_id: number; product_name: string; brand_name: string; variant_id: number; sku: string; sale_price: number; offer_price: number | null; }
type DiscountType = 'none' | 'percentage' | 'fixed';
interface DiscountRule { discount_type: DiscountType; discount_value: number; }

export default function ContentProductPricing({ contentId }: { contentId: number }) {
  const [rows, setRows] = useState<Variant[]>([]);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [rule, setRule] = useState<DiscountRule>({ discount_type: 'none', discount_value: 0 });
  const [ruleType, setRuleType] = useState<DiscountType>('none');
  const [ruleValue, setRuleValue] = useState('');
  const [ruleLoaded, setRuleLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    api.get(`/content/entries/${contentId}/discount-rule`).then(({ data }) => {
      if (cancelled) return;
      setRule(data.data); setRuleType(data.data.discount_type); setRuleValue(String(data.data.discount_value)); setRuleLoaded(true);
    }).catch(() => { if (!cancelled) toast.error('Unable to load discount rule'); });
    return () => { cancelled = true; };
  }, [contentId]);
  const saveRule = async () => {
    const amount = Number(ruleValue);
    if (ruleType !== 'none' && (!Number.isFinite(amount) || amount <= 0 || (ruleType === 'percentage' && amount > 100))) {
      toast.error('Enter a positive discount (percentage cannot exceed 100)'); return;
    }
    setBusy(true);
    try {
      const { data } = await api.put(`/content/entries/${contentId}/discount-rule`, { discount_type: ruleType, discount_value: ruleType === 'none' ? 0 : amount });
      setRule(data.data); toast.success('Campaign discount saved');
    } catch { toast.error('Unable to save discount. Use at most two decimal places.'); }
    finally { setBusy(false); }
  };
  const effectivePrice = (row: Variant) => {
    if (row.offer_price != null) return Number(row.offer_price).toFixed(2);
    const base = Number(row.sale_price);
    if (rule.discount_type === 'none' || base <= 0) return base.toFixed(2);
    return Math.max(0.01, Math.round((rule.discount_type === 'percentage' ? base * (1 - rule.discount_value / 100) : base - rule.discount_value) * 100) / 100).toFixed(2);
  };
  const load = async () => {
    setBusy(true);
    try {
      const { data } = await api.get(`/content/entries/${contentId}/product-pricing`);
      setRows(data.data);
      setDrafts(Object.fromEntries(data.data.map((row: Variant) => [row.variant_id, row.offer_price == null ? "" : String(row.offer_price)])));
      setLoaded(true);
    } catch { toast.error("Unable to load banner product prices"); }
    finally { setBusy(false); }
  };
  const save = async (row: Variant) => {
    const value = drafts[row.variant_id]?.trim() || "";
    const price = value === "" ? null : Number(value);
    if (price !== null && (!Number.isFinite(price) || price <= 0)) { toast.error("Enter a price greater than zero"); return; }
    setBusy(true);
    try {
      await api.put(`/content/entries/${contentId}/product-pricing/${row.variant_id}`, { offer_price: price });
      setRows(current => current.map(item => item.variant_id === row.variant_id ? { ...item, offer_price: price } : item));
      toast.success(price === null ? "Campaign discount or normal price restored" : "Individual price saved");
    } catch { toast.error("Unable to save price. Save the destination and refresh the list."); }
    finally { setBusy(false); }
  };
  return <section className="sm:col-span-2 rounded-xl border border-purple-200 p-4">
    <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-bold">Product pricing</h3><button type="button" disabled={busy} onClick={() => void load()} className="text-sm font-semibold text-purple-700 disabled:opacity-50">{busy ? "Please wait…" : loaded ? "Refresh products" : "Load products"}</button></div>
    <p className="mt-2 text-xs text-slate-500">Apply one discount to all products in your saved categories, subcategories, and selected product lists. It uses each variant's current sale price and includes newly added category products automatically. Flash sales remain separate.</p>
    <div className="my-3 flex flex-wrap items-end gap-3 rounded-lg bg-purple-50 p-3">
      <label className="text-xs font-semibold">Campaign discount<select disabled={busy || !ruleLoaded} value={ruleType} onChange={event => setRuleType(event.target.value as DiscountType)} className="mt-1 block rounded border bg-white p-2"><option value="none">No shared discount</option><option value="percentage">Percentage off (%)</option><option value="fixed">Fixed amount off (₹)</option></select></label>
      {ruleType !== 'none' && <label className="text-xs font-semibold">{ruleType === 'percentage' ? 'Percentage' : 'Amount off each item'}<input disabled={busy || !ruleLoaded} type="number" min="0.01" max={ruleType === 'percentage' ? 100 : undefined} step="0.01" value={ruleValue} onChange={event => setRuleValue(event.target.value)} className="mt-1 block w-32 rounded border p-2" /></label>}
      <button type="button" disabled={busy || !ruleLoaded} onClick={() => void saveRule()} className="rounded bg-purple-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Save discount</button>
    </div>
    <p className="text-xs text-slate-500">Example: ₹200 with 10% off = ₹180; with ₹10 off = ₹190. Discounted prices have a ₹0.01 minimum. Individual prices below override the shared discount. Clear an override and save to use the shared discount, or the normal price when no discount is set.</p>
    {loaded && <><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search product, brand or SKU" className="my-3 w-full rounded-lg border p-2 text-sm" />
      <div className="max-h-96 overflow-auto"><table className="w-full text-left text-xs"><thead><tr><th className="p-2">Product / variant</th><th className="p-2">Normal price</th><th className="p-2">Individual price</th><th className="p-2">Effective price</th><th className="p-2">Action</th></tr></thead><tbody>
        {rows.filter(row => `${row.product_name} ${row.brand_name} ${row.sku}`.toLowerCase().includes(search.toLowerCase())).map(row => <tr key={row.variant_id} className="border-t"><td className="p-2">{row.product_name}<div className="text-slate-500">{row.sku}</div></td><td className="p-2">₹{row.sale_price}</td><td className="p-2"><input aria-label={`Banner price for ${row.sku}`} disabled={busy} type="number" min="0.01" step="0.01" placeholder="Use discount" value={drafts[row.variant_id] ?? ""} onChange={event => setDrafts(current => ({ ...current, [row.variant_id]: event.target.value }))} className="w-28 rounded border p-2" /></td><td className="p-2">?{effectivePrice(row)}</td><td className="p-2"><button type="button" disabled={busy} onClick={() => void save(row)} className="font-semibold text-purple-700">Save price</button></td></tr>)}
      </tbody></table></div>{!rows.length && <p className="mt-2 text-xs text-slate-500">No linked products. Configure a product, category, or subcategory destination first.</p>}</>}
  </section>;
}
