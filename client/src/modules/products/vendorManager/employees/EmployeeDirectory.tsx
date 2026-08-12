import { useEffect, useMemo, useState } from "react";
import { FiBriefcase, FiEdit2, FiEye, FiPlus, FiSearch, FiTrash2, FiUsers, FiX } from "react-icons/fi";
import { Link } from "react-router-dom";
import { api } from "../../../../common/api/api";
import { useDebounce } from "../../../../common/hooks/useDebounce";
import { confirmDialog } from "../../../../common/utils/confirmDialog";

interface Company {
  company_id: number;
  company_name: string;
  company_email: string | null;
  company_phone: string | null;
  company_logo: string | null;
  status: number;
  total_employee_count: number;
  active_employee_count: number;
  android_user_count: number;
  ios_user_count: number;
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
  device_platform: "android" | "ios" | null;
}

type Tab = "companies" | "employees";

interface CompanyForm {
  company_name: string;
  company_email: string;
  company_phone: string;
}

interface EmployeeForm {
  company_id: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  role: string;
  dob: string;
  date_of_joining: string;
  reporting_manager: string;
  ctc: string;
}

const emptyCompanyForm: CompanyForm = {
  company_name: "",
  company_email: "",
  company_phone: "",
};

const emptyEmployeeForm: EmployeeForm = {
  company_id: "",
  name: "",
  email: "",
  phone: "",
  department: "",
  role: "",
  dob: "",
  date_of_joining: "",
  reporting_manager: "",
  ctc: "",
};

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

