import React, { useEffect, useState, useRef } from "react";
import Swal from "sweetalert2";
import { FiTrash2, FiEye, FiPlus, FiX, FiSave, FiLayers } from "react-icons/fi";
import { api } from "../../../../common/api/api";
import { confirmDialog } from "../../../../common/utils/confirmDialog";
import { getPageNumbers } from "../../../../common/utils/pagination";
import "datatables.net";
import "datatables.net-responsive";
import AttributeValueManager from "./attributeValueManager";

type InputType = "text" | "number" | "select" | "multiselect" | "textarea";

interface Category {
  category_id: number;
  name: string;
}

interface Subcategory {
  subcategory_id: number;
  category_id: number;
  subcategory_name: string;
}

interface Attribute {
  id: number;
  category_id?: number;
  subcategory_id?: number;
  category_name?: string | null;
  subcategory_name?: string | null;
  attribute_key: string;
  attribute_label: string;
  input_type: InputType | "";
  is_variant: number;
  is_required: number;
  sort_order: number;
  created_at: string;
}

export default function CategoryAttributeManagement() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [attributes, setAttributes] = useState<Attribute[]>([]);

  const [categoryId, setCategoryId] = useState<number | "">("");
  const [subcategoryId, setSubcategoryId] = useState<number | "">("");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<Attribute | null>(null);
  const dataTableRef = useRef<any>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;

  const filteredAttributes = attributes.filter((a) => {
    const term = searchTerm.toLowerCase();

    return (
      a.attribute_key.toLowerCase().includes(term) ||
      a.attribute_label.toLowerCase().includes(term) ||
      (a.category_name || "").toLowerCase().includes(term) ||
      (a.subcategory_name || "").toLowerCase().includes(term) ||
      (a.input_type || "").toLowerCase().includes(term)
    );
  });

  const totalPages = Math.ceil(filteredAttributes.length / rowsPerPage);

  const paginatedAttributes = filteredAttributes.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage,
  );

  const pageNumbers = getPageNumbers(currentPage, totalPages);

  const [form, setForm] = useState({
    attribute_key: "",
    attribute_label: "",
    input_type: "text" as InputType,
    is_variant: 0,
    is_required: 0,
    sort_order: 0,
  });

  /* ------------------ FETCH ------------------ */

  const fetchCategories = async () => {
    const res = await api.get("/category");
    setCategories(
      (res.data.data || []).map((c: any) => ({
        category_id: c.category_id,
        name: c.category_name,
      })),
    );
  };

  const fetchSubcategories = async () => {
    const res = await api.get("/subcategory");
    setSubcategories(res.data.data || []);
  };

  const fetchAttributes = async () => {
    const res = await api.get("/manager/category-attributes", {
      params: {
        category_id: categoryId || undefined,
        subcategory_id: subcategoryId || undefined,
      },
    });
    setAttributes(res.data.data || []);
  };

  useEffect(() => {
    return () => {
      if (dataTableRef.current) {
        dataTableRef.current.destroy(true);
      }
    };
  }, []);

  useEffect(() => {
    fetchCategories();
    fetchSubcategories();
  }, []);

  useEffect(() => {
    fetchAttributes();
  }, [categoryId, subcategoryId]);

  // useEffect(() => {
  //   fetchAttributes();
  // }, []);

  /* ------------------ HANDLERS ------------------ */

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!categoryId && !subcategoryId) {
      return Swal.fire("Select category or subcategory", "", "warning");
    }

    try {
      await api.post("/manager/category-attributes", {
        ...form,
        category_id: categoryId || null,
        subcategory_id: subcategoryId || null,
      });

      setForm({
        attribute_key: "",
        attribute_label: "",
        input_type: "text",
        is_variant: 0,
        is_required: 0,
        sort_order: 0,
      });

      fetchAttributes();
      Swal.fire("Created", "Attribute added successfully", "success");
    } catch (err: any) {
      Swal.fire("Error", err.response?.data?.message, "error");
    }
  };

  const handleDelete = async (id: number) => {
    const confirmed = await confirmDialog({
      title: "Delete attribute?",
      text: "This cannot be undone",
    });

    if (!confirmed) return;

    try {
      await api.delete(`/manager/category-attributes/${id}`);
      fetchAttributes();
      Swal.fire("Deleted", "", "success");
    } catch (err: any) {
      Swal.fire("Blocked", err.response?.data?.message, "error");
    }
  };

  const handleSave = async () => {
    if (!selected) return;

    try {
      await api.put(`/manager/category-attributes/${selected.id}`, {
        attribute_label: selected.attribute_label,
        is_variant: selected.is_variant,
        is_required: selected.is_required,
        sort_order: selected.sort_order,
      });

      await fetchAttributes(); 
      setSelected(null);
      setDrawerOpen(false); 

      Swal.fire("Updated", "", "success");
    } catch (err: any) {
      Swal.fire("Error", err.response?.data?.message, "error");
    }
  };

  /* ------------------ UI ------------------ */

  const labelCls = "block mb-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-gray-400";
  const inputCls = "w-full h-10 px-3 rounded-xl border border-gray-200 bg-gray-50/60 text-sm font-medium text-gray-800 outline-none focus:ring-2 focus:ring-[#852BAF]/20 focus:border-[#852BAF]/40 transition";

  return (
    <div className="w-full min-h-screen">
      <div className="p-6 bg-white border border-gray-200 shadow-lg rounded-2xl">

        {/* HEADER */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-gradient-to-r from-[#852BAF] to-[#FC3F78] rounded-full flex items-center justify-center shrink-0 shadow-md">
              <FiLayers className="text-xl text-white" />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-gray-900">Attribute Management</h2>
              <p className="mt-1 text-sm text-gray-500">Manage category &amp; subcategory attributes</p>
            </div>
          </div>
        </div>

        {/* FILTERS + ADD FORM CARD */}
        <div className="p-6 mb-6 bg-white border border-gray-100 shadow-sm rounded-2xl">
          <p className="mb-4 text-xs font-bold tracking-widest text-gray-400 uppercase">Filters</p>

          <div className="grid items-end grid-cols-2 gap-4 mb-6 md:grid-cols-4">
            <div>
              <label className={labelCls}>Category</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : "")}
                className={inputCls + " bg-white"}
              >
                <option value="">All Categories</option>
                {categories.map((c) => (
                  <option key={c.category_id} value={c.category_id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelCls}>Subcategory</label>
              <select
                value={subcategoryId}
                onChange={(e) => setSubcategoryId(e.target.value ? Number(e.target.value) : "")}
                className={inputCls + " bg-white"}
              >
                <option value="">All Subcategories</option>
                {subcategories
                  .filter((s) => s.category_id === categoryId)
                  .map((s) => (
                    <option key={s.subcategory_id} value={s.subcategory_id}>{s.subcategory_name}</option>
                  ))}
              </select>
            </div>
          </div>

          <p className="mb-4 text-xs font-bold tracking-widest text-gray-400 uppercase">Add New Attribute</p>

          <form onSubmit={handleAdd} className="grid items-end grid-cols-2 gap-4 md:grid-cols-6">
            <div className="col-span-2">
              <label className={labelCls}>Key</label>
              <input
                placeholder="e.g. color"
                value={form.attribute_key}
                onChange={(e) => setForm({ ...form, attribute_key: e.target.value })}
                className={inputCls}
              />
            </div>

            <div className="col-span-2">
              <label className={labelCls}>Label</label>
              <input
                placeholder="e.g. Color"
                value={form.attribute_label}
                onChange={(e) => setForm({ ...form, attribute_label: e.target.value })}
                className={inputCls}
              />
            </div>

            <div className="col-span-1">
              <label className={labelCls}>Input Type</label>
              <select
                value={form.input_type}
                onChange={(e) => setForm({ ...form, input_type: e.target.value as InputType })}
                className={inputCls + " bg-white"}
              >
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="select">Select</option>
                <option value="multiselect">Multi Select</option>
                <option value="textarea">Textarea</option>
              </select>
            </div>

            <div className="flex justify-end col-span-1">
              <button
                type="submit"
                className="h-10 px-5 whitespace-nowrap flex items-center gap-2 bg-gradient-to-r from-[#852BAF] to-[#FC3F78] text-white text-sm font-semibold rounded-xl shadow-md hover:opacity-90 active:scale-95 transition-all cursor-pointer"
              >
                <FiPlus /> Add Attribute
              </button>
            </div>
          </form>
        </div>

        {/* TABLE CARD */}
        <div className="bg-white border border-gray-100 shadow-sm rounded-2xl overflow-hidden">
          {/* Table header row with search */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <p className="text-xs font-bold tracking-widest text-gray-400 uppercase">Attributes List</p>
            <input
              type="text"
              placeholder="Search attributes..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="w-64 h-9 px-4 text-sm rounded-xl border border-gray-200 bg-gray-50/60 outline-none focus:ring-2 focus:ring-[#852BAF]/20 focus:border-[#852BAF]/40 transition"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead style={{ background: "linear-gradient(135deg, #fdf8ff 0%, #fff5f8 100%)" }}>
                <tr>
                  {["Category", "Subcategory", "Key", "Label", "Type", "Variant", "Required", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-4 text-[10px] font-black tracking-widest text-gray-400 uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-50">
                {paginatedAttributes.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-16 text-sm text-center text-gray-400">No attributes found</td>
                  </tr>
                ) : (
                  paginatedAttributes.map((a) => (
                    <tr key={a.id} className="bg-white transition-colors hover:bg-purple-50/30">
                      <td className="px-4 py-3 font-semibold text-gray-800">{a.category_name || <span className="text-gray-400">—</span>}</td>
                      <td className="px-4 py-3 text-gray-600">{a.subcategory_name || <span className="text-gray-400">—</span>}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-[#852BAF] bg-purple-50/80 px-2.5 py-1 rounded-lg border border-purple-100">{a.attribute_key}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{a.attribute_label}</td>
                      <td className="px-4 py-3">
                        <span className="px-2.5 py-0.5 text-[11px] font-semibold rounded-full border bg-gray-100 text-gray-600 border-gray-200 uppercase tracking-wide">{a.input_type || "—"}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-0.5 text-[11px] font-semibold rounded-full border uppercase tracking-wide ${a.is_variant ? "bg-green-100 text-green-700 border-green-200" : "bg-gray-100 text-gray-500 border-gray-200"}`}>
                          {a.is_variant ? "Yes" : "No"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-0.5 text-[11px] font-semibold rounded-full border uppercase tracking-wide ${a.is_required ? "bg-purple-100 text-[#852BAF] border-purple-200" : "bg-gray-100 text-gray-500 border-gray-200"}`}>
                          {a.is_required ? "Yes" : "No"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => { setSelected(a); setDrawerOpen(true); }}
                            className="w-8 h-8 flex items-center justify-center rounded-lg border border-purple-200 bg-purple-50 text-[#852BAF] hover:bg-[#852BAF] hover:text-white shadow-sm transition-all cursor-pointer"
                            title="View / Edit"
                          >
                            <FiEye size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(a.id)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white shadow-sm transition-all cursor-pointer"
                            title="Delete"
                          >
                            <FiTrash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* PAGINATION */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/60">
            <p className="text-xs text-gray-500">
              Showing {filteredAttributes.length === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1}–{Math.min(currentPage * rowsPerPage, filteredAttributes.length)} of {filteredAttributes.length}
            </p>
            <div className="flex gap-1.5">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => p - 1)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 bg-white text-gray-600 hover:border-[#852BAF] hover:text-[#852BAF] disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
              >
                Prev
              </button>
              {pageNumbers.map((page, i) =>
                page === "..." ? (
                  <span
                    key={`ellipsis-${i}`}
                    className="px-2 py-1.5 text-xs font-semibold text-gray-400"
                  >
                    ...
                  </span>
                ) : (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition cursor-pointer ${currentPage === page ? "bg-gradient-to-r from-[#852BAF] to-[#FC3F78] text-white border-transparent shadow-sm" : "bg-white border-gray-200 text-gray-600 hover:border-[#852BAF] hover:text-[#852BAF]"}`}
                  >
                    {page}
                  </button>
                ),
              )}
              <button
                disabled={currentPage === totalPages || totalPages === 0}
                onClick={() => setCurrentPage((p) => p + 1)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 bg-white text-gray-600 hover:border-[#852BAF] hover:text-[#852BAF] disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* DRAWER */}
      {drawerOpen && selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-[2px]">
          <div className="w-[440px] h-screen bg-white flex flex-col shadow-2xl">
            {/* Drawer Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-100" style={{ background: "linear-gradient(135deg, #fdf8ff 0%, #fff5f8 100%)" }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] flex items-center justify-center shadow-sm">
                  <FiLayers className="text-white" size={16} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Edit Attribute</h2>
                  <p className="text-[11px] text-gray-400 font-mono">{selected.attribute_key}</p>
                </div>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition cursor-pointer"
              >
                <FiX size={16} />
              </button>
            </div>

            {/* Read-only info */}
            <div className="grid grid-cols-2 gap-3 px-5 py-4 border-b border-gray-100 bg-gray-50/60">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Category</p>
                <p className="mt-0.5 text-sm font-semibold text-gray-700">{selected.category_name || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Subcategory</p>
                <p className="mt-0.5 text-sm font-semibold text-gray-700">{selected.subcategory_name || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Input Type</p>
                <span className="mt-0.5 inline-flex px-2.5 py-0.5 text-[11px] font-semibold rounded-full border bg-gray-100 text-gray-600 border-gray-200 uppercase tracking-wide">{selected.input_type || "—"}</span>
              </div>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 p-5 space-y-5 overflow-y-auto">
              <div>
                <label className="block mb-1.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Attribute Label</label>
                <input
                  value={selected.attribute_label}
                  onChange={(e) => setSelected({ ...selected, attribute_label: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50/60 text-sm font-medium text-gray-800 outline-none focus:ring-2 focus:ring-[#852BAF]/20 focus:border-[#852BAF]/40 transition"
                />
              </div>

              {/* Toggle: Variant */}
              <div className="flex items-center justify-between p-4 rounded-xl border border-gray-100 bg-gray-50/60">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Is Variant Attribute</p>
                  <p className="text-xs text-gray-400 mt-0.5">Used to generate product variants</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected({ ...selected, is_variant: selected.is_variant === 1 ? 0 : 1 })}
                  className={`relative w-11 h-6 rounded-full transition-all cursor-pointer ${selected.is_variant === 1 ? "bg-gradient-to-r from-[#852BAF] to-[#FC3F78]" : "bg-gray-200"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${selected.is_variant === 1 ? "translate-x-5" : ""}`} />
                </button>
              </div>

              {/* Toggle: Required */}
              <div className="flex items-center justify-between p-4 rounded-xl border border-gray-100 bg-gray-50/60">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Is Required</p>
                  <p className="text-xs text-gray-400 mt-0.5">Mandatory when adding products</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected({ ...selected, is_required: selected.is_required === 1 ? 0 : 1 })}
                  className={`relative w-11 h-6 rounded-full transition-all cursor-pointer ${selected.is_required === 1 ? "bg-gradient-to-r from-[#852BAF] to-[#FC3F78]" : "bg-gray-200"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${selected.is_required === 1 ? "translate-x-5" : ""}`} />
                </button>
              </div>

              <div>
                <label className="block mb-1.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Sort Order</label>
                <input
                  type="number"
                  value={selected.sort_order}
                  onChange={(e) => setSelected({ ...selected, sort_order: Number(e.target.value) })}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50/60 text-sm font-medium text-gray-800 outline-none focus:ring-2 focus:ring-[#852BAF]/20 focus:border-[#852BAF]/40 transition"
                />
              </div>

              {(selected.input_type === "select" || selected.input_type === "multiselect") && (
                <AttributeValueManager attributeId={selected.id} />
              )}
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-gray-100">
              <button
                onClick={handleSave}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md hover:opacity-90 active:scale-95 transition-all cursor-pointer"
              >
                <FiSave size={16} /> Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
