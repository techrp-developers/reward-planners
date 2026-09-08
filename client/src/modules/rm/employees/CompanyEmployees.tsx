import { useEffect, useMemo, useState, type FormEvent } from "react";
import { FiArrowLeft, FiBriefcase, FiEdit2, FiSearch, FiUsers, FiX } from "react-icons/fi";
import { Link, useParams } from "react-router-dom";
import Swal from "sweetalert2";
import { api } from "../../../common/api/api";
import { useDebounce } from "../../../common/hooks/useDebounce";

interface Company { company_name: string; company_email: string | null; company_phone: string | null; company_logo: string | null }
interface Employee { id: number; name: string; email: string | null; phone: string | null; department: string | null; role: string | null; date_of_joining: string | null; dob: string | null; address1: string | null; address2: string | null; reporting_manager: string | null; ctc: number | null; status: number; customer_id: number | null; customer_status: number | null; customer_is_verified: number | null; device_platform: "android" | "ios" | null; device_name: string | null }
type Form = { name: string; email: string; phone: string; department: string; role: string; date_of_joining: string; dob: string; address1: string; address2: string; reporting_manager: string; ctc: string; status: number };
const emptyForm: Form = { name: "", email: "", phone: "", department: "", role: "", date_of_joining: "", dob: "", address1: "", address2: "", reporting_manager: "", ctc: "", status: 1 };
const dateValue = (value: string | null) => value ? value.slice(0, 10) : "";

