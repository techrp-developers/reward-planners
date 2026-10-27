import { useEffect, useState, useMemo, useRef, type FormEvent } from "react";
import { useDebounce } from "../../../common/hooks/useDebounce";
import { Link } from "react-router-dom";
import Swal from "sweetalert2";
import { hrApi } from "../../../common/api/hrApi";
import { FiChevronLeft, FiChevronRight, FiClock, FiDownload, FiEdit2, FiPlus, FiSearch, FiUserCheck, FiUserX, FiUsers, FiX } from "react-icons/fi";
import { Card, EmptyState, Initials, LoadingRow, PageHeader, Stat, StatStrip, StatusDot } from "../components/ui";
import { button, field, formatDate, iconButton, label } from "../components/styles";

/* ================= TYPES ================= */

type EmployeeStatus = "active" | "pending" | "inactive";
type FilterType = "all" | EmployeeStatus;

interface Employee {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  role: string | null;
  status: EmployeeStatus;
  customer_id: number | null;
  customer_is_active: number;
  created_at: string;
}

interface EmployeeEditForm {
  name: string;
  email: string;
  phone: string;
  department: string;
  role: string;
  status: "active" | "inactive";
}

const emptyEditForm: EmployeeEditForm = {
  name: "",
  email: "",
  phone: "",
  department: "",
  role: "",
  status: "active",
};

/* ================= COMPONENT ================= */

