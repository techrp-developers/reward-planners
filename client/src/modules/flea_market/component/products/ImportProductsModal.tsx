import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FiCheckCircle, FiX, FiXCircle } from "react-icons/fi";
import { importProductsCsv, type ProductImportResponse } from "../../api/fleaMarketProductImportApi";
import Spinner from "../ui/Spinner";

interface ImportProductsModalProps {
  open: boolean;
  onClose: () => void;
}

// Centered + wide, not the module's usual side Drawer — a results table
// with per-row error text needs more horizontal room than Drawer's max-w-md.
function ImportProductsModal({ open, onClose }: ImportProductsModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ProductImportResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (selected: File) => importProductsCsv(selected),
    onSuccess: (data) => setResult(data),
    onError: (error) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        "Failed to import products.";
      toast.error(message);
    },
  });

  const reset = () => {
    setFile(null);
    setResult(null);
    mutation.reset();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Only invalidate caches once something was actually imported — no need
  // to churn every product list on a plain open/close or a rejected file.
  const handleClose = () => {
    if (result && result.succeeded > 0) {
      void queryClient.invalidateQueries({ queryKey: ["flea-market", "all-products"] });
      void queryClient.invalidateQueries({ queryKey: ["flea-market", "products", "search"] });
      void queryClient.invalidateQueries({ queryKey: ["flea-market", "vendor-catalog"] });
    }
    reset();
    onClose();
  };

  const handleUpload = () => {
    if (!file) return;
    mutation.mutate(file);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={handleClose} />
      <div className="relative flex flex-col w-full max-w-3xl bg-white shadow-2xl rounded-2xl max-h-[85vh]">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="text-base font-bold text-gray-900">Import Products</h3>
            <p className="text-xs text-gray-500">Bulk-create products from a CSV file.</p>
          </div>
          <button type="button" onClick={handleClose} className="text-gray-400 hover:text-gray-600">
            <FiX className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 p-5 overflow-y-auto">
          {!result ? (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700">CSV file</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="block w-full px-3 py-2 mt-1 text-sm bg-white border border-slate-200 rounded-lg outline-none file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-purple-50 file:text-purple-700 file:font-bold file:text-xs"
                />
                <p className="mt-2 text-[11px] text-gray-400">
                  Columns, in order: vendor_id, product_name, brand_name, category_id, subcategory_id,
                  reward_rule_id, variant_label, mrp, sale_price, sku, initial_stock. Rows sharing the same
                  vendor_id + product_name + brand_name become one product with multiple variants.
                </p>
              </div>

              {mutation.isPending && (
                <div className="p-3 text-sm border rounded-xl text-purple-800 bg-purple-50 border-purple-100">
                  <Spinner label="Uploading and importing — this can take a few seconds for a large file..." />
                </div>
              )}

              {mutation.isError && (
                <p className="text-xs text-red-600">
                  {(mutation.error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
                    "Failed to import products."}
                </p>
              )}

              <button
                type="button"
                onClick={handleUpload}
                disabled={!file || mutation.isPending}
                className="w-full py-2.5 text-sm font-bold text-white rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] hover:from-[#9B3DCF] hover:to-[#FD4F88] shadow-md shadow-purple-500/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {mutation.isPending ? "Importing..." : "Upload & Import"}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div
                className={`p-3 text-sm font-semibold border rounded-xl ${
                  result.failed === 0
                    ? "text-emerald-800 bg-emerald-50 border-emerald-100"
                    : result.succeeded === 0
                      ? "text-red-800 bg-red-50 border-red-100"
                      : "text-amber-800 bg-amber-50 border-amber-100"
                }`}
              >
                {result.succeeded} of {result.productsProcessed} product{result.productsProcessed === 1 ? "" : "s"}{" "}
                imported successfully.
              </div>

              <div className="overflow-x-auto border border-gray-100 rounded-xl">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr className="text-[11px] font-bold tracking-wider text-left text-gray-500 uppercase">
                      <th className="px-4 py-2">Product</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2">Detail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {result.results.map((row, index) => (
                      <tr key={index} className={row.status === "success" ? "bg-emerald-50/40" : "bg-red-50/40"}>
                        <td className="px-4 py-2 font-semibold text-gray-800">{row.productName}</td>
                        <td className="px-4 py-2">
                          {row.status === "success" ? (
                            <span className="flex items-center gap-1 text-xs font-bold text-emerald-700">
                              <FiCheckCircle className="w-3.5 h-3.5" />
                              Success
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs font-bold text-red-600">
                              <FiXCircle className="w-3.5 h-3.5" />
                              Failed
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-600">
                          {row.status === "success"
                            ? `${row.variantsCreated} variant${row.variantsCreated === 1 ? "" : "s"} created${
                                row.rewardMappingFailed ? " (reward mapping failed — set it manually)" : ""
                              }`
                            : row.error}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                type="button"
                onClick={reset}
                className="w-full py-2.5 text-sm font-bold text-gray-700 transition-colors border border-gray-200 rounded-xl hover:bg-gray-50"
              >
                Import Another File
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ImportProductsModal;
