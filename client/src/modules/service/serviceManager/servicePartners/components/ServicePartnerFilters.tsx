import { FiSearch } from "react-icons/fi";
import { serviceCategories } from "../../shared/serviceCategories";
import type { ServicePartnerFilterState } from "../store/useServicePartners";
import type { ServicePartnerStatus } from "../types";

type StatusFilterValue = "All" | ServicePartnerStatus;

const statusTabs: { label: string; value: StatusFilterValue }[] = [
  { label: "All", value: "All" },
  { label: "Active", value: "active" },
  { label: "Pending", value: "pending" },
  { label: "Suspended", value: "suspended" },
];

const inputCls =
  "px-4 py-2.5 bg-gray-50/60 border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:ring-4 focus:ring-[#852BAF]/15 focus:border-[#852BAF] focus:bg-white transition-all";

interface Props {
  filters: ServicePartnerFilterState;
  onChange: (filters: ServicePartnerFilterState) => void;
  cities: string[];
}

export default function ServicePartnerFilters({ filters, onChange, cities }: Props) {
  const subCategoryOptions =
    filters.category === "All"
      ? []
      : serviceCategories.find((c) => c.name === filters.category)?.subCategories ?? [];

  return (
    <>
      <div className="px-6 pt-5 pb-4 border-b border-gray-50">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            className="flex gap-1 p-1 rounded-xl"
            style={{ background: "rgba(133,43,175,0.04)", border: "1px solid rgba(133,43,175,0.08)" }}
          >
            {statusTabs.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => onChange({ ...filters, status: value })}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 cursor-pointer ${
                  filters.status === value ? "text-white shadow-sm" : "text-gray-500 hover:text-[#852BAF]"
                }`}
                style={
                  filters.status === value
                    ? { background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)" }
                    : {}
                }
              >
                {label}
              </button>
            ))}
          </div>

          <div className="relative">
            <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
            <input
              type="text"
              placeholder="Search partners…"
              value={filters.search}
              onChange={(e) => onChange({ ...filters, search: e.target.value })}
              className={`${inputCls} pl-9 w-60`}
            />
          </div>
        </div>
      </div>

      <div
        className="px-6 py-3 flex flex-wrap items-center gap-3"
        style={{ background: "rgba(133,43,175,0.02)", borderBottom: "1px solid rgba(133,43,175,0.06)" }}
      >
        <select
          value={filters.category}
          onChange={(e) => onChange({ ...filters, category: e.target.value, subCategory: "All" })}
          className={`${inputCls} cursor-pointer`}
        >
          <option value="All">All Categories</option>
          {serviceCategories.map((c) => (
            <option key={c.slug} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={filters.subCategory}
          onChange={(e) => onChange({ ...filters, subCategory: e.target.value })}
          disabled={filters.category === "All"}
          className={`${inputCls} cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <option value="All">All Sub-Categories</option>
          {subCategoryOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          value={filters.city}
          onChange={(e) => onChange({ ...filters, city: e.target.value })}
          className={`${inputCls} cursor-pointer`}
        >
          <option value="All">All Cities</option>
          {cities.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
