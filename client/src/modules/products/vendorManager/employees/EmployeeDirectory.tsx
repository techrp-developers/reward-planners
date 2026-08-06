import { useEffect, useMemo, useState } from "react";
import { FiBriefcase, FiSearch, FiUsers } from "react-icons/fi";
import { api } from "../../../../common/api/api";
import { useDebounce } from "../../../../common/hooks/useDebounce";

interface Company {
  company_id: number;
  company_name: string;
  company_email: string | null;
  company_phone: string | null;
  company_logo: string | null;
  status: number;
  total_employee_count: number;
  active_employee_count: number;
}

interface Customer {
  user_id: number;
  company_id: number | null;
  company_user_id: number | null;
  name: string;
  email: string | null;
  phone: string | null;
  status: number;
  is_verified: number;
  last_login_at: string | null;
  company_name: string | null;
  department: string | null;
  company_role: string | null;
}

type Tab = "companies" | "employees";

const text = (value: unknown) => String(value ?? "").toLowerCase();

function Badge({ active, label }: { active: boolean; label: string }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${
      active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"
    }`}>
      {label}
    </span>
  );
}

export default function EmployeeDirectory() {
  const [tab, setTab] = useState<Tab>("companies");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const query = useDebounce(search.trim().toLowerCase(), 250);

  useEffect(() => {
    let active = true;
    async function loadDirectory() {
      setLoading(true);
      setError("");
      try {
        const [companyResponse, customerResponse] = await Promise.all([
          api.get("/manager/employee-directory/companies"),
          api.get("/manager/employee-directory/customers"),
        ]);
        if (!active) return;
        setCompanies(companyResponse.data?.data ?? []);
        setCustomers(customerResponse.data?.data ?? []);
      } catch (requestError) {
        console.error("Failed to load employee directory:", requestError);
        if (active) setError("Unable to load the employee directory.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadDirectory();
    return () => { active = false; };
  }, []);

  const filteredCompanies = useMemo(() => companies.filter((company) =>
    [company.company_name, company.company_email, company.company_phone]
      .some((value) => text(value).includes(query))), [companies, query]);

  const filteredCustomers = useMemo(() => customers.filter((customer) =>
    [customer.name, customer.email, customer.phone, customer.company_name, customer.department, customer.company_role]
      .some((value) => text(value).includes(query))), [customers, query]);

  const visibleCount = tab === "companies" ? filteredCompanies.length : filteredCustomers.length;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="flex flex-col gap-4 rounded-2xl border border-purple-100 bg-white/70 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#852BAF] to-[#FC3F78] text-white shadow-lg shadow-purple-200">
            <FiUsers size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">Employee Directory</h1>
            <p className="mt-0.5 text-xs font-medium text-gray-500">View companies and registered customer accounts</p>
          </div>
        </div>
        <span className="rounded-xl bg-purple-50 px-3 py-1.5 text-xs font-bold text-[#852BAF]">{visibleCount} records</span>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex w-fit rounded-xl bg-gray-100 p-1">
            {(["companies", "employees"] as Tab[]).map((item) => (
              <button key={item} onClick={() => { setTab(item); setSearch(""); }} className={`rounded-lg px-5 py-2 text-sm font-bold capitalize transition ${tab === item ? "bg-white text-[#852BAF] shadow-sm" : "text-gray-500 hover:text-gray-800"}`}>
                {item}
              </button>
            ))}
          </div>
          <label className="relative block sm:w-80">
            <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${tab}...`} className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-[#852BAF] focus:bg-white focus:ring-4 focus:ring-purple-100" />
          </label>
        </div>

        {loading ? (
          <div className="flex min-h-72 items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-3 border-transparent border-r-[#FC3F78] border-t-[#852BAF]" /></div>
        ) : error ? (
          <div className="p-12 text-center text-sm font-semibold text-red-600">{error}</div>
        ) : tab === "companies" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="px-5 py-3">Company</th><th className="px-5 py-3">Contact</th><th className="px-5 py-3">Total employees</th><th className="px-5 py-3">Active employees</th><th className="px-5 py-3">Status</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {filteredCompanies.map((company) => <tr key={company.company_id} className="hover:bg-purple-50/30">
                  <td className="px-5 py-4"><div className="flex items-center gap-3">{company.company_logo ? <img src={company.company_logo} alt="" className="h-10 w-10 rounded-xl border border-gray-100 object-contain" /> : <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-[#852BAF]"><FiBriefcase /></span>}<div><p className="font-bold text-gray-900">{company.company_name}</p><p className="text-xs text-gray-400">ID #{company.company_id}</p></div></div></td>
                  <td className="px-5 py-4"><p className="text-gray-700">{company.company_email || "—"}</p><p className="text-xs text-gray-400">{company.company_phone || "—"}</p></td>
                  <td className="px-5 py-4 font-semibold text-gray-700">{company.total_employee_count}</td><td className="px-5 py-4 font-semibold text-gray-700">{company.active_employee_count}</td>
                  <td className="px-5 py-4"><Badge active={Number(company.status) === 1} label={Number(company.status) === 1 ? "Active" : "Inactive"} /></td>
                </tr>)}
              </tbody>
            </table>
            {!filteredCompanies.length && <p className="p-12 text-center text-sm text-gray-500">No companies found.</p>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="px-5 py-3">Employee</th><th className="px-5 py-3">Company</th><th className="px-5 py-3">Role / Department</th><th className="px-5 py-3">Account</th><th className="px-5 py-3">Last login</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {filteredCustomers.map((customer) => <tr key={customer.user_id} className="hover:bg-purple-50/30">
                  <td className="px-5 py-4"><p className="font-bold text-gray-900">{customer.name}</p><p className="text-xs text-gray-500">{customer.email || "No email"}</p><p className="text-xs text-gray-400">{customer.phone || "No phone"}</p></td>
                  <td className="px-5 py-4"><p className="font-semibold text-gray-700">{customer.company_name || "Unassigned"}</p><p className="text-xs text-gray-400">Customer #{customer.user_id}</p></td>
                  <td className="px-5 py-4"><p className="text-gray-700">{customer.company_role || "—"}</p><p className="text-xs text-gray-400">{customer.department || "No department"}</p></td>
                  <td className="px-5 py-4"><div className="flex flex-col items-start gap-1"><Badge active={Number(customer.status) === 1} label={Number(customer.status) === 1 ? "Active" : "Inactive"} /><span className="text-[11px] font-semibold text-gray-400">{Number(customer.is_verified) === 1 ? "Verified" : "Not verified"}</span></div></td>
                  <td className="px-5 py-4 text-xs text-gray-500">{customer.last_login_at ? new Date(customer.last_login_at).toLocaleString() : "Never"}</td>
                </tr>)}
              </tbody>
            </table>
            {!filteredCustomers.length && <p className="p-12 text-center text-sm text-gray-500">No employees found.</p>}
          </div>
        )}
      </section>
    </div>
  );
}
