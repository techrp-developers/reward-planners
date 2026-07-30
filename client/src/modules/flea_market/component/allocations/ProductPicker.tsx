import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FiPlusCircle, FiSearch } from "react-icons/fi";
import { searchCatalogProducts, type FleaMarketProduct } from "../../api/fleaMarketProductsApi";
import Spinner from "../ui/Spinner";
import { EmptyState, ErrorState } from "../ui/EmptyState";

interface ProductPickerProps {
  vendorId: number;
  // Native checkboxes, not click-only buttons — Tab + Space toggles a row
  // for free, no custom keyboard handling needed.
  selectedVariantIds: Set<number>;
  onToggle: (product: FleaMarketProduct) => void;
  onAddNew: () => void;
}

const inputClass =
  "w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg outline-none focus:border-transparent focus:ring-4 focus:ring-[#852BAF]/15";

// Browses ONE vendor's full catalog as a plain list, not an autocomplete —
// the whole point of this component is that vendor selection already
// scoped things down, so there's no need to re-search per keystroke. The
// filter box below only narrows the already-fetched array client-side.
// Multiple products can be checked here; StockPage collects the checked
// ones into a "Selected for Allocation" table where quantities get entered.
function ProductPicker({ vendorId, selectedVariantIds, onToggle, onAddNew }: ProductPickerProps) {
  const [filterText, setFilterText] = useState("");

  const productsQuery = useQuery({
    queryKey: ["flea-market", "vendor-catalog", vendorId],
    queryFn: () => searchCatalogProducts("", vendorId),
  });

  const products = productsQuery.data ?? [];

  const filtered = useMemo(() => {
    const term = filterText.trim().toLowerCase();
    if (!term) return products;
    return products.filter(
      (product) => product.name.toLowerCase().includes(term) || product.sku.toLowerCase().includes(term),
    );
  }, [products, filterText]);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <label className="text-xs font-semibold text-slate-700">Products</label>
        <button
          type="button"
          onClick={onAddNew}
          className="flex items-center gap-1 text-[11px] font-bold text-purple-600 hover:text-purple-800"
        >
          <FiPlusCircle className="w-3 h-3" />
          Add New Product
        </button>
      </div>

      <div className="relative mt-1">
        <FiSearch className="absolute -translate-y-1/2 left-3 top-1/2 w-3.5 h-3.5 text-gray-400" />
        <input
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Filter this vendor's products..."
          className={`${inputClass} pl-9`}
        />
      </div>

      <div className="mt-3 overflow-y-auto border border-gray-100 rounded-xl max-h-96">
        {productsQuery.isLoading ? (
          <div className="py-8">
            <Spinner label="Loading vendor's products..." />
          </div>
        ) : productsQuery.isError ? (
          <ErrorState message="Unable to load this vendor's products." onRetry={() => void productsQuery.refetch()} />
        ) : products.length === 0 ? (
          <EmptyState
            icon={FiSearch}
            title="No products for this vendor yet"
            description="Use 'Add New Product' above to create the first one."
          />
        ) : filtered.length === 0 ? (
          <p className="py-8 text-sm text-center text-gray-400">No products match "{filterText}".</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr className="text-[11px] font-bold tracking-wider text-left text-gray-500 uppercase">
                <th className="w-10 px-3 py-2" />
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2 text-right">MRP</th>
                <th className="px-3 py-2 text-right">Sale Price</th>
                <th className="px-3 py-2 text-right">Stock</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((product) => {
                const checked = selectedVariantIds.has(product.variantId);
                const disabled = product.stock <= 0;

                return (
                  <tr
                    key={product.variantId}
                    onClick={() => !disabled && onToggle(product)}
                    className={`${disabled ? "opacity-40" : "cursor-pointer hover:bg-gray-50"} ${checked ? "bg-purple-50/60" : ""}`}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => onToggle(product)}
                        onClick={(e) => e.stopPropagation()}
                        title={disabled ? "No master stock available" : undefined}
                        className="w-3.5 h-3.5 accent-purple-600 disabled:opacity-40"
                      />
                    </td>
                    <td className="px-3 py-2 font-semibold text-gray-800">
                      {product.name}
                      {product.brand && <span className="ml-1 font-normal text-gray-400">· {product.brand}</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-500">{product.sku}</td>
                    <td className="px-3 py-2 text-right text-gray-500">₹{product.mrp.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-800">
                      ₹{product.salePrice.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-500">{product.stock.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default ProductPicker;
