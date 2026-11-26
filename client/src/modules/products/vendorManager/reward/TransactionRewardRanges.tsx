import { useEffect, useState } from "react";
import { api } from "../../../../common/api/api";

type Range = { min: string; max: string; points: string };
type Module = "bbps" | "busbooking";

export default function TransactionRewardRanges() {
  const [module, setModule] = useState<Module>("bbps");
  return <main className="max-w-5xl space-y-6 pb-8">
    <header><h1 className="text-2xl font-semibold tracking-tight text-slate-900">BBPS &amp; Bus Rewards</h1>
      <p className="mt-1 text-sm text-slate-500">Award wallet points based on the amount the customer pays.</p></header>
    <nav aria-label="Reward module" className="flex gap-2 rounded-xl border border-purple-100 bg-white p-2">
      {([['bbps', 'BBPS'], ['busbooking', 'Bus Booking']] as const).map(([value, label]) =>
        <button type="button" key={value} aria-pressed={module === value} onClick={() => setModule(value)} className={`rounded-lg px-5 py-3 text-sm font-semibold ${module === value ? 'bg-[#852BAF] text-white' : 'text-gray-600'}`}>{label}</button>)}
    </nav>
    <RangeEditor key={module} module={module} />
  </main>;
}

function RangeEditor({ module }: { module: Module }) {
  const [ranges, setRanges] = useState<Range[]>([]);
  const [expiry, setExpiry] = useState("90");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const inputClass = "w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-purple-500 focus:outline-none";
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api.get(`/reward/transaction-ranges/${module}`, { signal: controller.signal }).then(({ data }) => {
      if (controller.signal.aborted) return;
      if (!data.success) throw new Error("Load failed");
      setRanges(data.data.ranges.map((row: { min: number; max: number | null; points: number }) => ({ min: String(row.min), max: row.max === null ? "" : String(row.max), points: String(row.points) })));
      setExpiry(String(data.data.expiry_days));
      setLoaded(true);
    }).catch(() => { if (!controller.signal.aborted) setError("Unable to load reward ranges."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [module, retry]);

  function update(index: number, field: keyof Range, value: string) {
    setNotice("");
    setRanges(rows => rows.map((row, i) => i === index ? { ...row, [field]: value } : row));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true); setError(""); setNotice("");
    try {
      const { data } = await api.put(`/reward/transaction-ranges/${module}`, { ranges, expiry_days: expiry });
      setRanges(data.data.ranges.map((row: { min: number; max: number | null; points: number }) => ({ min: String(row.min), max: row.max === null ? "" : String(row.max), points: String(row.points) })));
      setNotice("Reward ranges saved.");
    } catch (err: unknown) {
      const response = err as { response?: { data?: { message?: string } } };
      setError(response.response?.data?.message || "Unable to save reward ranges.");
    } finally { setSaving(false); }
  }

  if (loading) return <p role="status" className="p-8 text-center text-gray-500">Loading rewards…</p>;
  if (!loaded) return <div role="alert"><p className="text-red-600">{error}</p><button type="button" onClick={() => setRetry(n => n + 1)} className="mt-3 text-purple-700 underline">Retry</button></div>;
  return <form onSubmit={save} className="space-y-5 rounded-xl border border-purple-100 bg-white p-6 shadow-sm">
    <div className="rounded-xl bg-purple-50 p-4 text-sm leading-6 text-gray-700">
      <p>Points are credited after {module === "bbps" ? "the bill payment succeeds" : "the paid bus ticket is confirmed"}. The amount is the captured payment after any wallet discount.</p>
      <p>Each range includes its lower amount and excludes its upper amount: ₹100 to below ₹500, then ₹500 to below ₹1,000. Leave the upper amount blank for no limit.</p>
      <p>The first save enables rewards for newly created transactions. Unmatched amounts earn no points. Removing all ranges stops new awards. Previously credited points stay unchanged.</p>
    </div>
    <fieldset disabled={saving} className="space-y-4">
      <legend className="mb-3 font-semibold text-gray-900">Amount ranges</legend>
      {ranges.length === 0 && <p className="text-sm text-gray-500">No ranges configured. Add a range to enable earning.</p>}
      {ranges.map((row, index) => <div key={index} className="grid gap-3 rounded-xl border border-gray-100 p-4 sm:grid-cols-4">
        <label className="text-xs font-medium text-gray-600">From amount (₹, inclusive)<input aria-label={`Range ${index + 1} minimum`} type="number" min="0" step="0.01" required value={row.min} onChange={e => update(index, 'min', e.target.value)} className={`${inputClass} mt-2`} /></label>
        <label className="text-xs font-medium text-gray-600">Below amount (₹, exclusive)<input aria-label={`Range ${index + 1} maximum`} type="number" min="0" step="0.01" placeholder="No limit" value={row.max} onChange={e => update(index, 'max', e.target.value)} className={`${inputClass} mt-2`} /></label>
        <label className="text-xs font-medium text-gray-600">Points earned<input aria-label={`Range ${index + 1} points`} type="number" min="1" max="1000000" step="1" required value={row.points} onChange={e => update(index, 'points', e.target.value)} className={`${inputClass} mt-2`} /></label>
        <button type="button" onClick={() => { setRanges(rows => rows.filter((_, i) => i !== index)); setNotice(""); }} className="self-end rounded-lg border border-red-100 px-3 py-2.5 text-sm text-red-600">Remove range {index + 1}</button>
      </div>)}
      <button type="button" disabled={ranges.length >= 100} onClick={() => { setRanges(rows => [...rows, { min: "", max: "", points: "" }]); setNotice(""); }} className="rounded-lg border border-purple-200 px-4 py-2 text-sm font-semibold text-[#852BAF]">Add range</button>
      <label className="block max-w-xs text-sm text-gray-600">Points expire after (days)<input type="number" min="1" max="3650" required value={expiry} onChange={e => { setExpiry(e.target.value); setNotice(""); }} className={`${inputClass} mt-2`} /></label>
    </fieldset>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {notice && <p role="status" className="text-sm text-green-700">{notice}</p>}
    <button disabled={saving} className="rounded-lg bg-[#852BAF] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Save ranges"}</button>
  </form>;
}