function PlatformBadge({ platform }: { platform: Customer["device_platform"] }) {
  const label = platform === "android" ? "Android" : platform === "ios" ? "iOS" : "Unknown";
  const color = platform === "android"
    ? "bg-emerald-50 text-emerald-700"
    : platform === "ios"
      ? "bg-slate-900 text-white"
      : "bg-gray-100 text-gray-500";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase ${color}`}>{label}</span>;
}

export default function EmployeeDirectory() {
  const [tab, setTab] = useState<Tab>("companies");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [companyModalOpen, setCompanyModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [companyForm, setCompanyForm] = useState<CompanyForm>(emptyCompanyForm);
  const [companyLogo, setCompanyLogo] = useState<File | null>(null);
  const [savingCompany, setSavingCompany] = useState(false);
  const [deletingCompanyId, setDeletingCompanyId] = useState<number | null>(null);
  const [companyFormError, setCompanyFormError] = useState("");
  const [employeeModalOpen, setEmployeeModalOpen] = useState(false);
  const [employeeForm, setEmployeeForm] = useState<EmployeeForm>(emptyEmployeeForm);
  const [savingEmployee, setSavingEmployee] = useState(false);
  const [employeeFormError, setEmployeeFormError] = useState("");
  const query = useDebounce(search.trim().toLowerCase(), 250);

  async function fetchCompanies() {
    const response = await api.get("/manager/employee-directory/companies");
    setCompanies(response.data?.data ?? []);
  }

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

  function openCreateCompany() {
    setEditingCompany(null);
    setCompanyForm(emptyCompanyForm);
    setCompanyLogo(null);
    setCompanyFormError("");
    setCompanyModalOpen(true);
  }

  function openEditCompany(company: Company) {
    setEditingCompany(company);
    setCompanyForm({
      company_name: company.company_name,
      company_email: company.company_email ?? "",
      company_phone: company.company_phone ?? "",
    });
    setCompanyLogo(null);
    setCompanyFormError("");
    setCompanyModalOpen(true);
  }

  async function saveCompany(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!companyForm.company_name.trim()) {
      setCompanyFormError("Company name is required.");
      return;
    }

    setSavingCompany(true);
    setCompanyFormError("");
    try {
      const formData = new FormData();
      formData.append("company_name", companyForm.company_name.trim());
      formData.append("company_email", companyForm.company_email.trim());
      formData.append("company_phone", companyForm.company_phone.trim());
      if (companyLogo) formData.append("company_logo", companyLogo);

      if (editingCompany) {
        await api.put(`/company/update-company/${editingCompany.company_id}`, formData);
      } else {
        await api.post("/company/create-company", formData);
      }
      await fetchCompanies();
      setCompanyModalOpen(false);
    } catch (requestError) {
      console.error("Unable to save company:", requestError);
      setCompanyFormError("Unable to save the company. Please check the details and try again.");
    } finally {
      setSavingCompany(false);
    }
  }

  async function deleteCompany(company: Company) {
    const confirmed = await confirmDialog({
      title: "Delete Company?",
      text: `${company.company_name} will be marked inactive.`,
      confirmButtonText: "Delete",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#DC2626",
      cancelButtonColor: "#9CA3AF",
      reverseButtons: true,
      customClass: { popup: "rounded-2xl" },
    });
    if (!confirmed) return;

    setDeletingCompanyId(company.company_id);
    try {
      await api.delete(`/company/delete-company/${company.company_id}`);
      await fetchCompanies();
    } catch (requestError) {
      console.error("Unable to delete company:", requestError);
      setError("Unable to delete the company.");
    } finally {
      setDeletingCompanyId(null);
    }
  }

  function openCreateEmployee() {
    setEmployeeForm(emptyEmployeeForm);
    setEmployeeFormError("");
    setEmployeeModalOpen(true);
  }

  async function saveEmployee(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!employeeForm.dob) {
      setEmployeeFormError("Date of birth is required.");
      return;
    }
    setSavingEmployee(true);
    setEmployeeFormError("");
    try {
      await api.post("/manager/employee-directory/employees", employeeForm);
      setEmployeeModalOpen(false);
    } catch (requestError) {
      console.error("Unable to add employee:", requestError);
      setEmployeeFormError("Unable to add the employee. The email or phone may already exist.");
    } finally {
      setSavingEmployee(false);
    }
  }

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
                {item === "employees" ? "Activated Employees" : "Companies"}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative block sm:w-72">
              <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${tab}...`} className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-[#852BAF] focus:bg-white focus:ring-4 focus:ring-purple-100" />
            </label>
            {tab === "companies" && <button onClick={openCreateCompany} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#852BAF] to-[#C64EFE] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:shadow-md"><FiPlus /> Add Company</button>}
            {tab === "employees" && <button onClick={openCreateEmployee} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#852BAF] to-[#C64EFE] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:shadow-md"><FiPlus /> Add Employee</button>}
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-72 items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-3 border-transparent border-r-[#FC3F78] border-t-[#852BAF]" /></div>
        ) : error ? (
          <div className="p-12 text-center text-sm font-semibold text-red-600">{error}</div>
        ) : tab === "companies" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="px-5 py-3">Company</th><th className="px-5 py-3">Contact</th><th className="px-5 py-3">Total employees</th><th className="px-5 py-3">Active employees</th><th className="px-5 py-3">Mobile users</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Action</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {filteredCompanies.map((company) => <tr key={company.company_id} className="hover:bg-purple-50/30">
                  <td className="px-5 py-4"><div className="flex items-center gap-3">{company.company_logo ? <img src={company.company_logo} alt="" className="h-10 w-10 rounded-xl border border-gray-100 object-contain" /> : <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-[#852BAF]"><FiBriefcase /></span>}<div><p className="font-bold text-gray-900">{company.company_name}</p><p className="text-xs text-gray-400">ID #{company.company_id}</p></div></div></td>
                  <td className="px-5 py-4"><p className="text-gray-700">{company.company_email || "—"}</p><p className="text-xs text-gray-400">{company.company_phone || "—"}</p></td>
                  <td className="px-5 py-4 font-semibold text-gray-700">{company.total_employee_count}</td><td className="px-5 py-4 font-semibold text-gray-700">{company.active_employee_count}</td><td className="px-5 py-4"><div className="flex gap-2 whitespace-nowrap"><span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">Android {company.android_user_count}</span><span className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-bold text-white">iOS {company.ios_user_count}</span></div></td>
                  <td className="px-5 py-4"><Badge active={Number(company.status) === 1} label={Number(company.status) === 1 ? "Active" : "Inactive"} /></td>
                  <td className="px-5 py-4 text-right"><div className="inline-flex items-center gap-2"><Link to={`/manager/companies/${company.company_id}/employees`} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-100 px-3 py-2 text-xs font-bold text-blue-600 transition hover:bg-blue-50"><FiEye /> Employees</Link><button onClick={() => openEditCompany(company)} className="inline-flex items-center gap-1.5 rounded-lg border border-purple-100 px-3 py-2 text-xs font-bold text-[#852BAF] transition hover:bg-purple-50"><FiEdit2 /> Edit</button><button onClick={() => void deleteCompany(company)} disabled={deletingCompanyId === company.company_id || Number(company.status) !== 1} className="inline-flex items-center gap-1.5 rounded-lg border border-red-100 px-3 py-2 text-xs font-bold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"><FiTrash2 /> {deletingCompanyId === company.company_id ? "Deleting..." : "Delete"}</button></div></td>
                </tr>)}
              </tbody>
            </table>
            {!filteredCompanies.length && <p className="p-12 text-center text-sm text-gray-500">No companies found.</p>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="px-5 py-3">Employee</th><th className="px-5 py-3">Company</th><th className="px-5 py-3">Role / Department</th><th className="px-5 py-3">Platform</th><th className="px-5 py-3">Account</th><th className="px-5 py-3">Last login</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {filteredCustomers.map((customer) => <tr key={customer.user_id} className="hover:bg-purple-50/30">
                  <td className="px-5 py-4"><p className="font-bold text-gray-900">{customer.name}</p><p className="text-xs text-gray-500">{customer.email || "No email"}</p><p className="text-xs text-gray-400">{customer.phone || "No phone"}</p></td>
                  <td className="px-5 py-4"><p className="font-semibold text-gray-700">{customer.company_name || "Unassigned"}</p><p className="text-xs text-gray-400">Customer #{customer.user_id}</p></td>
                  <td className="px-5 py-4"><p className="text-gray-700">{customer.company_role || "—"}</p><p className="text-xs text-gray-400">{customer.department || "No department"}</p></td>
                  <td className="px-5 py-4"><PlatformBadge platform={customer.device_platform} /></td>
                  <td className="px-5 py-4"><div className="flex flex-col items-start gap-1"><Badge active={Number(customer.status) === 1} label={Number(customer.status) === 1 ? "Active" : "Inactive"} /><span className="text-[11px] font-semibold text-gray-400">{Number(customer.is_verified) === 1 ? "Verified" : "Not verified"}</span></div></td>
                  <td className="px-5 py-4 text-xs text-gray-500">{customer.last_login_at ? new Date(customer.last_login_at).toLocaleString() : "Never"}</td>
                </tr>)}
              </tbody>
            </table>
            {!filteredCustomers.length && <p className="p-12 text-center text-sm text-gray-500">No employees found.</p>}
          </div>
        )}
      </section>

      {companyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
              <div><h2 className="text-lg font-extrabold text-gray-900">{editingCompany ? "Update Company" : "Add Company"}</h2><p className="mt-0.5 text-xs text-gray-500">Enter the company contact and branding details.</p></div>
              <button onClick={() => setCompanyModalOpen(false)} disabled={savingCompany} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><FiX size={20} /></button>
            </div>
            <form onSubmit={saveCompany} className="space-y-4 p-6">
              <label className="block"><span className="mb-1.5 block text-xs font-bold text-gray-700">Company name *</span><input required value={companyForm.company_name} onChange={(event) => setCompanyForm((current) => ({ ...current, company_name: event.target.value }))} className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[#852BAF] focus:ring-4 focus:ring-purple-100" /></label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block"><span className="mb-1.5 block text-xs font-bold text-gray-700">Email</span><input type="email" value={companyForm.company_email} onChange={(event) => setCompanyForm((current) => ({ ...current, company_email: event.target.value }))} className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[#852BAF] focus:ring-4 focus:ring-purple-100" /></label>
                <label className="block"><span className="mb-1.5 block text-xs font-bold text-gray-700">Phone</span><input value={companyForm.company_phone} onChange={(event) => setCompanyForm((current) => ({ ...current, company_phone: event.target.value }))} className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[#852BAF] focus:ring-4 focus:ring-purple-100" /></label>
              </div>
              <label className="block"><span className="mb-1.5 block text-xs font-bold text-gray-700">Company logo</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setCompanyLogo(event.target.files?.[0] ?? null)} className="w-full rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-purple-50 file:px-3 file:py-1.5 file:font-bold file:text-[#852BAF]" /><span className="mt-1 block text-[11px] text-gray-400">PNG, JPG or WebP, maximum 5 MB.</span></label>
              {companyFormError && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">{companyFormError}</p>}
              <div className="flex justify-end gap-3 border-t border-gray-100 pt-4"><button type="button" onClick={() => setCompanyModalOpen(false)} disabled={savingCompany} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50">Cancel</button><button type="submit" disabled={savingCompany} className="rounded-xl bg-gradient-to-r from-[#852BAF] to-[#C64EFE] px-5 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">{savingCompany ? "Saving..." : editingCompany ? "Update Company" : "Create Company"}</button></div>
            </form>
          </div>
        </div>
      )}

      {employeeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-gray-950/45 p-4 backdrop-blur-sm">
          <div className="my-6 w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5"><div><h2 className="text-lg font-extrabold text-gray-900">Add Employee</h2><p className="mt-0.5 text-xs text-gray-500">The employee can activate their customer account afterward.</p></div><button onClick={() => setEmployeeModalOpen(false)} disabled={savingEmployee} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><FiX size={20} /></button></div>
            <form onSubmit={saveEmployee} className="space-y-4 p-6">
              <label className="block"><span className="mb-1.5 block text-xs font-bold text-gray-700">Company *</span><select required value={employeeForm.company_id} onChange={(event) => setEmployeeForm((current) => ({ ...current, company_id: event.target.value }))} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-[#852BAF] focus:ring-4 focus:ring-purple-100"><option value="">Select a company</option>{companies.map((company) => <option key={company.company_id} value={company.company_id}>{company.company_name}</option>)}</select></label>
              <div className="grid gap-4 sm:grid-cols-2"><label className="block"><span className="mb-1.5 block text-xs font-bold text-gray-700">Employee name *</span><input required value={employeeForm.name} onChange={(event) => setEmployeeForm((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[#852BAF] focus:ring-4 focus:ring-purple-100" /></label><label className="block"><span className="mb-1.5 block text-xs font-bold text-gray-700">Email *</span><input required type="email" value={employeeForm.email} onChange={(event) => setEmployeeForm((current) => ({ ...current, email: event.target.value }))} className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[#852BAF] focus:ring-4 focus:ring-purple-100" /></label></div>
              <div className="grid gap-4 sm:grid-cols-2"><label className="block"><span className="mb-1.5 block text-xs font-bold text-gray-700">Phone *</span><input required value={employeeForm.phone} onChange={(event) => setEmployeeForm((current) => ({ ...current, phone: event.target.value }))} className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[#852BAF] focus:ring-4 focus:ring-purple-100" /></label><label className="block"><span className="mb-1.5 block text-xs font-bold text-gray-700">Department</span><input value={employeeForm.department} onChange={(event) => setEmployeeForm((current) => ({ ...current, department: event.target.value }))} className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[#852BAF] focus:ring-4 focus:ring-purple-100" /></label></div>
              <div className="grid gap-4 sm:grid-cols-2"><label className="block"><span className="mb-1.5 block text-xs font-bold text-gray-700">Role</span><input value={employeeForm.role} onChange={(event) => setEmployeeForm((current) => ({ ...current, role: event.target.value }))} className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[#852BAF] focus:ring-4 focus:ring-purple-100" /></label><label className="block"><span className="mb-1.5 block text-xs font-bold text-gray-700">Date of birth *</span><input required type="date" max={new Date().toISOString().slice(0, 10)} value={employeeForm.dob} onChange={(event) => setEmployeeForm((current) => ({ ...current, dob: event.target.value }))} className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[#852BAF] focus:ring-4 focus:ring-purple-100" /></label></div>
              <div className="grid gap-4 sm:grid-cols-2"><label className="block"><span className="mb-1.5 block text-xs font-bold text-gray-700">Date of joining</span><input type="date" value={employeeForm.date_of_joining} onChange={(event) => setEmployeeForm((current) => ({ ...current, date_of_joining: event.target.value }))} className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[#852BAF] focus:ring-4 focus:ring-purple-100" /></label><label className="block"><span className="mb-1.5 block text-xs font-bold text-gray-700">Reporting manager</span><input value={employeeForm.reporting_manager} onChange={(event) => setEmployeeForm((current) => ({ ...current, reporting_manager: event.target.value }))} className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[#852BAF] focus:ring-4 focus:ring-purple-100" /></label></div>
              <label className="block"><span className="mb-1.5 block text-xs font-bold text-gray-700">CTC</span><input type="number" min="0" step="0.01" value={employeeForm.ctc} onChange={(event) => setEmployeeForm((current) => ({ ...current, ctc: event.target.value }))} className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[#852BAF] focus:ring-4 focus:ring-purple-100" /></label>
              {employeeFormError && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">{employeeFormError}</p>}
              <div className="flex justify-end gap-3 border-t border-gray-100 pt-4"><button type="button" onClick={() => setEmployeeModalOpen(false)} disabled={savingEmployee} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50">Cancel</button><button type="submit" disabled={savingEmployee} className="rounded-xl bg-gradient-to-r from-[#852BAF] to-[#C64EFE] px-5 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">{savingEmployee ? "Adding..." : "Add Employee"}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