export default function EmployeeList() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<FilterType>("all");
  const [loading, setLoading] = useState<boolean>(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [editForm, setEditForm] = useState<EmployeeEditForm>(emptyEditForm);
  const [editLoading, setEditLoading] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [departments, setDepartments] = useState<string[]>([]);
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [stats, setStats] = useState({ total: 0, active: 0, pending: 0, inactive: 0 });
  const pageSize = 10;
  const debouncedSearch = useDebounce(search.trim(), 300);
  const latestRequest = useRef(0);

  // Pagination, search and status filtering run on the server so every
  // employee is reachable, not just the first batch.
  const fetchEmployees = async () => {
    const requestId = ++latestRequest.current;
    try {
      setLoading(true);
      const response = await hrApi.get("/employees", {
        params: { page: currentPage, limit: pageSize, search: debouncedSearch, status: statusFilter },
      });
      if (requestId !== latestRequest.current) return;
      setEmployees(response.data?.data || []);
      setTotalEmployees(Number(response.data?.pagination?.total || 0));
      if (response.data?.stats) setStats(response.data.stats);
    } catch (error: any) {
      if (requestId !== latestRequest.current) return;
      await Swal.fire(
        "Unable to load employees",
        error.response?.data?.message || "Please check that the local server is running.",
        "error",
      );
    } finally {
      if (requestId === latestRequest.current) {
        setLoading(false);
        setHasLoaded(true);
      }
    }
  };

  useEffect(() => {
    void fetchEmployees();
  }, [currentPage, debouncedSearch, statusFilter]);

  useEffect(() => {
    hrApi
      .get("/employees/departments")
      .then((response) =>
        setDepartments((response.data?.data || []).map((item: { name: string }) => item.name)),
      )
      .catch((error) => console.error("Unable to load departments:", error));
  }, []);

  const totalPages = Math.ceil(totalEmployees / pageSize);
  const pageNumbers = useMemo(() => getPageNumbers(currentPage, totalPages), [currentPage, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, statusFilter]);

  // e.g. after deactivating the last employee on the final page
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const handleDelete = async (employee: Employee) => {
    const confirmation = await Swal.fire({
      title: "Deactivate employee?",
      text: `${employee.name} will no longer be active.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Deactivate",
      confirmButtonColor: "#dc2626",
    });

    if (!confirmation.isConfirmed) return;

    try {
      await hrApi.delete(`/employees/${employee.id}`);
      await fetchEmployees();
      await Swal.fire("Deactivated", "Employee has been deactivated.", "success");
    } catch (error: any) {
      await Swal.fire(
        "Unable to deactivate",
        error.response?.data?.message || "Please try again.",
        "error",
      );
    }
  };

  const openEditModal = async (employee: Employee) => {
    setEditingEmployee(employee);
    setEditLoading(true);

    try {
      const response = await hrApi.get(`/employees/${employee.id}`);
      const data = response.data?.data;
      setEditForm({
        name: data?.name || "",
        email: data?.email || "",
        phone: data?.phone || "",
        department: data?.department || "",
        role: data?.role || "",
        status: data?.status === "inactive" ? "inactive" : "active",
      });
    } catch (error: any) {
      setEditingEmployee(null);
      await Swal.fire(
        "Unable to load employee",
        error.response?.data?.message || "Please try again.",
        "error",
      );
    } finally {
      setEditLoading(false);
    }
  };

  const closeEditModal = () => {
    if (savingEdit) return;
    setEditingEmployee(null);
    setEditForm(emptyEditForm);
  };

  const handleEditSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingEmployee) return;

    try {
      setSavingEdit(true);
      await hrApi.put(`/employees/${editingEmployee.id}`, {
        name: editForm.name,
        email: editForm.email,
        phone: editForm.phone,
        department: editForm.department,
        role: editForm.role,
      });

      // "pending" is still employed, so it only changes when toggled to inactive.
      const currentEmployment = editingEmployee.status === "inactive" ? "inactive" : "active";
      if (editForm.status !== currentEmployment) {
        await hrApi.patch(`/employees/${editingEmployee.id}/status`, {
          status: editForm.status,
        });
      }

      setEditingEmployee(null);
      setEditForm(emptyEditForm);
      await fetchEmployees();
      await Swal.fire("Updated", "Employee updated successfully.", "success");
    } catch (error: any) {
      await Swal.fire(
        "Unable to update employee",
        error.response?.data?.message || "Please try again.",
        "error",
      );
    } finally {
      setSavingEdit(false);
    }
  };

  const handleExport = async () => {
    try {
      const response = await hrApi.get("/employees/export", {
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = "employees.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      await Swal.fire(
        "Unable to export",
        error.response?.data?.message || "Please try again.",
        "error",
      );
    }
  };

  const startRow = totalEmployees ? (currentPage - 1) * pageSize + 1 : 0;
  const endRow = Math.min(currentPage * pageSize, totalEmployees);

  return (
    <>
      <PageHeader
        title="Employees"
        description="Everyone on your company roster, and whether they've started using the app."
        actions={
          <>
            <button type="button" onClick={() => void handleExport()} className={button.secondary}>
              <FiDownload className="h-4 w-4" /> Export
            </button>
            <Link to="/hr/onboarding" className={button.primary}>
              <FiPlus className="h-4 w-4" /> Add employee
            </Link>
          </>
        }
      />

      <StatStrip>
        <Stat label="All employees" value={stats.total} note="On your roster" icon={FiUsers} active={statusFilter === "all"} onClick={() => setStatusFilter("all")} />
        <Stat label="Active" value={stats.active} note="Using the app" icon={FiUserCheck} tone="green" active={statusFilter === "active"} onClick={() => setStatusFilter("active")} />
        <Stat label="Pending" value={stats.pending} note="Haven't activated yet" icon={FiClock} tone="amber" active={statusFilter === "pending"} onClick={() => setStatusFilter("pending")} />
        <Stat label="Inactive" value={stats.inactive} note="Left the company" icon={FiUserX} tone="grey" active={statusFilter === "inactive"} onClick={() => setStatusFilter("inactive")} />
      </StatStrip>

      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <FiSearch className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, phone or role"
              aria-label="Search employees"
              className={`${field} py-1.5 pl-8`}
            />
          </div>
          <p className="text-sm text-slate-500">
            {statusFilter === "all" ? "Showing everyone" : `Showing ${statusFilter} employees`}
            {statusFilter !== "all" && (
              <button type="button" onClick={() => setStatusFilter("all")} className="ml-2 text-[#852BAF] hover:underline cursor-pointer">
                Clear
              </button>
            )}
          </p>
        </div>

        <div className={`transition-opacity ${loading && hasLoaded ? "opacity-60" : ""}`} aria-busy={loading}>
          {!hasLoaded ? (
            <LoadingRow text="Loading employees…" />
          ) : employees.length === 0 ? (
            <EmptyState
              title={debouncedSearch || statusFilter !== "all" ? "No one matches" : "No employees yet"}
              hint={debouncedSearch || statusFilter !== "all" ? "Try a different search or filter." : "Add your team and they'll be able to activate the app."}
              action={!debouncedSearch && statusFilter === "all" ? <Link to="/hr/onboarding" className={button.secondary}>Add employees</Link> : undefined}
            />
          ) : (
            <>
              {/* Mobile / tablet */}
              <ul className="divide-y divide-slate-100 lg:hidden">
                {employees.map((emp) => (
                  <li key={emp.id} className="flex items-start gap-3 px-4 py-3">
                    <Initials name={emp.name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{emp.name}</p>
                      <p className="truncate text-xs text-slate-500">{emp.email || "No email"}</p>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {[emp.role, emp.department].filter(Boolean).join(" · ") || "No role yet"}
                      </p>
                      <div className="mt-2"><EmployeeStatus employee={emp} /></div>
                    </div>
                    <div className="flex shrink-0">
                      <RowActions employee={emp} onEdit={() => void openEditModal(emp)} onDeactivate={() => void handleDelete(emp)} />
                    </div>
                  </li>
                ))}
              </ul>

              {/* Desktop */}
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs text-slate-500">
                      <th className="px-4 py-2.5 font-medium">Name</th>
                      <th className="px-4 py-2.5 font-medium">Phone</th>
                      <th className="px-4 py-2.5 font-medium">Department</th>
                      <th className="px-4 py-2.5 font-medium">Status</th>
                      <th className="px-4 py-2.5 font-medium">Added</th>
                      <th className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {employees.map((emp) => (
                      <tr key={emp.id} className="group hover:bg-purple-50/30">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Initials name={emp.name} />
                            <div className="min-w-0">
                              <p className="truncate font-medium text-slate-900">{emp.name}</p>
                              {emp.email ? (
                                <a href={`mailto:${emp.email}`} className="block truncate text-xs text-slate-500 hover:text-slate-900 hover:underline">{emp.email}</a>
                              ) : (
                                <p className="text-xs text-slate-400">No email</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-600">
                          {emp.phone || <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-slate-800">{emp.department || <span className="text-slate-400">—</span>}</p>
                          {emp.role && <p className="text-xs text-slate-500">{emp.role}</p>}
                        </td>
                        <td className="px-4 py-3"><EmployeeStatus employee={emp} /></td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatDate(emp.created_at)}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end opacity-70 transition-opacity group-hover:opacity-100">
                            <RowActions employee={emp} onEdit={() => void openEditModal(emp)} onDeactivate={() => void handleDelete(emp)} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {hasLoaded && totalEmployees > 0 && (
          <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm tabular-nums text-slate-500">
              {startRow}–{endRow} of {totalEmployees}
            </p>
            {totalPages > 1 && (
              <nav aria-label="Pagination" className="flex items-center gap-1">
                <button type="button" aria-label="Previous page" disabled={currentPage === 1} onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))} className={iconButton}>
                  <FiChevronLeft className="h-4 w-4" />
                </button>
                {pageNumbers.map((page, index) =>
                  page === "gap" ? (
                    <span key={`gap-${index}`} className="px-1 text-sm text-slate-400">…</span>
                  ) : (
                    <button
                      type="button"
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      aria-current={currentPage === page ? "page" : undefined}
                      className={`h-8 min-w-8 rounded-md px-2 text-sm tabular-nums transition-colors cursor-pointer ${
                        currentPage === page ? "bg-gradient-to-r from-[#852BAF] from-60% to-[#C13A8E] text-white" : "text-slate-600 hover:bg-purple-50"
                      }`}
                    >
                      {page}
                    </button>
                  ),
                )}
                <button type="button" aria-label="Next page" disabled={currentPage === totalPages} onClick={() => setCurrentPage((page) => Math.min(page + 1, totalPages))} className={iconButton}>
                  <FiChevronRight className="h-4 w-4" />
                </button>
              </nav>
            )}
          </div>
        )}
      </Card>

      {/* EDIT MODAL */}
      {editingEmployee && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeEditModal();
          }}
        >
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white shadow-xl" role="dialog" aria-modal="true" aria-labelledby="edit-employee-title">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 id="edit-employee-title" className="text-base font-semibold text-slate-900">Edit {editingEmployee.name}</h2>
              <button type="button" onClick={closeEditModal} aria-label="Close" className={iconButton}>
                <FiX className="h-4 w-4" />
              </button>
            </div>

            {editLoading ? (
              <LoadingRow text="Loading…" />
            ) : (
              <form onSubmit={handleEditSubmit}>
                <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
                  <div>
                    <label htmlFor="edit-name" className={label}>Full name</label>
                    <input id="edit-name" value={editForm.name} onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))} required className={field} />
                  </div>
                  <div>
                    <label htmlFor="edit-email" className={label}>Work email</label>
                    <input id="edit-email" type="email" value={editForm.email} onChange={(event) => setEditForm((current) => ({ ...current, email: event.target.value }))} required className={field} />
                  </div>
                  <div>
                    <label htmlFor="edit-phone" className={label}>Phone</label>
                    <input id="edit-phone" type="tel" value={editForm.phone} onChange={(event) => setEditForm((current) => ({ ...current, phone: event.target.value }))} className={field} />
                  </div>
                  <div>
                    <label htmlFor="edit-department" className={label}>Department</label>
                    <select id="edit-department" value={editForm.department} onChange={(event) => setEditForm((current) => ({ ...current, department: event.target.value }))} className={`${field} cursor-pointer`}>
                      <option value="">No department</option>
                      {departments.map((department) => (
                        <option key={department} value={department}>{department}</option>
                      ))}
                      {editForm.department && !departments.includes(editForm.department) && (
                        <option value={editForm.department}>{editForm.department}</option>
                      )}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="edit-role" className={label}>Job title</label>
                    <input id="edit-role" value={editForm.role} onChange={(event) => setEditForm((current) => ({ ...current, role: event.target.value }))} className={field} />
                  </div>

                  <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-slate-200 px-4 py-3 sm:col-span-2">
                    <span>
                      <span className="block text-sm font-medium text-slate-800">Still works here</span>
                      <span className="text-xs text-slate-500">
                        {editForm.status === "active"
                          ? "They can log in and receive rewards."
                          : "They'll be logged out of the app and can't receive rewards."}
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={editForm.status === "active"}
                      onChange={(event) => setEditForm((current) => ({ ...current, status: event.target.checked ? "active" : "inactive" }))}
                      className="mt-1 h-4 w-4 shrink-0 accent-[#852BAF]"
                    />
                  </label>
                </div>

                <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
                  <button type="button" onClick={closeEditModal} disabled={savingEdit} className={button.ghost}>
                    Cancel
                  </button>
                  <button type="submit" disabled={savingEdit} className={button.primary}>
                    {savingEdit ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/* ================= HELPER COMPONENTS ================= */

// One status per employee: employment status (HR) plus what it means for the app.
function EmployeeStatus({ employee }: { employee: Employee }) {
  if (employee.status === "inactive") {
    return <StatusDot tone="grey">Inactive</StatusDot>;
  }
  if (employee.status === "pending") {
    return (
      <div>
        <StatusDot tone="amber">Pending</StatusDot>
        <p className="text-xs text-slate-400">Not on the app yet</p>
      </div>
    );
  }
  const appDisabled = Number(employee.customer_is_active) !== 1;
  return (
    <div>
      <StatusDot tone={appDisabled ? "red" : "green"}>Active</StatusDot>
      {appDisabled && <p className="text-xs text-red-600">App account switched off</p>}
    </div>
  );
}

function RowActions({ employee, onEdit, onDeactivate }: { employee: Employee; onEdit: () => void; onDeactivate: () => void }) {
  return (
    <>
      <button type="button" onClick={onEdit} aria-label={`Edit ${employee.name}`} title="Edit" className={iconButton}>
        <FiEdit2 className="h-3.5 w-3.5" />
      </button>
      {employee.status !== "inactive" && (
        <button type="button" onClick={onDeactivate} aria-label={`Mark ${employee.name} as left`} title="Mark as left" className={`${iconButton} hover:text-red-600`}>
          <FiUserX className="h-3.5 w-3.5" />
        </button>
      )}
    </>
  );
}

// Page numbers with gaps, e.g. 1 … 4 5 6 … 20, so the bar stays short.
function getPageNumbers(current: number, total: number): (number | "gap")[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const pages: (number | "gap")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push("gap");
  for (let page = start; page <= end; page += 1) pages.push(page);
  if (end < total - 1) pages.push("gap");
  pages.push(total);
  return pages;
}
