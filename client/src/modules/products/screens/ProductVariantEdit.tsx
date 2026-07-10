import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../../../common/api/api";
import { FaArrowLeft, FaCubes } from "react-icons/fa";

/* ================= SMALL UI HELPERS (same as onboarding) ================= */

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: any;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex items-center space-x-4 pb-4 border-b border-gray-100 mb-6">
      <div className="p-4 text-white rounded-2xl" style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)", boxShadow: "0 6px 20px rgba(133,43,175,0.25)" }}>
        <Icon className="text-2xl" />
      </div>
      <div>
        <h3 className="text-xl font-bold text-gray-800">{title}</h3>
        {description && (
          <p className="text-sm text-gray-500 font-medium">{description}</p>
        )}
      </div>
    </div>
  );
}

function FormInput({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  step,
  min,
  required,
}: {
  label: string;
  value: string | number;
  onChange: (e: any) => void;
  type?: string;
  placeholder?: string;
  step?: string;
  min?: string;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col space-y-1.5">
      <label className="text-xs font-bold uppercase tracking-wider text-gray-600 ml-1">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        step={step}
        min={min}
        required={required}
        className="px-4 py-3 bg-gray-50/50 border border-gray-200 rounded-xl
  focus:ring-4 focus:ring-[#852BAF]/20 focus:border-[#852BAF]
  focus:bg-white transition-all outline-none text-sm"
      />
    </div>
  );
}

/* ================= MAIN COMPONENT ================= */

export default function ProductVariantEdit() {
  const { variantId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [variant, setVariant] = useState<any>(null);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    mrp: "",
    sale_price: "",
    stock: "",
    manufacturing_date: "",
    expiry_date: "",
    weight: "",
    length: "",
    breadth: "",
    height: "",
  });

  /* ================= FETCH DATA ================= */
  useEffect(() => {
    if (!variantId) return;

    const fetchVariant = async () => {
      try {
        const res = await api.get(`/variant/${variantId}`);
        if (res.data?.success) {
          const v = res.data.data;
          setVariant(v);
          setForm({
            mrp: v.mrp ?? "",
            sale_price: v.sale_price ?? "",
            stock: v.stock ?? "",
            manufacturing_date: v.manufacturing_date ?? "",
            expiry_date: v.expiry_date ?? "",
            weight: v.weight ?? "",
            length: v.length ?? "",
            breadth: v.breadth ?? "",
            height: v.height ?? "",
          });
        }
      } finally {
        setLoading(false);
      }
    };

    fetchVariant();
  }, [variantId]);

  /* ================= SAVE ================= */
  const handleSave = async () => {
    if (
      !form.weight ||
      !form.length ||
      !form.breadth ||
      !form.height ||
      Number(form.weight) <= 0 ||
      Number(form.length) <= 0 ||
      Number(form.breadth) <= 0 ||
      Number(form.height) <= 0
    ) {
      setError("Weight and dimensions are mandatory.");
      return;
    }

    try {
      setSaving(true);
      await api.put(`/variant/${variantId}`, form);
      navigate(-1);
    } catch (err) {
      console.error(err);
      alert("Failed to update variant");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-gray-600">Loading variant...</div>;
  }

  if (!variant) {
    return <div className="p-6 text-red-600">Variant not found</div>;
  }

  /* ================= UI ================= */
  return (
    <div className="max-w-6xl mx-auto">
      {/* PAGE HEADER */}
      <div
        className="flex items-center justify-between mb-6 p-5 rounded-2xl"
        style={{
          background: "linear-gradient(135deg, rgba(133,43,175,0.06) 0%, rgba(252,63,120,0.04) 100%)",
          border: "1px solid rgba(133,43,175,0.1)",
        }}
      >
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">
            Edit Product <span className="gradient-text-brand">Variant</span>
          </h1>
          <p className="text-xs text-gray-500 font-medium mt-0.5">
            Update pricing, stock and lifecycle details
          </p>
        </div>

        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl border border-gray-200 bg-white text-gray-700 hover:border-[#852BAF] hover:text-[#852BAF] transition-all duration-200 cursor-pointer"
        >
          <FaArrowLeft size={12} /> Back
        </button>
      </div>

      {/* Variant Summary */}
      <section className="space-y-4 bg-white rounded-2xl p-6 sm:p-8 vendor-section-card" style={{ border: "1px solid rgba(133,43,175,0.08)", boxShadow: "0 4px 24px rgba(133,43,175,0.06)" }}>
        <SectionHeader
          icon={FaCubes}
          title="Variant Summary"
          description="SKU and attribute information"
        />

        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-400">SKU</p>
            <p className="text-lg font-semibold text-gray-900 mt-1">
              {variant.sku}
            </p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-gray-400 mb-2">
              Attributes
            </p>
            <div className="flex flex-wrap gap-2">
              {variant.variant_attributes &&
                Object.entries(variant.variant_attributes).map(
                  ([key, value]: any) => (
                    <span
                      key={key}
                      className="px-3 py-1.5 text-sm font-medium rounded-full bg-purple-50 text-purple-700 border border-purple-200"
                    >
                      {key.toUpperCase()}: {value}
                    </span>
                  ),
                )}
            </div>
          </div>
        </div>
      </section>

      {/* Editable Form */}
      <section className="mt-4 space-y-4 bg-white rounded-2xl p-6 sm:p-8 vendor-section-card" style={{ border: "1px solid rgba(133,43,175,0.08)" }}>
        <SectionHeader
          icon={FaCubes}
          title="Variant Details"
          description="Edit commercial and lifecycle fields"
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <FormInput
            label="MRP"
            type="number"
            value={form.mrp}
            onChange={(e) => setForm({ ...form, mrp: e.target.value })}
            placeholder="Enter MRP"
          />

          <FormInput
            label="Sale Price"
            type="number"
            value={form.sale_price}
            onChange={(e) => setForm({ ...form, sale_price: e.target.value })}
            placeholder="Enter sale price"
          />

          <FormInput
            label="Stock"
            type="number"
            value={form.stock}
            onChange={(e) => setForm({ ...form, stock: e.target.value })}
            placeholder="Available stock"
          />
        </div>

        {/* Logistics Fields */}
        <div className="mt-7">
          <h4 className="text-sm font-bold text-gray-700 mb-4 uppercase tracking-wide">
            Logistics & Packaging
          </h4>

          {error && (
            <p className="text-xs text-red-600 mb-3 font-medium">{error}</p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <FormInput
              label="Weight (KG)"
              type="number"
              value={form.weight}
              onChange={(e) => {
                setError("");
                setForm({ ...form, weight: e.target.value });
              }}
              placeholder="0.5"
              step="0.001"
              min="0.001"
              required
            />

            <FormInput
              label="Length (CM)"
              type="number"
              value={form.length}
              onChange={(e) => {
                setError("");
                setForm({ ...form, length: e.target.value });
              }}
              placeholder="10"
              step="0.01"
              min="0.01"
              required
            />

            <FormInput
              label="Breadth (CM)"
              type="number"
              value={form.breadth}
              onChange={(e) => {
                setError("");
                setForm({ ...form, breadth: e.target.value });
              }}
              placeholder="10"
              step="0.01"
              min="0.01"
              required
            />

            <FormInput
              label="Height (CM)"
              type="number"
              value={form.height}
              onChange={(e) => {
                setError("");
                setForm({ ...form, height: e.target.value });
              }}
              placeholder="10"
              step="0.01"
              min="0.01"
              required
            />
          </div>

          {/*  volumetric weight preview  */}
          {Number(form.weight) > 0 &&
            Number(form.length) > 0 &&
            Number(form.breadth) > 0 &&
            Number(form.height) > 0 && (
              <p className="text-xs mt-2 font-medium text-gray-700">
                Billable Weight:{" "}
                {Math.max(
                  Number(form.weight),
                  (Number(form.length) *
                    Number(form.breadth) *
                    Number(form.height)) /
                    5000,
                ).toFixed(2)}{" "}
                kg
              </p>
            )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <FormInput
            label="Manufacturing Date"
            type="date"
            value={form.manufacturing_date}
            onChange={(e) =>
              setForm({ ...form, manufacturing_date: e.target.value })
            }
          />

          <FormInput
            label="Expiry Date"
            type="date"
            value={form.expiry_date}
            onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
          />
        </div>
      </section>

      {/* Action Bar */}
      <div className="flex justify-end gap-3 pt-6">
        <button
          onClick={() => navigate(-1)}
          className="px-6 py-2.5 text-sm rounded-xl border border-gray-200 bg-white font-semibold text-gray-700 hover:border-gray-400 transition cursor-pointer"
        >
          Cancel
        </button>

        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 text-sm rounded-xl text-white font-semibold hover:opacity-90 active:scale-95 transition disabled:opacity-60 cursor-pointer"
          style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)", boxShadow: "0 4px 14px rgba(133,43,175,0.28)" }}
        >
          {saving ? "Saving..." : "Save Variant"}
        </button>
      </div>
    </div>
  );
}
