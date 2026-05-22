"use client";

import { useEffect, useState } from "react";
import {
  FiEdit,
  FiTrash2,
  FiEye,
  FiPlus,
  FiX,
  FiSave,
  FiFileText,
} from "react-icons/fi";

// const API_BASE = import.meta.env.VITE_API_URL;
import { api } from "../../../../api/api";
import Swal from "sweetalert2";

interface DocumentItem {
  document_id: number;
  document_name: string;
  created_at: string;
}

export default function DocumentManagement() {
  /* =============================
        STATE
  ============================== */
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [document_name, setDocumentName] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<DocumentItem | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState("");
  const [loading, setLoading] = useState(false);

  /* =============================
        FETCH ALL DOCUMENTS
  ============================== */
  const fetchDocuments = async () => {
    try {
      const res = await api.get("/manager/documents");
      setDocuments(res.data?.data || []);
    } catch (err) {
      console.error("Failed to fetch documents", err);
      setDocuments([]);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  /* =============================
        ADD DOCUMENT (POST)
  ============================== */
 const okBtnClass =
  "px-6 py-2 rounded-xl font-bold text-white bg-[#852BAF] transition-all duration-300 cursor-pointer " +
  "hover:bg-gradient-to-r hover:from-[#852BAF] hover:to-[#FC3F78] active:scale-95";


const handleAdd = async () => {
  //  empty input popup
  if (!document_name.trim()) {
    await Swal.fire({
      title: "Document name required",
      text: "Please enter a document name before adding.",
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
    setLoading(true);

    await api.post("/manager/create-document", {
      name: document_name,
    });

    setDocumentName("");
    fetchDocuments();

    //  success popup
    Swal.fire({
      title: "Added!",
      text: "Document added successfully.",
      icon: "success",
      timer: 1400,
      showConfirmButton: false,
      customClass: { popup: "rounded-2xl" },
    });
  } catch (err: any) {
    console.error("Failed to add document", err);

    //  error popup
    Swal.fire({
      title: "Failed",
      text:
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        "Failed to add document. Please try again.",
      icon: "error",
      confirmButtonText: "OK",
      buttonsStyling: false,
      customClass: {
        confirmButton: okBtnClass,
        popup: "rounded-2xl",
      },
    });
  } finally {
    setLoading(false);
  }
};

  /* =============================
        VIEW DOCUMENT (GET BY ID)
  ============================== */
  const handleView = async (document_id: number) => {
    try {
      const res = await api.get(`/manager/document/${document_id}`);

      setSelected(res.data.data);
      setEditName(res.data.data.document_name);
      setEditMode(false);
      setDrawerOpen(true);
    } catch (err) {
      console.error("Failed to fetch document", err);
    }
  };

  /* =============================
        UPDATE DOCUMENT (PUT)
  ============================== */
  const handleSaveEdit = async () => {
    if (!selected || !editName.trim()) return;

    try {
      await api.put(`/manager/update-document/${selected.document_id}`, {
        name: editName,
      });

      fetchDocuments();
      setSelected({ ...selected, document_name: editName });
      setEditMode(false);
    } catch (err) {
      console.error("Failed to update document", err);
    }
  };

  /* =============================
        DELETE DOCUMENT
  ============================== */
  const handleDelete = async (document_id: number) => {
  const result = await Swal.fire({
    title: "Delete this document?",
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
    await api.delete(`/manager/delete-document/${document_id}`);
    fetchDocuments();

    Swal.fire({
      title: "Deleted!",
      text: "Document deleted successfully.",
      icon: "success",
      timer: 1400,
      showConfirmButton: false,
    });
  } catch (err: any) {
    console.error("Failed to delete document", err);

    Swal.fire({
      title: "Delete failed",
      text:
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        "Failed to delete document. Please try again.",
      icon: "error",
      confirmButtonText: "OK",
      confirmButtonColor: "#EF4444",
    });
  }
};

  return (
    <div className="min-h-screen p-6 bg-gray-50">
      {/* HEADER */}
      <h1 className="flex items-center gap-2 mb-6 text-3xl font-bold text-purple-700">
        <FiFileText /> Document Management
      </h1>

      {/* ADD DOCUMENT */}
      <div className="flex flex-col gap-4 mb-6 md:flex-row">
  <input
    value={document_name}
    onChange={(e) => setDocumentName(e.target.value)}
    className="flex-1 px-4 py-3 border rounded-xl"
    placeholder="Enter document name"
  />

  <button
    disabled={loading}
    onClick={handleAdd}
    className="flex items-center gap-2 px-6 py-3 text-white bg-purple-600 rounded-xl 
               hover:bg-gradient-to-r hover:from-[#852BAF] hover:to-[#FC3F78] 
               disabled:opacity-50 cursor-pointer"
  >
    <FiPlus /> {loading ? "Adding..." : "Add Document"}
  </button>
</div>


      {/* TABLE */}
      <div className="bg-white shadow rounded-2xl">
        <table className="min-w-full">
          <thead className="text-white bg-purple-600">
            <tr>
              <th className="px-6 py-4 text-left">Document Name</th>
              <th className="px-6 py-4 text-left">Created Date</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {documents.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-6 py-6 text-center text-gray-500">
                  No documents found
                </td>
              </tr>
            ) : (
              documents.map((doc) => (
                <tr
                  key={doc.document_id}
                  className="border-b hover:bg-purple-50"
                >
                  <td className="px-6 py-4 font-medium">{doc.document_name}</td>
                  <td className="px-6 py-4">
                    {new Date(doc.created_at).toLocaleDateString()}
                  </td>
                  <td className="flex justify-end gap-3 px-6 py-4">
                    <button onClick={() => handleView(doc.document_id)}
                      className="cursor-pointer"
                      >
                      <FiEye />
                    </button>
                    <button
                      className="text-purple-600 cursor-pointer"
                      onClick={() => {
                        handleView(doc.document_id);
                        setEditMode(true);
                      }}
                    >
                      <FiEdit />
                    </button>
                    <button
  className="text-red-600 cursor-pointer"
  onClick={() => handleDelete(doc.document_id)}
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

      {/* DRAWER */}
      {drawerOpen && selected && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setDrawerOpen(false)}
          />

          <div className="absolute right-0 top-0 h-full w-[400px] bg-white shadow-xl rounded-l-2xl">
            <div className="flex justify-between p-6 bg-purple-600">
              <h2 className="text-xl font-bold text-white">
                {selected.document_name}
              </h2>
              <button
                onClick={() => setDrawerOpen(false)}
                className="text-white cursor-pointer"
              >
                <FiX size={22} />
              </button>
            </div>

            <div className="p-6">
              {!editMode ? (
                <button
                  className="w-full py-3 mb-3 font-semibold text-white bg-purple-600 rounded-xl 
           hover:bg-gradient-to-r hover:from-[#852BAF] hover:to-[#FC3F78] 
           transition-all duration-300 cursor-pointer"

                  onClick={() => setEditMode(true)}
                >
                  <FiEdit className="inline-block mr-2" />
                  Edit Document
                </button>
              ) : (
                <>
                  <label className="text-sm font-medium">Document Name</label>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-4 py-3 mb-4 border rounded-xl"
                  />

                  <button
                    onClick={handleSaveEdit}
                    className="w-full py-3 mb-3 text-white bg-purple-700 rounded-xl 
           hover:bg-gradient-to-r hover:from-[#852BAF] hover:to-[#FC3F78] 
           transition-all duration-300 cursor-pointer"

                  >
                    <FiSave className="inline-block mr-2" />
                    Save Changes
                  </button>

                  <button
                    onClick={() => setEditMode(false)}
                    className="w-full py-3 border rounded-xl text-black hover:text-white 
           hover:bg-gradient-to-r hover:from-[#852BAF] hover:to-[#FC3F78] 
           transition-all duration-300 cursor-pointer"

                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
