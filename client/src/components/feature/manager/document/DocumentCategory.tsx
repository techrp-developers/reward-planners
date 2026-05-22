"use client";

import { useEffect, useState } from "react";
import { FiPlus, FiTrash2, FiEye, FiX, FiFileText } from "react-icons/fi";
import Swal from "sweetalert2";
// const API_BASE = import.meta.env.VITE_API_URL;
import { api } from "../../../../api/api";

/* =========================
        TYPES
========================= */
interface Category {
  category_id: number;
  category_name: string;
}

interface DocumentItem {
  document_id: number;
  document_name: string;
}

interface Mapping {
  id: number;
  category_name: string;
  document_name: string;
}

/* =========================
        COMPONENT
========================= */
export default function DocumentCategoryManagement() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [records, setRecords] = useState<Mapping[]>([]);

  const [categoryId, setCategoryId] = useState<number | "">("");
  const [documentId, setDocumentId] = useState<number | "">("");

  /* Drawer state */
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<Mapping | null>(null);

  /* =========================
        FETCH DATA
  ========================= */
  const fetchCategories = async () => {
    try {
      const res = await api.get("/category");
      setCategories(res.data?.data || []);
    } catch (err) {
      console.error("Failed to fetch categories", err);
      setCategories([]);
    }
  };

  const fetchDocuments = async () => {
    try {
      const res = await api.get("/manager/documents");
      setDocuments(res.data?.data || []);
    } catch (err) {
      console.error("Failed to fetch documents", err);
      setDocuments([]);
    }
  };

  const fetchMappings = async () => {
    try {
      const res = await api.get("/manager/category-documents");
      setRecords(res.data?.data || []);
    } catch (err) {
      console.error("Failed to fetch mappings", err);
      setRecords([]);
    }
  };

  useEffect(() => {
    fetchCategories();
    fetchDocuments();
    fetchMappings();
  }, []);

  /* =========================
        ADD MAPPING
  ========================= */
  const okBtnClass =
  "px-6 py-2 rounded-xl font-bold text-white bg-[#852BAF] transition-all duration-300 cursor-pointer " +
  "hover:bg-gradient-to-r hover:from-[#852BAF] hover:to-[#FC3F78] active:scale-95";

const handleAdd = async () => {
  //  VALIDATION POPUP
  if (!categoryId || !documentId) {
    await Swal.fire({
      title: "Required fields",
      text: "Please select both category and document.",
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
    await api.post("/manager/create-category-documents", {
      category_id: categoryId,
      document_id: documentId,
    });

    setCategoryId("");
    setDocumentId("");
    fetchMappings();

    //  SUCCESS POPUP
    Swal.fire({
      title: "Added!",
      text: "Category & Document mapping added successfully.",
      icon: "success",
      timer: 1400,
      showConfirmButton: false,
      customClass: { popup: "rounded-2xl" },
    });
  } catch (err: any) {
    console.error("Failed to add mapping", err);

    //  ERROR POPUP
    await Swal.fire({
      title: "Failed",
      text:
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        "Failed to add mapping. Please try again.",
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

  /* =========================
        VIEW (DRAWER)
  ========================= */
  const handleView = async (id: number) => {
    try {
      const res = await api.get(`/manager/category-documents/${id}`);
      setSelected(res.data.data);
      setDrawerOpen(true);
    } catch (err) {
      console.error("Failed to fetch mapping", err);
    }
  };

  /* =========================
        DELETE
  ========================= */
 const handleDelete = async (id: number) => {
  const result = await Swal.fire({
    title: "Delete this record?",
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
    await api.delete(`/manager/category-documents/${id}`);
    fetchMappings();

    Swal.fire({
      title: "Deleted!",
      text: "Record deleted successfully.",
      icon: "success",
      timer: 1400,
      showConfirmButton: false,
    });
  } catch (err: any) {
    console.error("Failed to delete mapping", err);

    Swal.fire({
      title: "Delete failed",
      text:
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        "Failed to delete record. Please try again.",
      icon: "error",
      confirmButtonText: "OK",
      confirmButtonColor: "#EF4444",
    });
  }
};

  /* =========================
        UI
  ========================= */
  return (
    <div className="min-h-screen p-6 bg-gray-50">
      <h1 className="flex items-center gap-2 mb-6 text-3xl font-bold text-purple-700">
        <FiFileText /> Document Management
      </h1>

      {/* ADD SECTION */}
     <div className="flex flex-col gap-4 p-6 bg-white shadow rounded-xl md:flex-row md:items-center md:gap-6">
  <select
    value={categoryId}
    onChange={(e) => setCategoryId(Number(e.target.value))}
    className="p-3 border rounded-xl w-full md:flex-1"
  >
    <option value="">Select Category</option>
    {categories.map((c) => (
      <option key={c.category_id} value={c.category_id}>
        {c.category_name}
      </option>
    ))}
  </select>

  <select
    value={documentId}
    onChange={(e) => setDocumentId(Number(e.target.value))}
    className="p-3 border rounded-xl w-full md:flex-1"
  >
    <option value="">Select Document</option>
    {documents.map((d) => (
      <option key={d.document_id} value={d.document_id}>
        {d.document_name}
      </option>
    ))}
  </select>

  <button
    onClick={handleAdd}
    className="md:ml-auto inline-flex items-center justify-center gap-2
               px-6 py-3 text-white bg-purple-600 rounded-xl
               hover:bg-gradient-to-r hover:from-[#852BAF] hover:to-[#FC3F78]
               transition-all duration-300 w-full md:w-[140px] cursor-pointer"
  >
    <FiPlus /> Add
  </button>
</div>


      {/* TABLE */}
      <div className="p-6 mt-6 bg-white shadow rounded-xl">
        <table className="w-full">
          <thead className="text-white bg-purple-600">
            <tr>
              <th className="p-3 text-left">Category</th>
              <th className="p-3 text-left">Document</th>
              <th className="p-3 text-right">Action</th>
            </tr>
          </thead>

          <tbody>
            {records.length === 0 ? (
              <tr>
                <td colSpan={3} className="p-4 text-center text-gray-500">
                  No records found
                </td>
              </tr>
            ) : (
              records.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="p-3">{r.category_name}</td>
                  <td className="p-3">{r.document_name}</td>
                  <td className="p-3 text-right flex justify-end gap-3">
                    <button
                    className="cursor-pointer"
                     onClick={() => handleView(r.id)}>
                      <FiEye />
                    </button>
                    <button
  className="text-red-600 cursor-pointer"
  onClick={() => handleDelete(r.id)}
>
  <FiTrash2 />
</button>

                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* =========================
            DRAWER VIEW
      ========================= */}
      {drawerOpen && selected && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setDrawerOpen(false)}
          />

          <div className="absolute right-0 top-0 h-full w-[400px] bg-white shadow-xl rounded-l-2xl">
            <div className="flex items-center justify-between p-6 bg-purple-600">
              <h2 className="text-xl font-bold text-white">View Details</h2>
              <button
                onClick={() => setDrawerOpen(false)}
                className="text-white cursor-pointer"
              >
                <FiX size={22} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <p className="text-sm text-gray-500">Category</p>
                <p className="font-semibold">{selected.category_name}</p>
              </div>

              <div>
                <p className="text-sm text-gray-500">Document</p>
                <p className="font-semibold">{selected.document_name}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
