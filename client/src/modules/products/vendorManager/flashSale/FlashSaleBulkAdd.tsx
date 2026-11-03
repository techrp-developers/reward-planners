import { useState } from "react";
import { FiPlus } from "react-icons/fi";
import axios from "axios";
import Swal from "sweetalert2";
import { api } from "../../../../common/api/api";
import ContentTargetSelector from "../../content_manager/component/ContentTargetSelector";
import type { ContentTargetType } from "../../content_manager/types";

interface Props {
  campaignId: string;
  module: "product" | "service";
  onAdded: () => Promise<void>;
}

const fieldClass = "w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100";

export default function FlashSaleBulkAdd({ campaignId, module, onAdded }: Props) {
  const [targetType, setTargetType] = useState<ContentTargetType | "">("");
  const [targetId, setTargetId] = useState<number | null>(null);
  const [targetIds, setTargetIds] = useState<number[]>([]);
  const [discount, setDiscount] = useState("");
  const [maxQty, setMaxQty] = useState("");
  const [adding, setAdding] = useState(false);

  const selectedIds = targetIds.length ? targetIds : targetId ? [targetId] : [];
  const discountValue = Number(discount);
  const canAdd = selectedIds.length > 0 && discountValue > 0 && discountValue < 100 && !adding;

  const add = async () => {
    try {
      setAdding(true);
      const { data } = await api.post(`/campaign/campaigns/${campaignId}/items/bulk`, {
        target_type: targetType,
        target_ids: selectedIds,
        discount_percent: discountValue,
        max_qty: maxQty || undefined,
      });
      setTargetType("");
      setTargetId(null);
      setTargetIds([]);
      await onAdded();
      await Swal.fire({ icon: data.data?.added ? "success" : "info", title: data.message, timer: 1500, showConfirmButton: false });
    } catch (error: unknown) {
      const message = axios.isAxiosError(error) ? error.response?.data?.message : null;
      await Swal.fire("Unable to add items", message || "Please try again.", "error");
    } finally {
      setAdding(false);
    }
  };

  return (
    <section className="rounded-3xl border border-purple-100 bg-white p-6 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-wider text-[#852BAF]">Quick add</p>
      <h2 className="text-xl font-black text-gray-900">{module === "service" ? "Add a category or services" : "Add a category, subcategory, or products"}</h2>
      <p className="mt-1 text-xs text-gray-500">Every eligible variant joins at the shared discount. Items already in this sale keep their prices, and each row below can still be edited.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <ContentTargetSelector
          module={module}
          multiple
          excludeBundles
          title="What to add"
          description={module === "service" ? "Choose a service category or individual services." : "Choose a category, subcategory, or individual products."}
          targetType={targetType}
          targetId={targetId}
          targetIds={targetIds}
          onChange={(nextType, nextId, nextIds = []) => { setTargetType(nextType); setTargetId(nextId); setTargetIds(nextIds); }}
        />
        <label>
          <span className="mb-2 block text-xs font-bold text-gray-500">Discount % *</span>
          <input type="number" min="0.01" max="99.99" step="0.01" value={discount} onChange={(event) => setDiscount(event.target.value)} className={fieldClass} placeholder="e.g. 20" />
        </label>
        {module === "product" && (
          <label>
            <span className="mb-2 block text-xs font-bold text-gray-500">Max quantity per variant</span>
            <input type="number" min="1" step="1" value={maxQty} onChange={(event) => setMaxQty(event.target.value)} className={fieldClass} placeholder="Defaults to current stock" />
          </label>
        )}
      </div>
      <button type="button" disabled={!canAdd} onClick={() => void add()} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#852BAF] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">
        <FiPlus /> {adding ? "Adding..." : "Add to flash sale"}
      </button>
    </section>
  );
}
