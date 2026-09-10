import { useEffect, useState } from "react";
import { FiLink, FiSearch } from "react-icons/fi";
import { toast } from "sonner";
import { listContentTargetOptions, type ContentTargetOption } from "../api/ContentApi";
import type { ContentTargetType } from "../types";

interface Props {
  targetType: ContentTargetType | "";
  targetId: number | null;
  onChange: (targetType: ContentTargetType | "", targetId: number | null) => void;
}

const fieldClass = "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100";

export default function ContentTargetSelector({ targetType, targetId, onChange }: Props) {
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<ContentTargetOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!targetType) { setOptions([]); return; }
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        setOptions(await listContentTargetOptions(targetType, search, targetId));
      } catch {
        setOptions([]);
        toast.error("Unable to load content destinations");
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search, targetId, targetType]);

  return (
    <div className="sm:col-span-2 rounded-2xl border border-purple-100 bg-purple-50/40 p-4">
      <div className="flex items-center gap-2"><FiLink className="text-[#852BAF]" /><p className="text-xs font-black text-slate-700">Mobile click destination</p></div>
      <p className="mt-1 text-[11px] text-slate-500">Choose what opens when the user taps this content below the navbar.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <select value={targetType} onChange={(event) => { onChange(event.target.value as ContentTargetType | "", null); setSearch(""); }} className={fieldClass}>
          <option value="">No destination</option>
          <option value="product">Product</option>
          <option value="category">Category</option>
          <option value="subcategory">Subcategory</option>
        </select>
        {targetType && (
          <>
            <label className="relative"><FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${targetType}...`} className={`${fieldClass} pl-10`} /></label>
            <select value={targetId ?? ""} onChange={(event) => onChange(targetType, event.target.value ? Number(event.target.value) : null)} className={fieldClass}>
              <option value="">{loading ? "Loading..." : `Select ${targetType}`}</option>
              {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </>
        )}
      </div>
    </div>
  );
}
