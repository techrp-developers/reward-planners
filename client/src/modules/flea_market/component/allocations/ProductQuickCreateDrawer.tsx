import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import Drawer from "../ui/Drawer";
import { ErrorState } from "../ui/EmptyState";
import { createProduct, type CreatedProduct } from "../../api/fleaMarketProductsApi";

interface ProductQuickCreateDrawerProps {
  open: boolean;
  vendorId: number | null;
  onClose: () => void;
  onCreated: (product: CreatedProduct) => void;
}

const inputClass =
  "w-full px-3 py-2 mt-1 text-sm bg-white border border-slate-200 rounded-lg outline-none focus:border-transparent focus:ring-4 focus:ring-[#852BAF]/15";

function ProductQuickCreateDrawer({ open, vendorId, onClose, onCreated }: ProductQuickCreateDrawerProps) {
  const [productName, setProductName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [mrp, setMrp] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [sku, setSku] = useState("");
  const [initialStock, setInitialStock] = useState("");

  const mutation = useMutation({
    mutationFn: () => {
      if (!vendorId) throw new Error("Select a vendor first");
      return createProduct({
        vendorId,
        productName,
        brandName: brandName || undefined,
        mrp: Number(mrp),
        salePrice: Number(salePrice),
        sku: sku || undefined,
        initialStock: Number(initialStock),
      });
    },
  });

  const reset = () => {
    setProductName("");
    setBrandName("");
    setMrp("");
    setSalePrice("");
    setSku("");
    setInitialStock("");
    mutation.reset();
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate(undefined, {
      onSuccess: (product) => {
        toast.success(`Product "${product.productName}" created`);
        onCreated(product);
        reset();
        onClose();
      },
    });
  };

  return (
    <Drawer open={open} title="Add New Product" onClose={handleClose}>
      {!vendorId ? (
        <p className="text-sm text-gray-500">Select a vendor on the allocation form first.</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-700">Product Name</label>
            <input value={productName} onChange={(e) => setProductName(e.target.value)} required className={inputClass} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700">
              Brand <span className="text-gray-400">(optional)</span>
            </label>
            <input value={brandName} onChange={(e) => setBrandName(e.target.value)} className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700">MRP</label>
              <input type="number" min={0} step="0.01" value={mrp} onChange={(e) => setMrp(e.target.value)} required className={inputClass} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Sale Price</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                required
                className={inputClass}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700">
                SKU <span className="text-gray-400">(optional)</span>
              </label>
              <input value={sku} onChange={(e) => setSku(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Initial Stock</label>
              <input
                type="number"
                min={0}
                value={initialStock}
                onChange={(e) => setInitialStock(e.target.value)}
                required
                className={inputClass}
              />
            </div>
          </div>

          {mutation.isError && (
            <ErrorState
              message={
                (mutation.error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
                "Failed to create product."
              }
            />
          )}

          <button
            type="submit"
            disabled={mutation.isPending}
            className="w-full py-2.5 text-sm font-bold text-white rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] hover:from-[#9B3DCF] hover:to-[#FD4F88] shadow-md shadow-purple-500/20 transition-all disabled:opacity-60"
          >
            {mutation.isPending ? "Creating..." : "Create Product"}
          </button>
        </form>
      )}
    </Drawer>
  );
}

export default ProductQuickCreateDrawer;
