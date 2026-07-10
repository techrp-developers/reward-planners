import { FiFileText, FiUpload, FiEye, FiDownload } from "react-icons/fi";
import { useMyDocuments } from "../../store/useMyDocuments";

export default function DocumentsPage() {
  const { documents, loading, uploadDocument } = useMyDocuments();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-[3px] border-transparent border-t-[#852BAF] border-r-[#FC3F78] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div
        className="flex items-center gap-4 p-5 rounded-2xl"
        style={{
          background: "linear-gradient(135deg, rgba(133,43,175,0.06) 0%, rgba(252,63,120,0.04) 100%)",
          border: "1px solid rgba(133,43,175,0.1)",
        }}
      >
        <div
          className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shrink-0"
          style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)", boxShadow: "0 6px 20px rgba(133,43,175,0.25)" }}
        >
          <FiFileText size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Documents</h1>
          <p className="text-xs text-gray-500 font-medium mt-0.5">Upload and manage your compliance documents</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {documents.map((doc) => (
          <div
            key={doc.key}
            className="bg-white rounded-2xl border border-gray-100 p-5 shadow-[0_4px_24px_rgba(0,0,0,0.04)] flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-800">{doc.label}</p>
              {doc.fileName ? (
                <p className="text-xs text-gray-400 truncate mt-0.5">
                  {doc.fileName} · {doc.uploadedOn && new Date(doc.uploadedOn).toLocaleDateString()}
                </p>
              ) : (
                <p className="text-xs text-amber-600 font-semibold mt-0.5">Not uploaded</p>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {doc.url && (
                <>
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2.5 text-gray-400 hover:text-[#852BAF] bg-gray-50 border border-gray-100 rounded-xl transition-all"
                    title="Preview"
                  >
                    <FiEye size={15} />
                  </a>
                  <a
                    href={doc.url}
                    download={doc.fileName ?? undefined}
                    className="p-2.5 text-gray-400 hover:text-[#852BAF] bg-gray-50 border border-gray-100 rounded-xl transition-all"
                    title="Download"
                  >
                    <FiDownload size={15} />
                  </a>
                </>
              )}
              <label
                className="flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold text-white rounded-xl cursor-pointer transition-all hover:opacity-90 active:scale-95"
                style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)" }}
              >
                <FiUpload size={12} /> Upload
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadDocument(doc.key, file);
                  }}
                />
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
