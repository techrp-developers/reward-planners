import React, { useEffect, useState } from "react";
import { api } from "../../../../api/api";
import Swal from "sweetalert2";
import { FiGift, FiEdit2, FiTrash2, FiPlus } from "react-icons/fi";

interface RewardRule {
  reward_rule_id: number;
  name: string;
  reward_type: string;
  reward_value: number;
}

interface Product {
  product_id: number;
  product_name: string;
}

interface Variant {
  variant_id: number;
  sku: string;
}

interface Category {
  category_id: number;
  category_name: string;
}

interface Subcategory {
  subcategory_id: number;
  subcategory_name: string;
}

interface Mapping {
  id: number;
  product_id?: number;
  variant_id?: number;
  category_id?: number;
  subcategory_id?: number;
  reward_rule_id: number;
  can_earn_reward: number;
  can_redeem_reward: number;
  rule_name?: string;
  product_name?: string;
  variant_name?: string;
  category_name?: string;
  subcategory_name?: string;
}

const selectCls =
  "w-full px-4 py-3 bg-gray-50/60 border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:ring-4 focus:ring-[#852BAF]/15 focus:border-[#852BAF] focus:bg-white transition-all cursor-pointer";

const targetBadge: Record<string, string> = {
  Variant: "bg-purple-50 text-purple-700 border border-purple-200",
  Product: "bg-blue-50 text-blue-700 border border-blue-200",
  Subcategory: "bg-amber-50 text-amber-700 border border-amber-200",
  Category: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  Global: "bg-gray-100 text-gray-600 border border-gray-200",
};

