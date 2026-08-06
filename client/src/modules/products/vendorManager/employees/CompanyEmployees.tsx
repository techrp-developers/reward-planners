import { useEffect, useMemo, useState } from "react";
import { FiArrowLeft, FiBriefcase, FiSearch, FiUsers } from "react-icons/fi";
import { Link, useParams } from "react-router-dom";
import { api } from "../../../../common/api/api";
import { useDebounce } from "../../../../common/hooks/useDebounce";

interface Company {
  company_id: number;
  company_name: string;
  company_email: string | null;
  company_phone: string | null;
  company_logo: string | null;
  status: number;
}

interface CompanyEmployee {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  role: string | null;
  date_of_joining: string | null;
  reporting_manager: string | null;
  ctc: number | null;
  status: number;
  customer_id: number | null;
  customer_status: number | null;
  customer_is_verified: number | null;
  last_login_at: string | null;
}

const searchable = (value: unknown) => String(value ?? "").toLowerCase();
const displayDate = (value: string | null) => value ? new Date(value).toLocaleDateString() : "—";

export default function CompanyEmployees() {
  const { companyId } = useParams();
  const [company, setCompany] = useState<Company | null>(null);
  const [employees, setEmployees] = useState<CompanyEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusTab, setStatusTab] = useState<"active" | "inactive">("active");
  const query = useDebounce(search.trim().toLowerCase(), 250);

  useEffect(() => {
    let active = true;
    async function loadEmployees() {
      try {
        const response = await api.get(`/manager/employee-directory/companies/${companyId}/employees`);
        if (!active) return;
        setCompany(response.data?.data?.company ?? null);
        setEmployees(response.data?.data?.employees ?? []);
      } catch (requestError) {
        console.error("Unable to load company employees:", requestError);
        if (active) setError("Unable to load employees for this company.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadEmployees();
    return () => { active = false; };
  }, [companyId]);

  const filteredEmployees = useMemo(() => employees.filter((employee) => {
    const matchesStatus = statusTab === "active"
      ? Number(employee.status) === 1
      : Number(employee.status) !== 1;
    const matchesSearch = [employee.name, employee.email, employee.phone, employee.department, employee.role, employee.reporting_manager]
      .some((value) => searchable(value).includes(query));
    return matchesStatus && matchesSearch;
  }), [employees, query, statusTab]);

  const activeCount = employees.filter((employee) => Number(employee.status) === 1).length;
  const inactiveCount = employees.length - activeCount;

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><div className="h-11 w-11 animate-spin rounded-full border-3 border-transparent border-r-[#FC3F78] border-t-[#852BAF]" /></div>;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Link to="/manager/employees" className="inline-flex items-center gap-2 text-sm font-bold text-[#852BAF] hover:underline"><FiArrowLeft /> Back to companies</Link>
      <section className="flex flex-col gap-4 rounded-2xl border border-purple-100 bg-white/70 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          {company?.company_logo ? <img src={company.company_logo} alt="" className="h-12 w-12 rounded-2xl border border-gray-100 object-contain" /> : <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-50 text-[#852BAF]"><FiBriefcase size={21} /></span>}
          <div><h1 className="text-2xl font-extrabold text-gray-900">{company?.company_name ?? "Company Employees"}</h1><p className="mt-0.5 text-xs text-gray-500">{company?.company_email || "No company email"} · {company?.company_phone || "No company phone"}</p></div>
        </div>
        <span className="inline-flex items-center gap-2 rounded-xl bg-purple-50 px-3 py-2 text-xs font-bold text-[#852BAF]"><FiUsers /> {filteredEmployees.length} employees</span>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="inline-flex w-fit rounded-xl bg-gray-100 p-1"><button onClick={() => setStatusTab("active")} className={`rounded-lg px-4 py-2 text-sm font-bold transition ${statusTab === "active" ? "bg-white text-emerald-700 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}>Active Employees ({activeCount})</button><button onClick={() => setStatusTab("inactive")} className={`rounded-lg px-4 py-2 text-sm font-bold transition ${statusTab === "inactive" ? "bg-white text-gray-700 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}>Inactive Employees ({inactiveCount})</button></div><label className="relative block w-full sm:w-80"><FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${statusTab} employees...`} className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-[#852BAF] focus:bg-white focus:ring-4 focus:ring-purple-100" /></label></div>
        {error ? <p className="p-12 text-center text-sm font-semibold text-red-600">{error}</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="px-5 py-3">Employee</th><th className="px-5 py-3">Department / Role</th><th className="px-5 py-3">Joining</th><th className="px-5 py-3">Reporting manager</th><th className="px-5 py-3">Account</th></tr></thead><tbody className="divide-y divide-gray-100">
          {filteredEmployees.map((employee) => <tr key={employee.id} className="hover:bg-purple-50/30"><td className="px-5 py-4"><p className="font-bold text-gray-900">{employee.name}</p><p className="text-xs text-gray-500">{employee.email || "No email"}</p><p className="text-xs text-gray-400">{employee.phone || "No phone"}</p></td><td className="px-5 py-4"><p className="font-semibold text-gray-700">{employee.department || "Unassigned"}</p><p className="text-xs text-gray-400">{employee.role || "No role"}</p></td><td className="px-5 py-4 text-gray-600">{displayDate(employee.date_of_joining)}</td><td className="px-5 py-4 text-gray-600">{employee.reporting_manager || "—"}</td><td className="px-5 py-4"><p className={`text-xs font-bold ${employee.customer_id ? "text-emerald-600" : "text-amber-600"}`}>{employee.customer_id ? "Activated" : "Not activated"}</p>{employee.customer_id && <p className="mt-1 text-[11px] text-gray-400">{Number(employee.customer_is_verified) === 1 ? "Verified" : "Not verified"}</p>}</td></tr>)}
        </tbody></table>{!filteredEmployees.length && <p className="p-12 text-center text-sm text-gray-500">No company users found.</p>}</div>}
      </section>
    </div>
  );
}
