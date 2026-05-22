import React, { useState, useEffect } from "react";
import {
  FiEdit,
  FiTrash2,
  FiEye,
  FiPlus,
  FiCalendar,
  FiX,
  FiSave,
  FiTag,
} from "react-icons/fi";
import { api } from "../../../../api/api";
import Swal from "sweetalert2";
// import imageCompression from "browser-image-compression";
// const API_BASEIMAGE_URL = "https://rewardplanners.com/api/crm";
const R2_BASE_URL = "https://cdn.rewardplanners.com";

type Status = "active" | "inactive";

interface Category {
  category_id: number;
  name: string;
  status: Status;
  created_at: string;
  cover_image: string;
}

export default function CategoryManagement() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<Category | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [newCoverImage, setNewCoverImage] = useState<File | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const itemsPerPage = 10;

  // FILTER FIRST
  const filteredCategories = categories.filter((cat) =>
    cat.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  // THEN PAGINATE
  const totalPages = Math.ceil(filteredCategories.length / itemsPerPage);

  const paginatedCategories = filteredCategories.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages || 1);
    }
  }, [filteredCategories, totalPages, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // const compressImage = async (file: File): Promise<File> => {
  //   const options = {
  //     maxSizeMB: 1,
  //     maxWidthOrHeight: 1920,
  //     useWebWorker: true,
  //     fileType: "image/webp",
  //     initialQuality: 0.85,
  //   };

  //   return await imageCompression(file, options);
  // };

  useEffect(() => {
    return () => {
      if (previewImage) {
        URL.revokeObjectURL(previewImage);
      }
    };
  }, [previewImage]);

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

      const formatted: Category[] = categoriesArray.map((c: any) => ({
        category_id: c.category_id,
        name: c.category_name || "Unnamed",
        status: c.status === 1 ? "active" : "inactive",
        created_at: c.created_at,
        cover_image: c.cover_image,
      }));

      setCategories(formatted);
    } catch (err: any) {
      console.error("Fetch Category Error:", err.response?.data || err.message);
      setError("Failed to fetch categories. Please check your login and role.");
    }
  };
  useEffect(() => {
    fetchCategories();
  }, []);

  const handleAdd = async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (!newCategoryName.trim()) {
      await Swal.fire({
        title: "Category name required",
        text: "Please enter a category name before adding.",
        icon: "warning",
        confirmButtonText: "OK",
      });
      return;
    }

    if (!coverImage) {
      await Swal.fire({
        title: "Cover image required",
        text: "Please upload a cover image for this category.",
        icon: "warning",
        confirmButtonText: "OK",
      });
      return;
    }

    try {
      setLoading(true);

      const formData = new FormData();
      formData.append("name", newCategoryName);
      formData.append("status", "1");
      if (coverImage) formData.append("cover_image", coverImage);

      await api.post("/vendor/create-category", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setNewCategoryName("");
      setCoverImage(null);
      setAddModalOpen(false);
      fetchCategories();

      await Swal.fire({
        title: "Added!",
        text: "Category added successfully.",
        icon: "success",
        timer: 1200,
        showConfirmButton: false,
      });
    } catch (err: any) {
      await Swal.fire({
        title: "Failed",
        text: err?.response?.data?.error || "Failed to add category.",
        icon: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleView = async (categoryId: number) => {
    try {
      const res = await api.get(`/vendor/category/${categoryId}`);
      const data: Category = {
        category_id: res.data.data.category_id,
        name: res.data.data.category_name,
        status: res.data.data.status === 1 ? "active" : "inactive",
        created_at: res.data.data.created_at,
        cover_image: res.data.data.cover_image,
      };
      setSelected(data);
      setPreviewImage(resolveImageUrl(data.cover_image));
      setNewCoverImage(null);
      setEditName(data.name);
      setDrawerOpen(true);
      setIsEditing(false);
    } catch (err: any) {
      console.error("View error:", err.response?.data || err.message);
      setError("Failed to fetch category details.");
    }
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setTimeout(() => setSelected(null), 300);
  };

  const handleSaveEdit = async () => {
    if (!selected) return;

    try {
      const formData = new FormData();
      formData.append("name", editName);
      formData.append("status", selected.status === "active" ? "1" : "0");

      if (newCoverImage) {
        formData.append("cover_image", newCoverImage);
      }

      await api.put(
        `/vendor/update-category/${selected.category_id}`,
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        },
      );

      fetchCategories();
      closeDrawer();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: number) => {
    const result = await Swal.fire({
      title: "Delete category?",
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
      await api.delete(`/vendor/delete-category/${id}`);
      fetchCategories();
      closeDrawer();
      setCurrentPage(1);

      Swal.fire({
        title: "Deleted!",
        text: "Category deleted successfully.",
        icon: "success",
        timer: 1400,
        showConfirmButton: false,
      });
    } catch (err: any) {
      console.error("Delete error:", err.response?.data?.error);
      const msg =
        err?.response?.data?.error || "Something went wrong while deleting.";
      setError(`Delete error: ${msg}`);

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
            <FiTag />
          </div>
          Category Management
        </h1>
        <p className="mt-2 ml-16 font-medium text-gray-400">
          Manage and organize your product catalog
        </p>
      </div>
      {error && (
        <div className="mb-8 p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 font-semibold">
          {error}
        </div>
      )}

      {/* ADD CATEGORY INPUT */}
      <div className="flex items-center justify-between mb-6">
        {/* 🔎 Search */}
        <div className="w-[320px]">
          <input
            type="text"
            placeholder="Search category..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-5 py-3 bg-white border border-gray-200 rounded-xl
                 shadow-sm outline-none font-semibold text-gray-700
                 focus:border-[#852BAF] focus:ring-2 focus:ring-purple-100"
          />
        </div>

        {/* ➕ Add Button */}
        <button
          onClick={() => setAddModalOpen(true)}
          className="flex items-center gap-2 px-8 py-3 font-bold text-white transition-all shadow-lg
               bg-gradient-to-r from-[#852BAF] to-[#FC3F78]
               rounded-xl hover:bg-gradient-to-r hover:from-[#FC3F78] hover:to-[#852BAF]
                           hover:shadow-xl active:scale-95
                           disabled:opacity-60 disabled:cursor-not-allowed
                           inline-flex items-center justify-center cursor-pointer"
        >
          <FiPlus /> Add New Category
        </button>
      </div>

      {/* TABLE SECTION */}
      <div className="bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[2rem] border border-gray-100 overflow-hidden">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="border-b border-gray-50">
              <th className="px-8 py-6 text-xs font-black tracking-widest text-left text-gray-400 uppercase">
                Category Name
              </th>
              <th className="px-8 py-6 text-xs font-black tracking-widest text-left text-gray-400 uppercase">
                Status
              </th>
              <th className="px-8 py-6 text-xs font-black tracking-widest text-left text-gray-400 uppercase">
                Created Date
              </th>
              <th className="px-24 py-6 text-xs font-black tracking-widest text-right text-gray-400 uppercase">
                Actions
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-50">
            {paginatedCategories.map((cat) => (
              <tr
                key={cat.category_id}
                className="group transition-colors hover:bg-gray-50/50"
              >
                <td className="px-8 py-5 text-sm font-bold text-gray-700">
                  {cat.name}
                </td>
                <td className="px-8 py-5">
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider ${
                      cat.status === "active"
                        ? "bg-emerald-50 text-emerald-600 border border-emerald-100"
                        : "bg-red-50 text-red-500 border border-red-100"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        cat.status === "active"
                          ? "bg-emerald-500"
                          : "bg-red-500"
                      }`}
                    />
                    {cat.status}
                  </span>
                </td>
                <td className="px-8 py-5 text-sm font-semibold text-gray-400">
                  {new Date(cat.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </td>
                <td className="px-8 py-5">
                  <div className="flex justify-end gap-2 opacity-100 transition-opacity duration-200">
                    <button
                      onClick={() => handleView(cat.category_id)}
                      className="p-2.5 text-gray-400 hover:text-[#852BAF] bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer"
                    >
                      <FiEye size={16} />
                    </button>
                    <button
                      onClick={() => {
                        handleView(cat.category_id);
                        setIsEditing(true);
                      }}
                      className="p-2.5 text-gray-400 hover:text-[#FC3F78] bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer"
                    >
                      <FiEdit size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(cat.category_id)}
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
              {Math.min(currentPage * itemsPerPage, filteredCategories.length)}
            </span>{" "}
            of{" "}
            <span className="font-semibold">{filteredCategories.length}</span>{" "}
            categories
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

      {/* ADD CATEGORY MODAL */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-[450px] bg-white rounded-3xl p-8 shadow-2xl relative">
            <button
              onClick={() => setAddModalOpen(false)}
              className="absolute top-5 right-5 text-gray-400 hover:text-gray-700"
            >
              <FiX size={22} />
            </button>

            <h2 className="text-2xl font-black mb-8">Add New Category</h2>

            <div className="space-y-6">
              <div>
                <label className="text-xs font-bold text-gray-400 block mb-2">
                  Category Name
                </label>
                <input
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl font-semibold outline-none"
                  placeholder="Enter category name"
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2 mb-3 block">
                  Cover Image
                </label>

                <label className="flex flex-col items-center justify-center w-full h-44 border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50 cursor-pointer hover:border-[#852BAF] hover:bg-white transition-all group">
                  {coverImage ? (
                    <img
                      src={URL.createObjectURL(coverImage)}
                      alt="Preview"
                      className="h-full w-full object-cover rounded-2xl"
                    />
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
                          text: "Only image files are allowed.",
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
                        // setCoverImage(compressed);
                        setCoverImage(file);
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
                disabled={loading}
                className="w-full py-4 font-black text-white bg-gradient-to-r from-[#852BAF] to-[#FC3F78] rounded-2xl cursor-pointer"
              >
                {loading ? "Adding..." : "Create Category"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DRAWER PANEL */}
      {selected && (
        <div
          className={`fixed inset-0 z-50 transition-all duration-500 ${
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
            className={`absolute right-0 top-0 h-full w-[450px] bg-white shadow-[-20px_0_50px_rgba(0,0,0,0.05)]
  transition-transform duration-500 ease-out flex flex-col ${
    drawerOpen ? "translate-x-0" : "translate-x-full"
  }`}
          >
            {/* DRAWER HEADER */}
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
                {isEditing ? "Edit Category" : selected.name}
              </h2>
              <p className="flex items-center gap-2 mt-1 text-xs font-bold text-gray-400 uppercase tracking-widest">
                <FiCalendar /> Created on{" "}
                {new Date(selected.created_at).toLocaleDateString()}
              </p>
            </div>

            {/* DRAWER BODY */}
            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              {!isEditing ? (
                <div className="space-y-6">
                  <div className="p-6 bg-gray-50 rounded-[2rem] border border-gray-100">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">
                      Current Status
                    </p>
                    <p className="text-lg font-bold text-gray-800 capitalize">
                      {selected.status}
                    </p>
                  </div>

                  {/*  Image Preview in view mode */}
                  {selected.cover_image && (
                    <img
                      src={resolveImageUrl(selected.cover_image)}
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
                  {/* Category Name */}
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2 mb-2 block">
                      Category Name
                    </label>
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full px-5 py-4 font-bold text-gray-700 bg-gray-50 border border-gray-100 rounded-2xl outline-none"
                    />
                  </div>

                  {/* Status */}
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2 mb-2 block">
                      Display Status
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
                      <option value="active">Active (Visible to users)</option>
                      <option value="inactive">Inactive (Hidden)</option>
                    </select>
                  </div>

                  {/* Cover Image Section */}
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2 mb-3 block">
                      Cover Image
                    </label>

                    <label className="flex flex-col items-center justify-center w-full h-44 border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50 cursor-pointer hover:border-[#852BAF] hover:bg-white transition-all group">
                      {previewImage ? (
                        <img
                          src={previewImage}
                          alt="Preview"
                          className="h-full w-full object-cover rounded-2xl"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-gray-400 group-hover:text-[#852BAF] transition-all">
                          <FiPlus size={28} className="mb-2" />
                          <p className="text-sm font-semibold">
                            Click to change cover image
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

                          try {
                            // const compressed = await compressImage(file);
                            // setNewCoverImage(compressed);
                            // setPreviewImage(URL.createObjectURL(compressed));
                            setNewCoverImage(file);
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

                  {/* Buttons */}
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
