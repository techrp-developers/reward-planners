import { useEffect, useState } from "react";
import { api } from "../../../../common/api/api";
import { FiPlus, FiTrash2, FiSave } from "react-icons/fi";
import Swal from "sweetalert2";

interface Props {
  attributeId: number;
}

export default function AttributeValueManager({ attributeId }: Props) {
  const [values, setValues] = useState<string[]>([""]);

  const fetchValues = async () => {
    const res = await api.get(`/manager/category-attribute-values/${attributeId}`);
    const fetched = res.data.data.map((v: { value: string }) => v.value);
    setValues(fetched.length ? fetched : [""]);
  };

  useEffect(() => {
    fetchValues();
  }, [attributeId]);

  const inputCls =
    "flex-1 px-4 py-2.5 bg-gray-50/60 border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:ring-4 focus:ring-[#852BAF]/15 focus:border-[#852BAF] focus:bg-white transition-all";

  return (
    <div
      className="mt-6 pt-5 border-t"
      style={{ borderColor: "rgba(133,43,175,0.15)" }}
    >
      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
        Manage Options
      </p>

      <div className="space-y-2">
        {values.map((val, index) => (
          <div key={index} className="flex gap-2 items-center">
            <input
              value={val}
              onChange={(e) => {
                const copy = [...values];
                copy[index] = e.target.value;
                setValues(copy);
              }}
              className={inputCls}
              placeholder={`Option ${index + 1}…`}
            />
            <button
              onClick={() => {
                const copy = values.filter((_, i) => i !== index);
                setValues(copy.length ? copy : [""]);
              }}
              className="p-2.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all cursor-pointer"
            >
              <FiTrash2 size={15} />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={() => setValues([...values, ""])}
        className="flex items-center gap-1.5 mt-3 text-xs font-bold text-[#852BAF] hover:opacity-70 transition-opacity cursor-pointer"
      >
        <FiPlus size={14} /> Add Option
      </button>

      <button
        onClick={async () => {
          const cleaned = values.map((v) => v.trim()).filter(Boolean);

          if (!cleaned.length) {
            return Swal.fire("No values added", "Please add at least one option", "warning");
          }

          try {
            await api.post(`/manager/category-attribute-values`, {
              attribute_id: attributeId,
              values: cleaned,
            });
            await fetchValues();
            Swal.fire({
              title: "Saved",
              text: "Attribute options saved successfully",
              icon: "success",
              timer: 1200,
              showConfirmButton: false,
              customClass: { popup: "rounded-2xl" },
            });
          } catch (err: unknown) {
            const e = err as { response?: { data?: { message?: string } } };
            Swal.fire("Error", e.response?.data?.message || "Failed to save options", "error");
          }
        }}
        className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white rounded-xl cursor-pointer transition-all hover:opacity-90 active:scale-[0.98]"
        style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)" }}
      >
        <FiSave size={14} /> Save Options
      </button>
    </div>
  );
}
