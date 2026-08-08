import { memo, useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { FiSearch, FiX, FiPackage } from "react-icons/fi";
import { useDebounce } from "../../../../common/hooks/useDebounce";
import { SessionExpiredError } from "../../api/fleaMarketClient";
import { searchProducts, isInStock, type FleaMarketProduct } from "../../api/fleaMarketProductsApi";
import SectionCard from "../ui/SectionCard";
import Avatar from "../ui/Avatar";
import Spinner from "../ui/Spinner";
import { ErrorState } from "../ui/EmptyState";

/* ================= TYPES ================= */

interface ProductSearchProps {
  onProductSelected: (product: FleaMarketProduct) => void;
  // Forwarded up rather than shown as a generic search error — BillingPage
  // owns dropping the UI back into CustomerVerify's reverify mode.
  onSessionExpired: () => void;
}

const MIN_SEARCH_LENGTH = 2;
const LISTBOX_ID = "flea-market-product-listbox";

const optionId = (product: FleaMarketProduct) => `product-option-${product.variantId}`;

/* ================= COMPONENT ================= */

function ProductSearch({ onProductSelected, onSessionExpired }: ProductSearchProps) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 400);
  const trimmedSearch = debouncedSearch.trim();
  const searchEnabled = trimmedSearch.length >= MIN_SEARCH_LENGTH;

  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /* ================= SEARCH PRODUCTS ================= */
  const {
    data: results = [],
    isFetching,
    error,
  } = useQuery({
    queryKey: ["flea-market", "products", "search", trimmedSearch],
    queryFn: () => searchProducts(trimmedSearch),
    enabled: searchEnabled,
  });

  useEffect(() => {
    if (error instanceof SessionExpiredError) {
      onSessionExpired();
    }
  }, [error, onSessionExpired]);

  // Dropdown opens once a search settles (success or error) — mirrors the
  // "closed while empty/too-short" state, reopens once results are ready.
  useEffect(() => {
    if (!searchEnabled) {
      setIsOpen(false);
      setHighlightedIndex(0);
      return;
    }
    if (!isFetching) {
      setIsOpen(true);
      setHighlightedIndex(0);
    }
    // trimmedSearch intentionally included so a new query re-evaluates this,
    // not just isFetching flipping.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchEnabled, isFetching, trimmedSearch]);

  /* ================= CLICK OUTSIDE ================= */
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  /* ================= HANDLERS ================= */

  const handleSelectProduct = (product: FleaMarketProduct) => {
    if (!isInStock(product)) return;

    onProductSelected(product);

    setSearch("");
    setIsOpen(false);
    setHighlightedIndex(0);
    inputRef.current?.focus();
  };

  const handleClear = () => {
    setSearch("");
    setIsOpen(false);
    setHighlightedIndex(0);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();

      if (results.length === 0) return;

      if (!isOpen) {
        setIsOpen(true);
        return;
      }

      setHighlightedIndex((prev) => (prev + 1) % results.length);
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();

      if (results.length === 0) return;

      if (!isOpen) {
        setIsOpen(true);
        return;
      }

      setHighlightedIndex((prev) => (prev - 1 + results.length) % results.length);
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();

      // Dropdown closed (e.g. after Escape) but exactly one match left from
      // the last search — let Enter select it directly.
      if (!isOpen && results.length === 1) {
        handleSelectProduct(results[0]);
        return;
      }

      if (isOpen && results[highlightedIndex]) {
        handleSelectProduct(results[highlightedIndex]);
      }
      return;
    }

    if (e.key === "Escape") {
      setIsOpen(false);
      setHighlightedIndex(0);
    }
  };

  const activeOption = isOpen && results[highlightedIndex] ? results[highlightedIndex] : null;
  const showError = !isFetching && error && !(error instanceof SessionExpiredError);

  /* ================= RENDER ================= */

  return (
    <div ref={containerRef} className="relative">
      <SectionCard icon={FiPackage} title="Product Search" subtitle="Search by SKU, name or brand to add it to the bill.">
        <div className="relative">
          <div
            className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl bg-white
            border border-slate-200 shadow-sm transition-all duration-300
            focus-within:border-transparent focus-within:ring-4 focus-within:ring-[#852BAF]/15"
          >
            <FiSearch className="w-5 h-5 text-gray-400 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded={isOpen}
              aria-controls={LISTBOX_ID}
              aria-autocomplete="list"
              aria-activedescendant={activeOption ? optionId(activeOption) : undefined}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                if (results.length > 0) setIsOpen(true);
              }}
              placeholder="Search by SKU, name or brand"
              className="w-full text-gray-800 bg-transparent outline-none placeholder:text-gray-400"
            />
            {search && (
              <button type="button" onClick={handleClear} className="text-gray-400 hover:text-gray-600 shrink-0">
                <FiX className="w-4 h-4" />
              </button>
            )}
          </div>

          {isOpen && (
            <div
              id={LISTBOX_ID}
              role="listbox"
              className="absolute z-20 w-full mt-2 overflow-y-auto bg-white border border-gray-100 shadow-lg max-h-[360px] rounded-xl"
            >
              {isFetching && (
                <div className="py-6">
                  <Spinner label="Searching products..." />
                </div>
              )}

              {showError && <ErrorState className="border-0 rounded-none" message="Unable to search products right now." />}

              {!isFetching && !error && results.length === 0 && (
                <p className="p-4 text-sm text-center text-gray-400">No products found for "{trimmedSearch}".</p>
              )}

              {!isFetching &&
                !error &&
                results.map((product, index) => {
                  const isHighlighted = index === highlightedIndex;
                  const isOutOfStock = !isInStock(product);

                  return (
                    <div
                      key={product.variantId}
                      id={optionId(product)}
                      role="option"
                      aria-selected={isHighlighted}
                      aria-disabled={isOutOfStock}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      onClick={() => handleSelectProduct(product)}
                      className={`flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-50 last:border-b-0 ${
                        isOutOfStock
                          ? "opacity-50 cursor-not-allowed"
                          : isHighlighted
                            ? "cursor-pointer bg-gradient-to-r from-[#852BAF]/10 to-[#FC3F78]/10"
                            : "cursor-pointer hover:bg-gray-50"
                      }`}
                    >
                      <div className="flex items-center min-w-0 gap-3">
                        <Avatar name={product.name} imageUrl={product.heroImage} />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-gray-800 truncate">{product.name}</p>
                          <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                            {product.brand ?? "—"} · {product.sku}
                          </p>
                          {isOutOfStock && <span className="text-[10px] font-bold text-red-500">Out of stock</span>}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-gray-900">₹{product.salePrice.toLocaleString()}</p>
                        {product.mrp !== product.salePrice && (
                          <p className="text-[11px] text-gray-400 line-through">₹{product.mrp.toLocaleString()}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {search.trim().length > 0 && search.trim().length < MIN_SEARCH_LENGTH && (
          <p className="mt-2 text-xs text-gray-400">Type at least {MIN_SEARCH_LENGTH} characters to search.</p>
        )}
      </SectionCard>
    </div>
  );
}

export default memo(ProductSearch);
