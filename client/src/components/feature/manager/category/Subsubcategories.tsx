"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  FiEdit,
  FiTrash2,
  FiEye,
  FiPlus,
  FiCalendar,
  FiTag,
  FiX,
  FiSave,
  FiGrid,
} from "react-icons/fi";
import { api } from "../../../../api/api";
import Swal from "sweetalert2";

type Status = "active" | "inactive";

interface Category {
  category_id: number;
  name: string;
}

interface Subcategory {
  subcategory_id: number;
  category_id: number;
  subcategory_name: string;
}

interface SubSubcategory {
  sub_subcategory_id: number;
  subcategory_id: number;
  name: string;
  status: Status;
  created_at: string;
  subcategory_name: string;
}

const StatusBadge = ({ status }: { status: Status }) => (
  <span
    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider ${
      status === "active"
        ? "bg-emerald-50 text-emerald-600 border border-emerald-100"
        : "bg-red-50 text-red-500 border border-red-100"
    }`}
  >
    <span
      className={`w-1.5 h-1.5 rounded-full ${status === "active" ? "bg-emerald-500" : "bg-red-500"}`}
    />
    {status}
  </span>
);

export default function SubSubCategoryManagement() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [subsub, setSubSub] = useState<SubSubcategory[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | "">("");
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState<
    number | ""
  >("");
  const [newName, setNewName] = useState("");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<SubSubcategory | null>(null);
  const [editName, setEditName] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const loadCategories = async () => {
    try {
      const res = await api.get("/category");

      const list = Array.isArray(res.data)
        ? res.data
        : Array.isArray(res.data?.data)
          ? res.data.data
          : [];

      setCategories(
        list.map((c: any) => ({
          category_id: c.category_id,
          name: c.category_name,
        })),
      );
    } catch (e: unknown) {
      if (e instanceof Error) {
      }
    }
  };

  const loadSubcategories = async () => {
    try {
      const res = await api.get("/subcategory");

      const list = Array.isArray(res.data)
        ? res.data
        : Array.isArray(res.data?.data)
          ? res.data.data
          : [];

      setSubcategories(
        list.map((s: any) => ({
          subcategory_id: s.subcategory_id,
          category_id: s.category_id,
          subcategory_name: s.subcategory_name,
        })),
      );
    } catch (e: unknown) {
      if (e instanceof Error) {
      }
    }
  };

  const loadSubSubCategories = async () => {
    try {
      const res = await api.get("/subsubcategory");

      const list = Array.isArray(res.data)
        ? res.data
        : Array.isArray(res.data?.data)
          ? res.data.data
          : [];

      setSubSub(
        list.map((s: any) => ({
          sub_subcategory_id: s.sub_subcategory_id,
          subcategory_id: s.subcategory_id,
          name: s.name,
          status: Number(s.sub_sub_status) === 1 ? "active" : "inactive",
          created_at: s.sub_sub_created,
          subcategory_name: s.subcategory_name,
        })),
      );
    } catch (e: unknown) {
      if (e instanceof Error) {
        console.log("SubSub error:", e.message);
      }
    }
  };

  useEffect(() => {
    loadCategories();
    loadSubcategories();
    loadSubSubCategories();
  }, []);

  const filterSubcats = useMemo(() => {
    if (selectedCategoryId === "") return [];
    return subcategories.filter((s) => s.category_id === selectedCategoryId);
  }, [selectedCategoryId, subcategories]);

  // 1️⃣ Filter by subcategory
  const subcategoryFiltered = useMemo(() => {
    if (selectedSubcategoryId === "") return subsub;
    return subsub.filter((s) => s.subcategory_id === selectedSubcategoryId);
  }, [selectedSubcategoryId, subsub]);

  // 2️⃣ Then search filter
  const filterSubSub = useMemo(() => {
    return subcategoryFiltered.filter((s) =>
      s.name.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [subcategoryFiltered, searchTerm]);

  // Pagination
  const totalPages = Math.ceil(filterSubSub.length / itemsPerPage);

  const paginatedSubSub = filterSubSub.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCategoryId, selectedSubcategoryId, searchTerm]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages || 1);
    }
  }, [filterSubSub, totalPages, currentPage]);

  const handleAdd = async (e?: React.FormEvent) => {
    e?.preventDefault();

    const okBtnClass =
      "px-6 py-2 rounded-xl font-bold text-white bg-[#852BAF] transition-all duration-300 " +
      "hover:bg-gradient-to-r hover:from-[#852BAF] hover:to-[#FC3F78] active:scale-95 cursor-pointer";

    //  POPUP: Category not selected
    if (selectedCategoryId === "") {
      await Swal.fire({
        title: "Select Category",
        text: "Please select a category first.",
        icon: "warning",
        confirmButtonText: "OK",
        buttonsStyling: false,
        customClass: {
          confirmButton: okBtnClass,
          popup: "rounded-2xl",
        },
      });
      return;
    }

    //  POPUP: Subcategory not selected
    if (selectedSubcategoryId === "") {
      await Swal.fire({
        title: "Select Subcategory",
        text: "Please select a subcategory first.",
        icon: "warning",
        confirmButtonText: "OK",
        buttonsStyling: false,
        customClass: {
          confirmButton: okBtnClass,
          popup: "rounded-2xl",
        },
      });
      return;
    }

    //  POPUP: Type name empty
    if (!newName.trim()) {
      await Swal.fire({
        title: "Type name required",
        text: "Please enter a Type name before adding.",
        icon: "warning",
        confirmButtonText: "OK",
        buttonsStyling: false,
        customClass: {
          confirmButton: okBtnClass,
          popup: "rounded-2xl",
        },
      });
      return;
    }

    try {
      await api.post("/vendor/create-sub-subcategory", {
        subcategory_id: selectedSubcategoryId,
        name: newName,
      });

      setNewName("");
      setCurrentPage(1);
      loadSubSubCategories();

      Swal.fire({
        title: "Added!",
        text: "Type added successfully.",
        icon: "success",
        timer: 1200,
        showConfirmButton: false,
        customClass: { popup: "rounded-2xl" },
      });
    } catch (err: any) {
      console.log("Add error", err);

      Swal.fire({
        title: "Failed",
        text:
          err?.response?.data?.error ||
          err?.response?.data?.message ||
          "Failed to add Type. Please try again.",
        icon: "error",
        confirmButtonText: "OK",
        buttonsStyling: false,
        customClass: {
          confirmButton: okBtnClass,
          popup: "rounded-2xl",
        },
      });
    }
  };

  const handleView = async (id: number) => {
    try {
      const res = await api.get(`/vendor/sub-subcategory/${id}`);
      const s = res.data.data;
      const formatted: SubSubcategory = {
        sub_subcategory_id: s.sub_subcategory_id,
        subcategory_id: s.subcategory_id,
        name: s.name,
        status: s.status === 1 ? "active" : "inactive",
        created_at: s.created_at,
        subcategory_name: s.subcategory_name,
      };
      setSelected(formatted);
      setEditName(formatted.name);
      setIsEditing(false);
      setDrawerOpen(true);
    } catch (e) {
      console.log("View error", e);
    }
  };

  const handleSaveEdit = async () => {
    if (!selected) return;
    try {
      await api.put(
        `/vendor/update-sub-subcategory/${selected.sub_subcategory_id}`,
        {
          name: editName.trim(),
          status: selected.status === "active" ? 1 : 0,
          subcategory_id: selected.subcategory_id,
        },
      );
      loadSubSubCategories();
      setIsEditing(false);
      setCurrentPage(1);
      setDrawerOpen(false);
    } catch (e) {
      console.log("Update error", e);
    }
  };

  const handleDelete = async (id: number) => {
    const result = await Swal.fire({
      title: "Delete this Type / Sub-Type?",
      text: "This action cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#EF4444",
      cancelButtonColor: "#9CA3AF",
      reverseButtons: true,
    });

    if (!result.isConfirmed) return;

    try {
      await api.delete(`/vendor/delete-sub-subcategory/${id}`);
      loadSubSubCategories();
      setDrawerOpen(false);
      setCurrentPage(1);

      Swal.fire({
        title: "Deleted!",
        text: "Type / Sub-Type deleted successfully.",
        icon: "success",
        timer: 1400,
        showConfirmButton: false,
      });
    } catch (err: any) {
      console.log("Delete error", err);

      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        "Something went wrong while deleting.";

      Swal.fire({
        title: "Delete failed",
        text: msg,
        icon: "error",
        confirmButtonText: "OK",
        confirmButtonColor: "#EF4444",
      });
    }
  };

  return (
    <div className="min-h-screen p-8 bg-[#FAFAFE]">
      {/* PAGE HEADER */}
      <div className="mb-10">
        <h1 className="flex items-center gap-4 text-3xl font-black tracking-tight text-gray-900">
          <div className="p-3 bg-white shadow-sm rounded-2xl text-[#852BAF]">
            <FiGrid />
          </div>
          Type / Sub-Type Management
        </h1>
        <p className="mt-2 ml-16 font-medium text-gray-400">
          Manage granular product classifications
        </p>
      </div>

      {/* ADD AREA */}
      <form
        onSubmit={handleAdd}
        className="flex flex-col gap-3 p-2 mb-10 bg-white shadow-sm rounded-2xl border border-gray-100/50 max-w-5xl md:flex-row"
      >
        <select
          value={selectedCategoryId}
          onChange={(e) => setSelectedCategoryId(Number(e.target.value) || "")}
          className="px-4 py-3 text-sm font-bold bg-gray-50 rounded-xl outline-none text-gray-700 md:w-1/4"
        >
          <option value="">Select Category</option>
          {categories.map((c) => (
            <option key={c.category_id} value={c.category_id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={selectedSubcategoryId}
          onChange={(e) =>
            setSelectedSubcategoryId(Number(e.target.value) || "")
          }
          className="px-4 py-3 text-sm font-bold bg-gray-50 rounded-xl outline-none text-gray-700 md:w-1/4 disabled:opacity-50"
          disabled={selectedCategoryId === ""}
        >
          <option value="">Select Subcategory</option>
          {filterSubcats.map((s) => (
            <option key={s.subcategory_id} value={s.subcategory_id}>
              {s.subcategory_name}
            </option>
          ))}
        </select>

        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Enter New Type Name..."
          className="flex-1 px-5 py-3 text-sm font-semibold bg-transparent outline-none placeholder:text-gray-300"
          disabled={selectedSubcategoryId === ""}
        />

        <button
          type="submit"
          className="flex items-center justify-center gap-2 px-8 py-3 font-bold text-white transition-all shadow-lg bg-gradient-to-r from-[#852BAF] to-[#FC3F78] rounded-xl hover:bg-gradient-to-r hover:from-[#FC3F78] hover:to-[#852BAF]
                           hover:shadow-xl active:scale-95
                           disabled:opacity-60 disabled:cursor-not-allowed
                           inline-flex items-center justify-center cursor-pointer"
        >
          <FiPlus /> Add Type
        </button>
      </form>

      {/* Search */}
      <div className="flex justify-between items-center mb-6">
        <div className="w-[320px]">
          <input
            type="text"
            placeholder="Search Type / Sub-Type..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-5 py-3 bg-white border border-gray-200 rounded-xl
                 shadow-sm outline-none font-semibold text-gray-700
                 focus:border-[#852BAF] focus:ring-2 focus:ring-purple-100"
          />
        </div>
      </div>

      {/* TABLE */}
      <div className="bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[2rem] border border-gray-100 overflow-hidden">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="border-b border-gray-50">
              <th className="px-8 py-6 text-xs font-black tracking-widest text-left text-gray-400 uppercase">
                Type / Sub-Type
              </th>
              <th className="px-8 py-6 text-xs font-black tracking-widest text-left text-gray-400 uppercase">
                Parent Subcategory
              </th>
              <th className="px-8 py-6 text-xs font-black tracking-widest text-left text-gray-400 uppercase">
                Status
              </th>
              <th className="px-8 py-6 text-xs font-black tracking-widest text-left text-gray-400 uppercase">
                Created Date
              </th>
              <th className="px-22 py-6 text-xs font-black tracking-widest text-right text-gray-400 uppercase">
                Actions
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-50">
            {paginatedSubSub.map((s) => (
              <tr
                key={s.sub_subcategory_id}
                className="group transition-colors hover:bg-gray-50/50"
              >
                <td className="px-8 py-5 text-sm font-bold text-gray-700">
                  {s.name}
                </td>
                <td className="px-8 py-5">
                  <span className="px-3 py-1 text-[11px] font-bold bg-gray-100 text-gray-500 rounded-lg">
                    {s.subcategory_name}
                  </span>
                </td>
                <td className="px-8 py-5">
                  <StatusBadge status={s.status} />
                </td>
                <td className="px-8 py-5 text-sm font-semibold text-gray-400">
                  {new Date(s.created_at).toLocaleDateString()}
                </td>
                <td className="px-8 py-5">
                  <div className="flex justify-end gap-2 opacity-100 transition-opacity duration-200">
                    <button
                      onClick={() => handleView(s.sub_subcategory_id)}
                      className="p-2.5 text-gray-400 hover:text-[#852BAF] bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer"
                    >
                      <FiEye size={16} />
                    </button>
                    <button
                      onClick={() => {
                        handleView(s.sub_subcategory_id);
                        setIsEditing(true);
                      }}
                      className="p-2.5 text-gray-400 hover:text-[#FC3F78] bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer"
                    >
                      <FiEdit size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(s.sub_subcategory_id)}
                      className="p-2.5 text-gray-400 hover:text-red-500 bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer"
                    >
                      <FiTrash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* PAGINATION */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <div className="text-sm text-gray-600">
            Showing{" "}
            <span className="font-semibold">
              {(currentPage - 1) * itemsPerPage + 1}
            </span>{" "}
            to{" "}
            <span className="font-semibold">
              {Math.min(currentPage * itemsPerPage, filterSubSub.length)}
            </span>{" "}
            of <span className="font-semibold">{filterSubSub.length}</span>{" "}
            items
          </div>

          <div className="flex gap-2">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => p - 1)}
              className={`px-4 py-2 rounded-lg border text-sm font-medium cursor-pointer ${
                currentPage === 1
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-white hover:bg-gray-50"
              }`}
            >
              Previous
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .slice(Math.max(0, currentPage - 3), currentPage + 2)
              .map((page) => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold border cursor-pointer ${
                    currentPage === page
                      ? "bg-[#852BAF] text-white border-[#852BAF]"
                      : "bg-white hover:bg-gray-50"
                  }`}
                >
                  {page}
                </button>
              ))}

            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
              className={`px-4 py-2 rounded-lg border text-sm font-medium cursor-pointer ${
                currentPage === totalPages
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-white hover:bg-gray-50"
              }`}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* DRAWER */}
      {selected && (
        <div
          className={`fixed inset-0 z-50 transition-all duration-500 ${drawerOpen ? "visible" : "invisible"}`}
        >
          <div
            className={`absolute inset-0 bg-gray-900/20 backdrop-blur-md transition-opacity duration-500 ${drawerOpen ? "opacity-100" : "opacity-0"}`}
            onClick={() => setDrawerOpen(false)}
          />

          <div
            className={`absolute right-0 top-0 h-full w-[450px] bg-white shadow-[-20px_0_50px_rgba(0,0,0,0.05)] transition-transform duration-500 ease-out ${
              drawerOpen ? "translate-x-0" : "translate-x-full"
            }`}
          >
            <div className="p-8 border-b border-gray-50">
              <div className="flex items-center justify-between mb-6">
                <div className="w-12 h-12 bg-gradient-to-tr from-[#852BAF] to-[#FC3F78] rounded-2xl flex items-center justify-center text-white text-xl shadow-lg shadow-purple-200">
                  <FiTag />
                </div>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="p-2 text-gray-400 hover:bg-gray-50 rounded-xl transition-colors cursor-pointer"
                >
                  <FiX size={24} />
                </button>
              </div>
              <h2 className="text-2xl font-black text-gray-900">
                {isEditing ? "Edit Type" : selected.name}
              </h2>
              <p className="flex items-center gap-2 mt-1 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                <FiCalendar /> Created on{" "}
                {new Date(selected.created_at).toLocaleDateString()}
              </p>
            </div>

            <div className="p-8 space-y-8">
              {!isEditing ? (
                <div className="space-y-6">
                  <div className="p-6 bg-gray-50 rounded-[2rem] border border-gray-100">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">
                      Belongs To
                    </p>
                    <p className="text-lg font-bold text-gray-800">
                      {selected.subcategory_name}
                    </p>
                  </div>
                  <button
                    className="w-full py-4 font-black text-white bg-gray-900 rounded-2xl hover:bg-gradient-to-r hover:from-[#852BAF] hover:to-[#FC3F78] 
           transition-all duration-300 cursor-pointer"
                    onClick={() => setIsEditing(true)}
                  >
                    Edit
                  </button>
                </div>
              ) : (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2 mb-2 block">
                      Type Name
                    </label>
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full px-5 py-4 font-bold text-gray-700 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-[#852BAF]/20 focus:bg-white transition-all outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2 mb-2 block">
                      Status
                    </label>
                    <select
                      value={selected.status}
                      onChange={(e) =>
                        setSelected((prev) =>
                          prev
                            ? { ...prev, status: e.target.value as Status }
                            : prev,
                        )
                      }
                      className="w-full px-5 py-4 font-bold text-gray-700 bg-gray-50 border border-gray-100 rounded-2xl outline-none"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>

                  <div className="pt-4 space-y-3">
                    <button
                      onClick={handleSaveEdit}
                      className="w-full py-4 font-black text-white bg-gradient-to-r from-[#852BAF] to-[#FC3F78] rounded-2xl shadow-lg shadow-purple-200 hover:opacity-90 transition-all cursor-pointer"
                    >
                      <FiSave className="inline-block mr-2" /> Save Changes
                    </button>
                    <button
                      onClick={() => setIsEditing(false)}
                      className="w-full py-4 font-bold text-gray-400 bg-white border border-gray-100 rounded-2xl 
           hover:bg-gradient-to-r hover:from-[#852BAF] hover:to-[#FC3F78] 
           hover:text-white transition-all duration-300 cursor-pointer"
                    >
                      Discard
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
