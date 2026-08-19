import React, { useEffect, useState } from "react";
import axios from "axios";
import Swal from "sweetalert2";
import { FiEye, FiPlus, FiX, FiSave, FiLayers, FiSearch, FiSliders, FiCheckCircle, FiBox, FiArchive, FiRotateCcw, FiTrash2 } from "react-icons/fi";
import { api } from "../../../../common/api/api";
import { confirmDialog } from "../../../../common/utils/confirmDialog";
import { getPageNumbers } from "../../../../common/utils/pagination";
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
  is_active: number;
  is_used?: number;
}

export default function CategoryAttributeManagement() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [attributes, setAttributes] = useState<Attribute[]>([]);

  const [categoryId, setCategoryId] = useState<number | "">("");
  const [subcategoryId, setSubcategoryId] = useState<number | "">("");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<Attribute | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "archived" | "all">("active");

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
      (res.data.data || []).map((c: { category_id: number; category_name: string }) => ({
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
        status: statusFilter,
      },
    });
    setAttributes(res.data.data || []);
  };

  useEffect(() => {
    fetchCategories();
    fetchSubcategories();
  }, []);

  useEffect(() => {
    fetchAttributes();
    // The filter values intentionally drive this request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId, subcategoryId, statusFilter]);

  // useEffect(() => {
  //   fetchAttributes();
  // }, []);

  /* ------------------ HANDLERS ------------------ */

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!subcategoryId) {
      return Swal.fire("Select a subcategory", "Attributes are assigned to a specific product subcategory.", "warning");
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
    } catch (err: unknown) {
      Swal.fire("Error", axios.isAxiosError(err) ? err.response?.data?.message : "Unable to create attribute", "error");
    }
  };

  const handleDelete = async (attribute: Attribute) => {
    const used = Boolean(attribute.is_used);
    const confirmed = await confirmDialog({
      title: used ? "Archive attribute?" : "Delete unused attribute?",
      text: used ? "It will be hidden from new products but retained on existing products." : "This unused attribute and its configured options will be permanently deleted.",
    });

    if (!confirmed) return;

    try {
      await api.delete(`/manager/category-attributes/${attribute.id}`);
      fetchAttributes();
      Swal.fire(used ? "Archived" : "Deleted", used ? "Existing product data remains unchanged." : "The unused attribute was permanently removed.", "success");
    } catch (err: unknown) {
      Swal.fire("Blocked", axios.isAxiosError(err) ? err.response?.data?.message : "Unable to delete attribute", "error");
    }
  };

  const handleRestore = async (id: number) => {
    try {
      await api.patch(`/manager/category-attributes/${id}/restore`);
      await fetchAttributes();
      Swal.fire("Restored", "The attribute is available for products again.", "success");
    } catch (err: unknown) {
      Swal.fire("Unable to restore", axios.isAxiosError(err) ? err.response?.data?.message : "Please try again", "error");
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
    } catch (err: unknown) {
      Swal.fire("Error", axios.isAxiosError(err) ? err.response?.data?.message : "Unable to update attribute", "error");
    }
  };

  /* ------------------ UI ------------------ */

  const labelCls = "block mb-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-gray-400";
  const inputCls = "w-full h-10 px-3 rounded-xl border border-gray-200 bg-gray-50/60 text-sm font-medium text-gray-800 outline-none focus:ring-2 focus:ring-[#852BAF]/20 focus:border-[#852BAF]/40 transition";

  return (
    <main className="min-h-full bg-gradient-to-br from-[#fdf8ff] via-white to-[#fff5f8] p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[1500px] space-y-6">

        {/* HEADER */}
        <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#25103d] via-[#68258d] to-[#c33076] p-6 text-white shadow-[0_24px_65px_rgba(91,33,124,0.24)] sm:p-8">
          <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex items-center gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-white/20 bg-white/10 shadow-inner">
              <FiLayers className="text-2xl text-white" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-purple-200">Product configuration</p>
              <h1 className="mt-1 text-2xl font-black sm:text-3xl">Category Attributes</h1>
              <p className="mt-1 text-sm text-purple-100/80">Define reusable product fields, variant rules and required information.</p>
            </div>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Total attributes", value: attributes.length, Icon: FiLayers, tone: "bg-purple-50 text-[#852BAF]" },
            { label: "Variant attributes", value: attributes.filter((a) => a.is_variant).length, Icon: FiBox, tone: "bg-blue-50 text-blue-600" },
            { label: "Required fields", value: attributes.filter((a) => a.is_required).length, Icon: FiCheckCircle, tone: "bg-emerald-50 text-emerald-600" },
            { label: "Selection fields", value: attributes.filter((a) => ["select", "multiselect"].includes(a.input_type)).length, Icon: FiSliders, tone: "bg-pink-50 text-[#FC3F78]" },
          ].map(({ label, value, Icon, tone }) => <article key={label} className="rounded-2xl border border-purple-100 bg-white p-5 shadow-[0_12px_35px_rgba(67,31,91,0.06)]"><div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p><p className="mt-2 text-3xl font-black text-slate-900">{value}</p></div><span className={`grid h-11 w-11 place-items-center rounded-xl ${tone}`}><Icon size={19} /></span></div></article>)}
        </section>

        {/* FILTERS + ADD FORM CARD */}
        <section className="overflow-hidden rounded-3xl border border-purple-100 bg-white shadow-[0_18px_55px_rgba(67,31,91,0.07)]">
          <div className="border-b border-slate-100 bg-gradient-to-r from-purple-50/70 to-pink-50/40 px-6 py-5"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-[#852BAF] shadow-sm"><FiSliders /></span><div><h2 className="font-black text-slate-900">Attribute setup</h2><p className="text-xs text-slate-400">Choose where this attribute belongs, then configure its display.</p></div></div></div>
          <div className="p-6">
          <p className="mb-4 text-[10px] font-black tracking-[0.18em] text-gray-400 uppercase">Assignment</p>

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

          <div className="my-6 h-px bg-gradient-to-r from-purple-100 via-slate-100 to-transparent" />
          <p className="mb-4 text-[10px] font-black tracking-[0.18em] text-gray-400 uppercase">Attribute details</p>

          <form onSubmit={handleAdd} className="grid items-end grid-cols-2 gap-4 md:grid-cols-12">
            <div className="col-span-2 md:col-span-3">
              <label className={labelCls}>Key</label>
              <input
                placeholder="e.g. color"
                value={form.attribute_key}
                onChange={(e) => setForm({ ...form, attribute_key: e.target.value })}
                className={inputCls}
              />
            </div>

            <div className="col-span-2 md:col-span-3">
              <label className={labelCls}>Label</label>
              <input
                placeholder="e.g. Color"
                value={form.attribute_label}
                onChange={(e) => setForm({ ...form, attribute_label: e.target.value })}
                className={inputCls}
              />
            </div>

            <div className="col-span-2 md:col-span-3">
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

            <div className="col-span-2 md:col-span-3">
              <label className={labelCls}>Order</label>
              <input type="number" min="0" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} className={inputCls} />
            </div>

            <label className="col-span-2 flex h-11 cursor-pointer items-center justify-start gap-3 rounded-xl border border-purple-100 bg-purple-50 px-4 text-xs font-bold text-[#852BAF] md:col-span-3">
              <input type="checkbox" checked={form.is_variant === 1} onChange={(e) => setForm({ ...form, is_variant: e.target.checked ? 1 : 0, input_type: e.target.checked ? "multiselect" : form.input_type })} className="accent-[#852BAF]" /> Variant
            </label>
            <label className="col-span-2 flex h-11 cursor-pointer items-center justify-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50 px-4 text-xs font-bold text-emerald-700 md:col-span-3">
              <input type="checkbox" checked={form.is_required === 1} onChange={(e) => setForm({ ...form, is_required: e.target.checked ? 1 : 0 })} className="accent-emerald-600" /> Required
            </label>

            <div className="col-span-2 flex justify-stretch md:col-span-3 md:col-start-10">
              <button
                type="submit"
                className="flex h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] px-5 text-sm font-semibold text-white shadow-md transition-all hover:opacity-90 active:scale-95 cursor-pointer"
              >
                <FiPlus /> Add Attribute
              </button>
            </div>
          </form></div>
        </section>

        {/* TABLE CARD */}
        <section className="overflow-hidden rounded-3xl border border-purple-100 bg-white shadow-[0_18px_55px_rgba(67,31,91,0.08)]">
          {/* Table header row with search */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div><h2 className="font-black text-slate-900">Attributes library</h2><p className="mt-1 text-xs text-slate-400">{filteredAttributes.length} matching attributes</p></div>
            <div className="flex items-center gap-2">
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as typeof statusFilter); setCurrentPage(1); }} className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-600 outline-none focus:border-purple-400"><option value="active">Active</option><option value="archived">Archived</option><option value="all">All statuses</option></select>
            <label className="relative">
            <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search attributes..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="h-10 w-72 rounded-xl border border-gray-200 bg-gray-50/60 py-2 pl-10 pr-4 text-sm outline-none transition focus:border-[#852BAF]/40 focus:ring-4 focus:ring-purple-100"
            />
            </label></div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead style={{ background: "linear-gradient(135deg, #fdf8ff 0%, #fff5f8 100%)" }}>
                <tr>
                  {["Category", "Subcategory", "Key", "Label", "Type", "Variant", "Required", "Status", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-4 text-[10px] font-black tracking-widest text-gray-400 uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-50">
                {paginatedAttributes.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-20 text-center"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-purple-50 text-xl text-[#852BAF]"><FiLayers /></span><p className="mt-4 font-bold text-slate-700">No attributes found</p><p className="mt-1 text-xs text-slate-400">Adjust the filters or create a new attribute above.</p></td>
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
                      <td className="px-4 py-3"><span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${a.is_active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-500"}`}>{a.is_active ? "Active" : "Archived"}</span>{Boolean(a.is_used) && <p className="mt-1 text-[10px] font-semibold text-amber-600">Used by products</p>}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => { setSelected(a); setDrawerOpen(true); }}
                            className="w-8 h-8 flex items-center justify-center rounded-lg border border-purple-200 bg-purple-50 text-[#852BAF] hover:bg-[#852BAF] hover:text-white shadow-sm transition-all cursor-pointer"
                            title="View / Edit"
                          >
                            <FiEye size={14} />
                          </button>
                          {a.is_active ? (a.is_used ? <button onClick={() => handleDelete(a)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-600 shadow-sm transition-all hover:bg-amber-600 hover:text-white" title="Archive used attribute"><FiArchive size={14} /></button> : <button onClick={() => handleDelete(a)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 shadow-sm transition-all hover:bg-red-600 hover:text-white" title="Delete unused attribute"><FiTrash2 size={14} /></button>) : <button onClick={() => void handleRestore(a.id)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-600 shadow-sm transition-all hover:bg-emerald-600 hover:text-white" title="Restore"><FiRotateCcw size={14} /></button>}
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
        </section>
      </div>

      {/* DRAWER */}
      {drawerOpen && selected && (
        <div className="fixed inset-0 z-[1000] flex justify-end bg-slate-950/40 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && setDrawerOpen(false)}>
          <div className="flex h-screen w-full max-w-[480px] flex-col bg-white shadow-2xl">
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
    </main>
  );
}