export default function CompanyEmployees() {
  const { companyId } = useParams();
  const [company, setCompany] = useState<Company | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"activated" | "not-activated">("activated");
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [saving, setSaving] = useState(false);
  const query = useDebounce(search.trim().toLowerCase(), 250);

  const load = async () => {
    try {
      setError("");
      const response = await api.get(`/manager/employee-directory/companies/${companyId}/employees`);
      setCompany(response.data?.data?.company ?? null);
      setEmployees(response.data?.data?.employees ?? []);
    } catch (err) { console.error(err); setError("Unable to load employees for this company."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [companyId]);

  const filtered = useMemo(() => employees.filter((employee) => {
    const activationMatches = tab === "activated" ? Number(employee.status) === 1 : Number(employee.status) !== 1;
    const searchMatches = [employee.name, employee.email, employee.phone, employee.department, employee.role, employee.reporting_manager].some((value) => String(value ?? "").toLowerCase().includes(query));
    return activationMatches && searchMatches;
  }), [employees, query, tab]);
  const activated = employees.filter((employee) => Number(employee.status) === 1).length;

  const openEdit = (employee: Employee) => {
    setEditing(employee);
    setForm({ name: employee.name, email: employee.email || "", phone: employee.phone || "", department: employee.department || "", role: employee.role || "", date_of_joining: dateValue(employee.date_of_joining), dob: dateValue(employee.dob), address1: employee.address1 || "", address2: employee.address2 || "", reporting_manager: employee.reporting_manager || "", ctc: employee.ctc == null ? "" : String(employee.ctc), status: Number(employee.status) === 1 ? 1 : 0 });
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing) return;
    try {
      setSaving(true);
      await api.put(`/manager/employee-directory/companies/${companyId}/employees/${editing.id}`, form);
      setEditing(null);
      await load();
      await Swal.fire("Updated", "Employee record updated successfully.", "success");
    } catch (err: any) { await Swal.fire("Unable to update employee", err.response?.data?.message || "Please try again.", "error"); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><div className="h-11 w-11 animate-spin rounded-full border-3 border-transparent border-r-[#FC3F78] border-t-[#852BAF]" /></div>;
  return <div className="mx-auto max-w-7xl space-y-6">
    <Link to="/rm/employees" className="inline-flex items-center gap-2 text-sm font-bold text-[#852BAF] hover:underline"><FiArrowLeft /> Back to companies</Link>
    <section className="flex flex-col gap-4 rounded-2xl border border-purple-100 bg-white/70 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-4">{company?.company_logo ? <img src={company.company_logo} alt="" className="h-12 w-12 rounded-2xl border object-contain" /> : <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-50 text-[#852BAF]"><FiBriefcase /></span>}<div><h1 className="text-2xl font-extrabold text-gray-900">{company?.company_name ?? "Company Employees"}</h1><p className="text-xs text-gray-500">{company?.company_email || "No company email"} · {company?.company_phone || "No company phone"}</p></div></div><span className="inline-flex items-center gap-2 rounded-xl bg-purple-50 px-3 py-2 text-xs font-bold text-[#852BAF]"><FiUsers /> {filtered.length} employees</span></section>
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b p-4 sm:flex-row sm:items-center sm:justify-between"><div className="inline-flex w-fit rounded-xl bg-gray-100 p-1"><button onClick={() => setTab("activated")} className={`rounded-lg px-4 py-2 text-sm font-bold ${tab === "activated" ? "bg-white text-emerald-700 shadow-sm" : "text-gray-500"}`}>Activated Employees ({activated})</button><button onClick={() => setTab("not-activated")} className={`rounded-lg px-4 py-2 text-sm font-bold ${tab === "not-activated" ? "bg-white text-amber-700 shadow-sm" : "text-gray-500"}`}>Not Activated ({employees.length - activated})</button></div><label className="relative block w-full sm:w-80"><FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employees..." className="w-full rounded-xl border bg-gray-50 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-[#852BAF]" /></label></div>
      {error ? <p className="p-12 text-center text-sm font-semibold text-red-600">{error}</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr>{["Employee", "Department / Role", "Joining", "Reporting manager", "Platform", "Company status", "Account", "Action"].map((h) => <th key={h} className={`px-5 py-3 ${h === "Action" ? "text-right" : ""}`}>{h}</th>)}</tr></thead><tbody className="divide-y">{filtered.map((employee) => <tr key={employee.id} className="hover:bg-purple-50/30"><td className="px-5 py-4"><p className="font-bold">{employee.name}</p><p className="text-xs text-gray-500">{employee.email || "No email"}</p><p className="text-xs text-gray-400">{employee.phone || "No phone"}</p></td><td className="px-5 py-4"><p className="font-semibold">{employee.department || "Unassigned"}</p><p className="text-xs text-gray-400">{employee.role || "No role"}</p></td><td className="px-5 py-4 text-gray-600">{employee.date_of_joining ? new Date(employee.date_of_joining).toLocaleDateString() : "—"}</td><td className="px-5 py-4 text-gray-600">{employee.reporting_manager || "—"}</td><td className="px-5 py-4"><Badge active={!!employee.device_platform} label={employee.device_platform || "Unknown"} /></td><td className="px-5 py-4"><Badge active={Number(employee.status) === 1} label={Number(employee.status) === 1 ? "Active" : "Inactive"} /></td><td className="px-5 py-4">{employee.customer_id ? <Badge active={Number(employee.customer_status) === 1} label={Number(employee.customer_status) === 1 ? "Active" : "Inactive"} /> : <p className="text-xs font-bold text-amber-600">Not activated</p>}</td><td className="px-5 py-4 text-right"><button onClick={() => openEdit(employee)} className="inline-flex items-center gap-1.5 rounded-lg border border-purple-100 px-3 py-2 text-xs font-bold text-[#852BAF] hover:bg-purple-50"><FiEdit2 /> Edit</button></td></tr>)}</tbody></table>{!filtered.length && <p className="p-12 text-center text-sm text-gray-500">No company users found.</p>}</div>}
    </section>
    {editing && <EditModal employee={editing} form={form} setForm={setForm} saving={saving} close={() => setEditing(null)} submit={submit} />}
  </div>;
}

function Badge({ active, label }: { active: boolean; label: string }) { return <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>{label}</span>; }

function EditModal({ employee, form, setForm, saving, close, submit }: { employee: Employee; form: Form; setForm: React.Dispatch<React.SetStateAction<Form>>; saving: boolean; close: () => void; submit: (e: FormEvent<HTMLFormElement>) => void }) {
  const fields = [['name','Name','text',true],['email','Email','email',true],['phone','Phone','tel',true],['department','Department','text',false],['role','Role','text',false],['date_of_joining','Date of joining','date',false],['dob','Date of birth','date',true],['reporting_manager','Reporting manager','text',false],['ctc','CTC','number',false],['address1','Address line 1','text',false],['address2','Address line 2','text',false]] as const;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) close(); }}><form onSubmit={submit} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl"><div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-4"><div><h2 className="text-xl font-extrabold">Edit Employee</h2><p className="text-xs text-gray-500">Update {employee.name}'s record</p></div><button type="button" disabled={saving} onClick={close} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"><FiX /></button></div><div className="grid gap-4 p-6 sm:grid-cols-2">{fields.map(([key, label, type, required]) => <label key={key} className={key.startsWith("address") ? "sm:col-span-2" : ""}><span className="mb-1.5 block text-xs font-bold text-gray-600">{label}{required && " *"}</span><input required={required} type={type} min={type === "number" ? 0 : undefined} step={type === "number" ? "0.01" : undefined} value={form[key]} onChange={(e) => setForm((current) => ({ ...current, [key]: e.target.value }))} className="w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none focus:border-[#852BAF] focus:ring-4 focus:ring-purple-100" /></label>)}<label><span className="mb-1.5 block text-xs font-bold text-gray-600">Company status</span><select value={form.status} onChange={(e) => setForm((current) => ({ ...current, status: Number(e.target.value) }))} className="w-full rounded-xl border px-3.5 py-2.5 text-sm"><option value={1}>Active</option><option value={0}>Inactive</option></select></label></div><div className="sticky bottom-0 flex justify-end gap-3 border-t bg-white px-6 py-4"><button type="button" disabled={saving} onClick={close} className="rounded-xl border px-4 py-2.5 text-sm font-bold text-gray-600">Cancel</button><button type="submit" disabled={saving} className="rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">{saving ? "Saving..." : "Save changes"}</button></div></form></div>;
}