const ProductRewardMapping = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [rules, setRules] = useState<RewardRule[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [targetType, setTargetType] = useState("product");

  const [form, setForm] = useState({
    product_id: "",
    variant_id: "",
    category_id: "",
    subcategory_id: "",
    reward_rule_id: "",
    can_earn_reward: 1,
    can_redeem_reward: 1,
  });

  useEffect(() => {
    fetchProducts();
    fetchRules();
    fetchMappings();
    fetchCategories();
  }, []);

  useEffect(() => {
    const existing = findExistingMappingForSelection();

    if (!existing) {
      setEditingId(null);
      return;
    }

    setEditingId(existing.id);
    setForm((prev) => ({
      ...prev,
      reward_rule_id: existing.reward_rule_id?.toString() || "",
      can_earn_reward: Number(existing.can_earn_reward),
      can_redeem_reward: Number(existing.can_redeem_reward),
    }));
  }, [
    targetType,
    form.product_id,
    form.variant_id,
    form.category_id,
    form.subcategory_id,
    form.reward_rule_id,
    mappings,
  ]);

  const fetchProducts = async () => {
    const res = await api.get("/product/product-list");
    setProducts(res.data?.products || []);
  };

  const fetchRules = async () => {
    const res = await api.get("/reward/get-rule");
    setRules(res.data?.data || []);
  };

  const fetchMappings = async () => {
    const res = await api.get("/reward/product-reward-settings");
    setMappings(res.data?.data || []);
  };

  const fetchCategories = async () => {
    const res = await api.get("/category");
    setCategories(res.data?.data || []);
  };

  const handleProductChange = async (productId: string) => {
    setForm((prev) => ({ ...prev, product_id: productId, variant_id: "" }));
    if (!productId) return;
    const res = await api.get(`/variant/product/${productId}`);
    setVariants(res.data.data || []);
  };

  const handleCategoryChange = async (categoryId: string) => {
    setForm((prev) => ({ ...prev, category_id: categoryId, subcategory_id: "" }));
    const res = await api.get(`/subcategory/${categoryId}`);
    setSubcategories(res.data.data || []);
  };

  const handleTargetTypeChange = (value: string) => {
    setTargetType(value);
    setEditingId(null);
    setVariants([]);
    setSubcategories([]);
    setForm((prev) => ({
      ...prev,
      product_id: "",
      variant_id: "",
      category_id: "",
      subcategory_id: "",
      reward_rule_id: "",
      can_earn_reward: 1,
      can_redeem_reward: 1,
    }));
  };

  const findExistingMappingForSelection = () => {
    if (!form.reward_rule_id) return undefined;

    const hasSameRule = (m: Mapping) =>
      Number(m.reward_rule_id) === Number(form.reward_rule_id);

    if (targetType === "global") {
      return mappings.find(
        (m) =>
          hasSameRule(m) &&
          !m.product_id &&
          !m.variant_id &&
          !m.category_id &&
          !m.subcategory_id,
      );
    }

    if (targetType === "product" && form.product_id) {
      return mappings.find(
        (m) =>
          hasSameRule(m) &&
          Number(m.product_id) === Number(form.product_id) &&
          !m.variant_id,
      );
    }

    if (targetType === "variant" && form.product_id && form.variant_id) {
      return mappings.find(
        (m) =>
          hasSameRule(m) &&
          Number(m.product_id) === Number(form.product_id) &&
          Number(m.variant_id) === Number(form.variant_id),
      );
    }

    if (targetType === "category" && form.category_id) {
      return mappings.find(
        (m) =>
          hasSameRule(m) &&
          Number(m.category_id) === Number(form.category_id),
      );
    }

    if (targetType === "subcategory" && form.subcategory_id) {
      return mappings.find(
        (m) =>
          hasSameRule(m) &&
          Number(m.subcategory_id) === Number(form.subcategory_id),
      );
    }

    return undefined;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const payload: Record<string, number> = {
        reward_rule_id: Number(form.reward_rule_id),
        can_earn_reward: Number(form.can_earn_reward),
        can_redeem_reward: Number(form.can_redeem_reward),
      };

      if (targetType === "variant") {
        payload.product_id = Number(form.product_id);
        payload.variant_id = Number(form.variant_id);
      } else if (targetType === "product") {
        payload.product_id = Number(form.product_id);
      } else if (targetType === "subcategory") {
        payload.subcategory_id = Number(form.subcategory_id);
      } else if (targetType === "category") {
        payload.category_id = Number(form.category_id);
      }

      await api.post("/reward/product-reward-settings", payload);

      await Swal.fire({
        title: editingId ? "Updated!" : "Created!",
        text: editingId ? "Mapping updated successfully." : "Mapping created successfully.",
        icon: "success",
        timer: 1400,
        showConfirmButton: false,
        customClass: { popup: "rounded-2xl" },
      });

      resetForm();
      fetchMappings();
    } catch (err) {
      console.error(err);
      Swal.fire({
        title: "Failed",
        text: "Failed to save mapping.",
        icon: "error",
        customClass: { popup: "rounded-2xl" },
      });
    }
  };

  const handleEdit = async (m: Mapping) => {
    setEditingId(m.id);
    if (m.variant_id) setTargetType("variant");
    else if (m.product_id) setTargetType("product");
    else if (m.subcategory_id) setTargetType("subcategory");
    else if (m.category_id) setTargetType("category");
    else setTargetType("global");

    setForm({
      product_id: m.product_id?.toString() || "",
      variant_id: m.variant_id?.toString() || "",
      category_id: m.category_id?.toString() || "",
      subcategory_id: m.subcategory_id?.toString() || "",
      reward_rule_id: m.reward_rule_id.toString(),
      can_earn_reward: m.can_earn_reward,
      can_redeem_reward: m.can_redeem_reward,
    });

    if (m.product_id) {
      const res = await api.get(`/variant/product/${m.product_id}`);
      setVariants(res.data.data || []);
    }

    if (m.category_id) {
      const res = await api.get(`/subcategory/${m.category_id}`);
      setSubcategories(res.data.data || []);
    }
  };

  const handleDelete = async (id: number) => {
    const result = await Swal.fire({
      title: "Delete Mapping?",
      text: "This action cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#DC2626",
      cancelButtonColor: "#9CA3AF",
      reverseButtons: true,
      customClass: { popup: "rounded-2xl" },
    });

    if (!result.isConfirmed) return;

    await api.delete(`/reward/product-reward-settings/${id}`);
    await Swal.fire({
      title: "Deleted",
      icon: "success",
      timer: 1200,
      showConfirmButton: false,
      customClass: { popup: "rounded-2xl" },
    });
    fetchMappings();
  };

  const resetForm = () => {
    setEditingId(null);
    setTargetType("product");
    setForm({
      product_id: "",
      variant_id: "",
      category_id: "",
      subcategory_id: "",
      reward_rule_id: "",
      can_earn_reward: 1,
      can_redeem_reward: 1,
    });
  };

  const getTargetLabel = (m: Mapping) => {
    if (m.variant_id) return "Variant";
    if (m.product_id) return "Product";
    if (m.subcategory_id) return "Subcategory";
    if (m.category_id) return "Category";
    return "Global";
  };

  const getTargetDetails = (m: Mapping) => {
    const target = getTargetLabel(m);
    if (target === "Variant") return `${m.product_name} → ${m.variant_name}`;
    if (target === "Product") return m.product_name;
    if (target === "Subcategory") return m.subcategory_name;
    if (target === "Category") return m.category_name;
    return "—";
  };

  const ToggleChip = ({
    checked,
    label,
    onChange,
  }: {
    checked: boolean;
    label: string;
    onChange: () => void;
  }) => (
    <button
      type="button"
      onClick={onChange}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all cursor-pointer ${
        checked
          ? "text-emerald-700 bg-emerald-50 border-emerald-200"
          : "text-gray-400 bg-gray-50 border-gray-200 hover:border-gray-300"
      }`}
    >
      <div
        className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
          checked ? "bg-emerald-500 border-emerald-500" : "bg-white border-gray-300"
        }`}
      />
      {label}
    </button>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* ── PAGE HEADER ── */}
      <div
        className="flex items-center justify-between p-5 rounded-2xl"
        style={{
          background: "linear-gradient(135deg, rgba(133,43,175,0.06) 0%, rgba(252,63,120,0.04) 100%)",
          border: "1px solid rgba(133,43,175,0.1)",
        }}
      >
        <div className="flex items-center gap-4">
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shrink-0"
            style={{
              background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)",
              boxShadow: "0 6px 20px rgba(133,43,175,0.25)",
            }}
          >
            <FiGift size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">
              Reward <span className="gradient-text-brand">Mapping</span>
            </h1>
            <p className="text-xs text-gray-500 font-medium mt-0.5">
              Map reward rules to products, variants, categories, or globally
            </p>
          </div>
        </div>
        {editingId && (
          <button
            onClick={resetForm}
            className="px-4 py-2 text-xs font-bold text-gray-500 bg-white border border-gray-200 rounded-xl hover:border-gray-300 transition-all cursor-pointer"
          >
            Cancel Edit
          </button>
        )}
      </div>

      {/* ── FORM CARD ── */}
      <div
        className="bg-white rounded-2xl vendor-section-card p-6"
        style={{ border: "1px solid rgba(133,43,175,0.08)", boxShadow: "0 4px 24px rgba(133,43,175,0.06)" }}
      >
        <h3 className="text-sm font-extrabold text-gray-700 uppercase tracking-widest mb-5 flex items-center gap-2">
          <FiPlus className="text-[#852BAF]" size={14} />
          {editingId ? "Edit Mapping" : "Create New Mapping"}
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* TARGET TYPE */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Target Type</label>
              <select
                value={targetType}
              onChange={(e) => handleTargetTypeChange(e.target.value)}
                className={selectCls}
              >
                <option value="variant">Variant</option>
                <option value="product">Product</option>
                <option value="subcategory">Subcategory</option>
                <option value="category">Category</option>
                <option value="global">Global</option>
              </select>
            </div>

            {/* RULE */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Reward Rule</label>
              <select
                value={form.reward_rule_id}
                onChange={(e) => setForm({ ...form, reward_rule_id: e.target.value })}
                className={selectCls}
                required
              >
                <option value="">Select Rule</option>
                {rules.map((r) => (
                  <option key={r.reward_rule_id} value={r.reward_rule_id}>
                    {r.name} ({r.reward_type === "percentage" ? `${r.reward_value}%` : `₹${r.reward_value}`})
                  </option>
                ))}
              </select>
            </div>

            {/* PRODUCT */}
            {(targetType === "product" || targetType === "variant") && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Product</label>
                <select
                  value={form.product_id}
                  onChange={(e) => handleProductChange(e.target.value)}
                  className={selectCls}
                  required
                >
                  <option value="">Select Product</option>
                  {products.map((p) => (
                    <option key={p.product_id} value={p.product_id}>
                      {p.product_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* VARIANT */}
            {targetType === "variant" && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Variant</label>
                <select
                  value={form.variant_id}
                  onChange={(e) => setForm({ ...form, variant_id: e.target.value })}
                  className={selectCls}
                  required
                >
                  <option value="">Select Variant</option>
                  {variants.map((v) => (
                    <option key={v.variant_id} value={v.variant_id}>{v.sku}</option>
                  ))}
                </select>
              </div>
            )}

            {/* CATEGORY */}
            {(targetType === "category" || targetType === "subcategory") && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Category</label>
                <select
                  value={form.category_id}
                  onChange={(e) => handleCategoryChange(e.target.value)}
                  className={selectCls}
                  required
                >
                  <option value="">Select Category</option>
                  {categories.map((c) => (
                    <option key={c.category_id} value={c.category_id}>{c.category_name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* SUBCATEGORY */}
            {targetType === "subcategory" && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Subcategory</label>
                <select
                  value={form.subcategory_id}
                  onChange={(e) => setForm({ ...form, subcategory_id: e.target.value })}
                  className={selectCls}
                  required
                >
                  <option value="">Select Subcategory</option>
                  {subcategories.map((s) => (
                    <option key={s.subcategory_id} value={s.subcategory_id}>{s.subcategory_name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* TOGGLES */}
          <div className="flex flex-wrap gap-3 pt-1">
            <ToggleChip
              checked={!!form.can_earn_reward}
              label="Can Earn Reward"
              onChange={() => setForm((p) => ({ ...p, can_earn_reward: p.can_earn_reward ? 0 : 1 }))}
            />
            <ToggleChip
              checked={!!form.can_redeem_reward}
              label="Can Redeem Reward"
              onChange={() => setForm((p) => ({ ...p, can_redeem_reward: p.can_redeem_reward ? 0 : 1 }))}
            />
          </div>

          {editingId && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Existing mapping found for this target. Saving will update that mapping instead of creating a duplicate.
            </div>
          )}

          <button
            type="submit"
            className="flex items-center gap-2 px-6 py-3 text-sm font-bold text-white rounded-xl cursor-pointer transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)" }}
          >
            {editingId ? <FiEdit2 size={14} /> : <FiPlus size={14} />}
            {editingId ? "Update Existing Mapping" : "Create Mapping"}
          </button>
        </form>
      </div>

      {/* ── TABLE ── */}
      <div
        className="bg-white rounded-2xl vendor-section-card overflow-hidden"
        style={{ border: "1px solid rgba(133,43,175,0.08)", boxShadow: "0 4px 24px rgba(133,43,175,0.06)" }}
      >
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr style={{ background: "linear-gradient(90deg, rgba(133,43,175,0.04) 0%, rgba(252,63,120,0.02) 100%)" }}>
                {["Target", "Details", "Rule", "Earn", "Redeem", "Actions"].map((h) => (
                  <th
                    key={h}
                    className="px-5 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-50">
              {mappings.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3"
                      style={{ background: "linear-gradient(135deg, rgba(133,43,175,0.08) 0%, rgba(252,63,120,0.05) 100%)" }}
                    >
                      <FiGift className="text-[#852BAF] opacity-50" size={22} />
                    </div>
                    <p className="text-sm text-gray-500">No mappings found. Create one above.</p>
                  </td>
                </tr>
              ) : (
                mappings.map((m, i) => {
                  const target = getTargetLabel(m);
                  const details = getTargetDetails(m);
                  return (
                    <tr
                      key={m.id}
                      className="row-animate hover:bg-purple-50/20 transition-colors"
                      style={{ animationDelay: `${i * 35}ms` }}
                    >
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide ${targetBadge[target] || targetBadge["Global"]}`}>
                          {target}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-700 font-medium max-w-48 truncate">
                        {details || "—"}
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-700 font-semibold">
                        {m.rule_name || "—"}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold ${m.can_earn_reward ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-gray-100 text-gray-400 border border-gray-200"}`}>
                          {m.can_earn_reward ? "Yes" : "No"}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold ${m.can_redeem_reward ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-gray-100 text-gray-400 border border-gray-200"}`}>
                          {m.can_redeem_reward ? "Yes" : "No"}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEdit(m)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#852BAF] bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-xl cursor-pointer transition-all"
                          >
                            <FiEdit2 size={11} /> Edit
                          </button>
                          <button
                            onClick={() => handleDelete(m.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl cursor-pointer transition-all"
                          >
                            <FiTrash2 size={11} /> Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ProductRewardMapping;
