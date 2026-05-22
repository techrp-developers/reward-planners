import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import Swal from "sweetalert2";
import {
  FiEdit,
  FiTrash2,
  FiEye,
  FiPlus,
  FiCalendar,
  FiTag,
  FiX,
  FiSave,
  FiLayers,
} from "react-icons/fi";
// import imageCompression from "browser-image-compression";

import { api } from "../../../../api/api";
// const API_BASEIMAGE_URL = "https://rewardplanners.com/api/crm";
const R2_BASE_URL = "https://cdn.rewardplanners.com";

type Status = "active" | "inactive";

interface Category {
  category_id: number;
  name: string;
}

interface Subcategory {
  subcategory_id: number;
  category_id: number;
  subcategory_name: string;
  category_name: string;
  status: Status;
  created_at: string;
  cover_image: string;
}

export default function SubcategoryManagement() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | "">("");
  const [newSubcategoryName, setNewSubcategoryName] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<Subcategory | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [addCoverImage, setAddCoverImage] = useState<File | null>(null);
  const [editCoverImage, setEditCoverImage] = useState<File | null>(null);

  // const [loadingAdd, setLoadingAdd] = useState(false);
  const [loadingSave, setLoadingSave] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const normalizeStatus = (status: any): Status => {
    if (status === "active") return "active";
    if (status === "inactive") return "inactive";
    if (status === 1 || status === "1") return "active";
    return "inactive";
  };

  // const compressImage = async (file: File): Promise<File> => {
  //   const options = {
  //     maxSizeMB: 1,
  //     maxWidthOrHeight: 1600,
  //     useWebWorker: true,
  //     fileType: "image/webp",
  //     initialQuality: 0.85,
  //   };

  //   return await imageCompression(file, options);
  // };

  const resolveImageUrl = (path?: string) => {
    if (!path) return "";
    if (path.startsWith("http://") || path.startsWith("https://")) {
      return `${path}?t=${Date.now()}`;
    }
    return `${R2_BASE_URL}/${path.replace(/^\/+/, "")}?t=${Date.now()}`;
  };

  const fetchCategories = async () => {
    try {
      const res = await api.get("/category");
      const categoriesArray = Array.isArray(res.data)
        ? res.data
        : Array.isArray(res.data.data)
          ? res.data.data
          : [];
      const formatted = categoriesArray.map((c: any) => ({
        category_id: c.category_id,
        name: c.category_name,
      }));
      setCategories(formatted);
    } catch (err: unknown) {
      if (err instanceof Error) {
      } else {
      }
    }
  };

  const fetchSubcategories = async () => {
    try {
      const res = await api.get("/subcategory");

      const subArray = Array.isArray(res.data)
        ? res.data
        : Array.isArray(res.data.data)
          ? res.data.data
          : [];

      const formatted = subArray.map((s: any) => ({
        subcategory_id: s?.subcategory_id ?? "",
        category_id: s?.category_id ?? "",
        subcategory_name: s?.subcategory_name ?? "",
        category_name: s?.category_name ?? "",
        // status: Number(s?.status) === 1 ? "active" : "inactive",
        status: normalizeStatus(s.status),
        created_at: s?.created_at ?? "",
        cover_image: s?.cover_image ?? "",
      }));

      setSubcategories(formatted);
    } catch (err) {
      setError("Failed to load subcategories");
      console.error(err);
    }
  };

  useEffect(() => {
    fetchCategories();
    fetchSubcategories();
  }, []);

  // 1 Filter by category
  const categoryFiltered = useMemo(() => {
    if (selectedCategoryId === "") return subcategories;
    return subcategories.filter(
      (item) => item.category_id === selectedCategoryId,
    );
  }, [subcategories, selectedCategoryId]);

  // 2 Then filter by search
  const filteredSubcategories = useMemo(() => {
    return categoryFiltered.filter((item) =>
      item.subcategory_name.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [categoryFiltered, searchTerm]);

  const totalPages = Math.ceil(filteredSubcategories.length / itemsPerPage);

  const paginatedSubcategories = filteredSubcategories.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCategoryId]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages || 1);
    }
  }, [filteredSubcategories, totalPages, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const handleAdd = async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (selectedCategoryId === "") {
      await Swal.fire({
        title: "Select a category",
        text: "Please choose a category before adding a subcategory.",
        icon: "warning",
        confirmButtonText: "OK",
      });
      return;
    }

    if (!newSubcategoryName.trim()) {
      await Swal.fire({
        title: "Subcategory name required",
        text: "Please enter a subcategory name before adding.",
        icon: "warning",
        confirmButtonText: "OK",
      });
      return;
    }

    try {
      const formData = new FormData();
      formData.append("category_id", String(selectedCategoryId));
      formData.append("name", newSubcategoryName);

      if (addCoverImage) {
        formData.append("cover_image", addCoverImage);
      }

      await api.post("/vendor/create-subcategory", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      // Reset
      setNewSubcategoryName("");
      setAddCoverImage(null);
      setAddModalOpen(false);
      setCurrentPage(1);
      fetchSubcategories();

      await Swal.fire({
        title: "Added!",
        text: "Subcategory added successfully.",
        icon: "success",
        timer: 1200,
        showConfirmButton: false,
      });
    } catch (err: any) {
      await Swal.fire({
        title: "Failed",
        text:
          err?.response?.data?.error ||
          "Failed to add subcategory. Please try again.",
        icon: "error",
        confirmButtonText: "OK",
      });
    } finally {
      // setLoadingAdd(false);
    }
  };

  useEffect(() => {
    return () => {
      if (previewImage && previewImage.startsWith("blob:")) {
        URL.revokeObjectURL(previewImage);
      }
    };
  }, [previewImage]);

  const handleView = async (id: number) => {
    try {
      const res = await api.get(`/vendor/subcategory/${id}`);
      const s = res.data.data;
      const formatted: Subcategory = {
        subcategory_id: s.subcategory_id,
        category_id: s.category_id,
        subcategory_name: s.subcategory_name,
        category_name: s.category_name,
        status: normalizeStatus(s.status),
        created_at: s.created_at,
        cover_image: s.cover_image,
      };
      setSelected(formatted);
      setEditName(formatted.subcategory_name);
      setIsEditing(false);
      setDrawerOpen(true);
      // Server image preview
      setPreviewImage(resolveImageUrl(s.cover_image));

      // Reset edit image state
      setEditCoverImage(null);
    } catch (err) {
      console.log("View error:", err);
    }
  };

  const handleSaveEdit = async () => {
    if (!selected) return;
    setLoadingSave(true);
    try {
      const formData = new FormData();
      formData.append("name", editName);
      formData.append("status", selected.status === "active" ? "1" : "0");

      if (editCoverImage) {
        formData.append("cover_image", editCoverImage);
      }

      await api.put(
        `/vendor/update-subcategory/${selected.subcategory_id}`,
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        },
      );

      setSelected({
        ...selected,
        subcategory_name: editName,
        status: selected.status,
      });

      setCurrentPage(1);
      fetchSubcategories();
      setIsEditing(false);
      closeDrawer();
    } catch (err) {
      console.log("Update error:", err);
    } finally {
      setLoadingSave(false);
    }
  };

  const handleDelete = async (id: number) => {
    const result = await Swal.fire({
      title: "Delete this subcategory?",
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
      await api.delete(`/vendor/delete-subcategory/${id}`);
      fetchSubcategories();
      setDrawerOpen(false);
      setCurrentPage(1);

      Swal.fire({
        title: "Deleted!",
        text: "Subcategory deleted successfully.",
        icon: "success",
        timer: 1200,
        showConfirmButton: false,
      });
    } catch (err) {
      console.error("Delete error:", err);

      if (axios.isAxiosError(err)) {
        const msg =
          err.response?.data?.error ||
          err.response?.data?.message ||
          "Failed to delete subcategory";

        setError(msg);

        Swal.fire({
          title: "Delete failed",
          text: msg,
          icon: "error",
          confirmButtonText: "OK",
          confirmButtonColor: "#EF4444",
        });
      } else if (err instanceof Error) {
        setError(err.message);

        Swal.fire({
          title: "Delete failed",
          text: err.message,
          icon: "error",
          confirmButtonText: "OK",
          confirmButtonColor: "#EF4444",
        });
      } else {
        setError("Failed to delete subcategory");

        Swal.fire({
          title: "Delete failed",
          text: "Failed to delete subcategory",
          icon: "error",
          confirmButtonText: "OK",
          confirmButtonColor: "#EF4444",
        });
      }
    }
  };
  const closeDrawer = () => {
    setDrawerOpen(false);
    setTimeout(() => setSelected(null), 300);
  };

  return (
    <div className="min-h-screen p-8 bg-[#FAFAFE]">
      {/* PAGE HEADER */}
      <div className="mb-10">
        <h1 className="flex items-center gap-4 text-3xl font-black tracking-tight text-gray-900">
          <div className="p-3 bg-white shadow-sm rounded-2xl text-[#852BAF]">
            <FiLayers />
          </div>
          Subcategory Management
        </h1>
        <p className="mt-2 ml-16 font-medium text-gray-400">
          Deepen your catalog organization
        </p>
      </div>
      {error && (
        <div className="mb-8 p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 font-semibold">
          {error}
        </div>
      )}
      {/* ADD FORM */}
      <div className="flex items-center justify-between mb-6">
        {/* 🔎 Search */}
        <div className="w-[320px]">
          <input
            type="text"
            placeholder="Search subcategory..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-5 py-3 bg-white border border-gray-200 rounded-xl
                 shadow-sm outline-none font-semibold text-gray-700
                 focus:border-[#852BAF] focus:ring-2 focus:ring-purple-100"
          />
        </div>

        {/* ➕ Add */}
        <button
          onClick={() => setAddModalOpen(true)}
          className="flex items-center justify-center gap-2 px-8 py-3 font-bold text-white transition-all shadow-lg bg-gradient-to-r from-[#852BAF] to-[#FC3F78] rounded-xl hover:bg-gradient-to-r hover:from-[#FC3F78] hover:to-[#852BAF]
                           hover:shadow-xl active:scale-95
                           disabled:opacity-60 disabled:cursor-not-allowed
                           inline-flex items-center justify-center cursor-pointer"
        >
          <FiPlus /> Add Subcategory
        </button>
      </div>

      {/* TABLE */}
      <div className="bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[2rem] border border-gray-100 overflow-hidden">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="border-b border-gray-50">
              <th className="px-8 py-6 text-xs font-black tracking-widest text-left text-gray-400 uppercase">
                Subcategory
              </th>
              <th className="px-8 py-6 text-xs font-black tracking-widest text-left text-gray-400 uppercase">
                Parent Category
              </th>
              <th className="px-8 py-6 text-xs font-black tracking-widest text-left text-gray-400 uppercase">
                Status
              </th>
              <th className="px-8 py-6 text-xs font-black tracking-widest text-left text-gray-400 uppercase">
                Created
              </th>
              <th className="px-23 py-6 text-xs font-black tracking-widest text-right text-gray-400 uppercase">
                Actions
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-50">
            {paginatedSubcategories.map((sub) => (
              <tr
                key={sub.subcategory_id}
                className="group transition-colors hover:bg-gray-50/50"
              >
                <td className="px-8 py-5 text-sm font-bold text-gray-700">
                  {sub.subcategory_name}
                </td>
                <td className="px-8 py-5">
                  <span className="px-3 py-1 text-[11px] font-bold bg-purple-50 text-[#852BAF] rounded-lg">
                    {sub.category_name}
                  </span>
                </td>
                <td className="px-8 py-5">
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider ${
                      sub.status === "active"
                        ? "bg-emerald-50 text-emerald-600 border border-emerald-100"
                        : "bg-red-50 text-red-500 border border-red-100"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        sub.status === "active"
                          ? "bg-emerald-500"
                          : "bg-red-500"
                      }`}
                    />
                    {sub.status === "active" ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-8 py-5 text-sm font-semibold text-gray-400">
                  {new Date(sub.created_at).toLocaleDateString()}
                </td>
                <td className="px-8 py-5">
                  <div className="flex justify-end gap-2 opacity-100 transition-opacity duration-200">
                    <button
                      onClick={() => handleView(sub.subcategory_id)}
                      className="p-2.5 text-gray-400 hover:text-[#852BAF] bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer"
                    >
                      <FiEye size={16} />
                    </button>
                    <button
                      onClick={() => {
                        handleView(sub.subcategory_id);
                        setIsEditing(true);
                      }}
                      className="p-2.5 text-gray-400 hover:text-[#FC3F78] bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer"
                    >
                      <FiEdit size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(sub.subcategory_id)}
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
              {Math.min(
                currentPage * itemsPerPage,
                filteredSubcategories.length,
              )}
            </span>{" "}
            of{" "}
            <span className="font-semibold">
              {filteredSubcategories.length}
            </span>{" "}
            subcategories
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
          className={`fixed inset-0 z-50 transition-all duration-500${
            drawerOpen ? "visible" : "invisible"
          }`}
        >
          <div
            className={`absolute inset-0 bg-gray-900/20 backdrop-blur-md transition-opacity duration-500 ${
              drawerOpen ? "opacity-100" : "opacity-0"
            }`}
            onClick={closeDrawer}
          />

          <div
            className={`absolute right-0 top-0 h-full w-[450px] bg-white shadow-[-20px_0_50px_rgba(0,0,0,0.05)] transition-transform duration-500 ease-out flex flex-col ${
              drawerOpen ? "translate-x-0" : "translate-x-full"
            }`}
          >
            <div className="p-8 border-b border-gray-50">
              <div className="flex items-center justify-between mb-6">
                <div className="w-12 h-12 bg-gradient-to-tr from-[#852BAF] to-[#FC3F78] rounded-2xl flex items-center justify-center text-white text-xl shadow-lg shadow-purple-200">
                  <FiTag />
                </div>
                <button
                  onClick={closeDrawer}
                  className="p-2 text-gray-400 hover:bg-gray-50 rounded-xl transition-colors cursor-pointer"
                >
                  <FiX size={24} />
                </button>
              </div>
              <h2 className="text-2xl font-black text-gray-900">
                {isEditing ? "Edit Subcategory" : selected.subcategory_name}
              </h2>
              <p className="flex items-center gap-2 mt-1 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                <FiCalendar /> Created on{" "}
                {new Date(selected.created_at).toLocaleDateString()}
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              {!isEditing ? (
                <div className="space-y-6">
                  <div className="p-6 bg-gray-50 rounded-[2rem] border border-gray-100">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">
                      Current Category
                    </p>
                    <p className="text-lg font-bold text-gray-800">
                      {selected.category_name}
                    </p>
                  </div>

                  {previewImage && (
                    <img
                      src={previewImage}
                      className="w-full h-40 object-cover rounded-2xl border"
                    />
                  )}

                  <button
                    className="w-full py-4 font-black text-white bg-gray-900 rounded-2xl
        hover:bg-gradient-to-r hover:from-[#852BAF] hover:to-[#FC3F78]
        transition-all duration-300 cursor-pointer"
                    onClick={() => setIsEditing(true)}
                  >
                    Edit
                  </button>
                </div>
              ) : (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                  {/* Name */}
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2 mb-2 block">
                      Name
                    </label>
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full px-5 py-4 font-bold text-gray-700 bg-gray-50 border border-gray-100 rounded-2xl outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2 mb-3 block">
                      Cover Image
                    </label>

                    <label className="relative flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50 cursor-pointer hover:border-[#852BAF] hover:bg-white transition-all group overflow-hidden">
                      {previewImage ? (
                        <>
                          <img
                            src={previewImage}
                            alt="Preview"
                            className="h-full w-full object-cover rounded-2xl"
                          />

                          {/* Overlay on hover */}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center text-white">
                            <FiEdit size={28} className="mb-2" />
                            <p className="text-sm font-bold">
                              Click to change image
                            </p>
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center text-gray-400 group-hover:text-[#852BAF] transition-all">
                          <FiPlus size={28} className="mb-2" />
                          <p className="text-sm font-semibold">
                            Click to upload cover image
                          </p>
                          <p className="text-xs">PNG, JPG, WEBP up to 2MB</p>
                        </div>
                      )}

                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;

                          if (!file.type.startsWith("image/")) {
                            await Swal.fire({
                              icon: "error",
                              title: "Invalid file",
                              text: "Only image files allowed.",
                            });
                            return;
                          }

                          if (file.size > 5 * 1024 * 1024) {
                            await Swal.fire({
                              icon: "error",
                              title: "File too large",
                              text: "Image must be under 5MB.",
                            });
                            return;
                          }

                          try {
                            // const compressed = await compressImage(file);
                            // setEditCoverImage(compressed);
                            // setPreviewImage(URL.createObjectURL(compressed));
                            setEditCoverImage(file);
                            setPreviewImage(URL.createObjectURL(file));
                          } catch {
                            await Swal.fire({
                              icon: "error",
                              title: "Compression failed",
                              text: "Unable to process image.",
                            });
                          }
                        }}
                      />
                    </label>
                  </div>

                  {/* Status */}
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2 mb-2 block">
                      Status
                    </label>
                    <select
                      value={selected.status}
                      onChange={(e) =>
                        setSelected({
                          ...selected,
                          status: e.target.value as Status,
                        })
                      }
                      className="w-full px-5 py-4 font-bold text-gray-700 bg-gray-50 border border-gray-100 rounded-2xl outline-none"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>

                  {/* Buttons */}
                  <div className="pt-4 space-y-3">
                    <button
                      onClick={handleSaveEdit}
                      disabled={loadingSave}
                      className="w-full py-4 font-black text-white bg-gradient-to-r from-[#852BAF] to-[#FC3F78] rounded-2xl shadow-lg shadow-purple-200 hover:opacity-90 transition-all cursor-pointer"
                    >
                      <FiSave className="inline-block mr-2" />
                      {loadingSave ? "Saving…" : "Save Changes"}
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

      {/* modal */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-[500px] bg-white rounded-3xl p-8 shadow-2xl relative">
            <FiX
              className="absolute top-5 right-5 cursor-pointer"
              onClick={() => setAddModalOpen(false)}
            />

            <h2 className="text-2xl font-black mb-8">Add Subcategory</h2>

            <div className="space-y-6">
              <select
                value={selectedCategoryId}
                onChange={(e) =>
                  setSelectedCategoryId(
                    e.target.value === "" ? "" : Number(e.target.value),
                  )
                }
                className="w-full px-5 py-4 bg-gray-50 rounded-2xl"
              >
                <option value="">Select Category</option>
                {categories.map((c) => (
                  <option key={c.category_id} value={c.category_id}>
                    {c.name}
                  </option>
                ))}
              </select>

              <input
                value={newSubcategoryName}
                onChange={(e) => setNewSubcategoryName(e.target.value)}
                className="w-full px-5 py-4 bg-gray-50 rounded-2xl"
                placeholder="Subcategory name"
              />

              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2 mb-3 block">
                  Cover Image
                </label>

                <label className="relative flex flex-col items-center justify-center w-full h-44 border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50 cursor-pointer hover:border-[#852BAF] hover:bg-white transition-all group overflow-hidden">
                  {addCoverImage ? (
                    <>
                      <img
                        src={URL.createObjectURL(addCoverImage)}
                        alt="Preview"
                        className="h-full w-full object-cover rounded-2xl"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center text-white">
                        <FiEdit size={26} className="mb-2" />
                        <p className="text-sm font-bold">
                          Click to change image
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-gray-400 group-hover:text-[#852BAF] transition-all">
                      <FiPlus size={28} className="mb-2" />
                      <p className="text-sm font-semibold">
                        Click to upload cover image
                      </p>
                      <p className="text-xs">PNG, JPG, WEBP up to 2MB</p>
                    </div>
                  )}

                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;

                      if (!file.type.startsWith("image/")) {
                        await Swal.fire({
                          icon: "error",
                          title: "Invalid file",
                          text: "Only image files allowed.",
                        });
                        return;
                      }

                      if (file.size > 5 * 1024 * 1024) {
                        await Swal.fire({
                          icon: "error",
                          title: "File too large",
                          text: "Image must be under 5MB.",
                        });
                        return;
                      }

                      try {
                        // const compressed = await compressImage(file);
                        // setAddCoverImage(compressed);
                        setAddCoverImage(file);
                      } catch {
                        await Swal.fire({
                          icon: "error",
                          title: "Compression failed",
                          text: "Unable to process image.",
                        });
                      }
                    }}
                  />
                </label>
              </div>

              <button
                onClick={handleAdd}
                className="w-full py-4 text-white font-black rounded-2xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] cursor-pointer hover:opacity-90 transition-all"
              >
                Create Subcategory
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
