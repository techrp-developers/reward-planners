import { useEffect, useState, useMemo, type FormEvent } from "react";
import { Link } from "react-router-dom";
import Swal from "sweetalert2";
import { hrApi } from "../../../api/hrApi";
import {
  FiSearch,
  FiPlus,
  FiMail,
  FiPhone,
  FiUser,
  FiUserCheck,
  FiClock,
  FiUpload,
  FiArrowLeft,
  FiEdit,
  FiTrash2,
  FiBriefcase,
  FiFileText,
  FiX,
} from "react-icons/fi";

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

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string; // Unified name
  active?: boolean;
  onClick?: () => void;
}

/* ================= COMPONENT ================= */

export default function EmployeeList() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<FilterType>("all");
  const [loading, setLoading] = useState<boolean>(true);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [editForm, setEditForm] = useState<EmployeeEditForm>(emptyEditForm);
  const [editLoading, setEditLoading] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const response = await hrApi.get("/employees", {
        params: { limit: 100 },
      });
      setEmployees(response.data?.data || []);
    } catch (error: any) {
      await Swal.fire(
        "Unable to load employees",
        error.response?.data?.message || "Please check that the local server is running.",
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchEmployees();
  }, []);

  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      const matchSearch =
        emp.name.toLowerCase().includes(search.toLowerCase()) ||
        (emp.email || "").toLowerCase().includes(search.toLowerCase()) ||
        (emp.department || "").toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || emp.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [employees, search, statusFilter]);

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

      if (editForm.status !== editingEmployee.status) {
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 border-4 border-purple-200 rounded-full border-t-purple-600 animate-spin"></div>
          <p className="font-medium text-gray-500">Loading employees...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      {/* HEADER */}
      <div className="mb-6">
        <Link to="/hr/dashboard" className="inline-flex items-center gap-1 mb-2 text-sm text-gray-500 hover:text-purple-600">
          <FiArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">
              Employee <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#852BAF] to-[#FC3F78]">Directory</span>
            </h1>
            <p className="mt-1 text-gray-500">Manage and track all team members</p>
          </div>
          <Link to="/hr/onboarding" className="flex items-center justify-center gap-2 px-5 py-2.5 text-white font-semibold rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] hover:from-[#9B3DCF] hover:to-[#FD4F88] shadow-lg shadow-purple-500/30 transition-all duration-300">
            <FiPlus className="w-5 h-5" /> Add Employee
          </Link>
        </div>
      </div>

      {/* STATS CARDS */}
      <div className="grid grid-cols-1 gap-4 mb-6 sm:grid-cols-3">
        <StatCard
          label="Total Employees"
          value={employees.length}
          icon={FiUser}
          gradient="from-gray-500 to-gray-700"
          active={statusFilter === "all"}
          onClick={() => setStatusFilter("all")}
        />
        <StatCard
          label="Active"
          value={employees.filter((e) => e.status === "active").length}
          icon={FiUserCheck}
          gradient="from-emerald-500 to-emerald-700"
          active={statusFilter === "active"}
          onClick={() => setStatusFilter("active")}
        />
        <StatCard
          label="Pending"
          value={employees.filter((e) => e.status === "pending").length}
          icon={FiClock}
          gradient="from-amber-500 to-amber-700"
          active={statusFilter === "pending"}
          onClick={() => setStatusFilter("pending")}
        />
      </div>

      {/* SEARCH & FILTER */}
      <div className="flex flex-col gap-4 mb-6 md:flex-row">
        <div className="relative flex-1">
          <FiSearch className="absolute left-4 top-3.5 text-gray-400 w-5 h-5" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or department..."
            className="w-full py-3 pl-12 pr-4 transition-all border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as FilterType)}
            className="px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="inactive">Inactive</option>
          </select>
          <button onClick={handleExport} className="flex items-center gap-2 px-4 py-3 transition-colors border border-gray-200 rounded-xl hover:bg-gray-50">
            <FiUpload className="w-5 h-5" /> <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>

      {/* TABLE */}
      <div className="overflow-hidden bg-white border border-gray-200 shadow-lg rounded-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50">
              <tr className="text-xs font-semibold tracking-wider text-gray-500 uppercase">
                <th className="px-5 py-4">Employee</th>
                <th className="px-5 py-4">Contact</th>
                <th className="px-5 py-4">Department</th>
                <th className="px-5 py-4">Role</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4">Joined</th>
                <th className="px-5 py-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center">
                    <FiUser className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p className="font-medium text-gray-500">No employees found</p>
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp) => (
                  <tr key={emp.id} className="transition-colors hover:bg-gray-50">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-10 h-10 font-bold text-white rounded-full bg-gradient-to-r from-purple-500 to-pink-500">
                          {emp.name.charAt(0)}
                        </div>
                        <span className="font-semibold text-gray-900">{emp.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-600">
                      <div className="flex items-center gap-2"><FiMail className="w-3.5 h-3.5" /> {emp.email}</div>
                      <div className="flex items-center gap-2 mt-0.5 text-gray-400"><FiPhone className="w-3.5 h-3.5" /> {emp.phone}</div>
                    </td>
                    <td className="px-5 py-4 text-sm font-medium text-gray-700">{emp.department}</td>
                    <td className="px-5 py-4 text-sm text-gray-600">{emp.role}</td>
                    <td className="px-5 py-4"><StatusBadge status={emp.status} /></td>
                    <td className="px-5 py-4 text-sm text-gray-500">{emp.created_at}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => void openEditModal(emp)} className="p-2 text-gray-400 hover:text-purple-600"><FiEdit className="w-4 h-4" /></button>
                        <button onClick={() => void handleDelete(emp)} className="p-2 text-gray-400 hover:text-red-600"><FiTrash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editingEmployee && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeEditModal();
          }}
        >
          <div className="w-full max-w-2xl overflow-hidden bg-white shadow-2xl rounded-2xl">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Edit Employee</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Update employee information and account status
                </p>
              </div>
              <button
                type="button"
                onClick={closeEditModal}
                className="p-2 text-gray-400 rounded-lg hover:bg-gray-100 hover:text-gray-700"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            {editLoading ? (
              <div className="flex items-center justify-center h-72">
                <div className="w-10 h-10 border-4 border-purple-200 rounded-full border-t-purple-600 animate-spin" />
              </div>
            ) : (
              <form onSubmit={handleEditSubmit}>
                <div className="grid grid-cols-1 gap-5 p-6 md:grid-cols-2">
                  <EditField icon={FiUser} label="Full Name" required>
                    <input
                      value={editForm.name}
                      onChange={(event) =>
                        setEditForm((current) => ({ ...current, name: event.target.value }))
                      }
                      required
                      className="w-full py-3 pl-11 pr-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </EditField>

                  <EditField icon={FiMail} label="Email" required>
                    <input
                      type="email"
                      value={editForm.email}
                      onChange={(event) =>
                        setEditForm((current) => ({ ...current, email: event.target.value }))
                      }
                      required
                      className="w-full py-3 pl-11 pr-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </EditField>

                  <EditField icon={FiPhone} label="Phone Number">
                    <input
                      type="tel"
                      value={editForm.phone}
                      onChange={(event) =>
                        setEditForm((current) => ({ ...current, phone: event.target.value }))
                      }
                      className="w-full py-3 pl-11 pr-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </EditField>

                  <EditField icon={FiBriefcase} label="Department">
                    <select
                      value={editForm.department}
                      onChange={(event) =>
                        setEditForm((current) => ({
                          ...current,
                          department: event.target.value,
                        }))
                      }
                      className="w-full py-3 pl-11 pr-4 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    >
                      <option value="">Select Department</option>
                      <option value="Human Resources">Human Resources</option>
                      <option value="Engineering">Engineering</option>
                      <option value="Marketing">Marketing</option>
                      <option value="Finance">Finance</option>
                      <option value="Operations">Operations</option>
                      <option value="Sales">Sales</option>
                      <option value="IT">IT</option>
                      <option value="Customer Support">Customer Support</option>
                      {![
                        "",
                        "Human Resources",
                        "Engineering",
                        "Marketing",
                        "Finance",
                        "Operations",
                        "Sales",
                        "IT",
                        "Customer Support",
                      ].includes(editForm.department) && (
                        <option value={editForm.department}>{editForm.department}</option>
                      )}
                    </select>
                  </EditField>

                  <div className="md:col-span-2">
                    <EditField icon={FiFileText} label="Role / Position">
                      <input
                        value={editForm.role}
                        onChange={(event) =>
                          setEditForm((current) => ({ ...current, role: event.target.value }))
                        }
                        className="w-full py-3 pl-11 pr-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </EditField>
                  </div>

                  <div className="flex items-center justify-between p-4 border border-gray-200 md:col-span-2 rounded-xl">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Employee Status</p>
                      <p className="text-xs text-gray-500">
                        {editForm.status === "active"
                          ? "Employee is currently active"
                          : "Employee is currently inactive"}
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={editForm.status === "active"}
                      aria-label="Toggle employee status"
                      onClick={() =>
                        setEditForm((current) => ({
                          ...current,
                          status: current.status === "active" ? "inactive" : "active",
                        }))
                      }
                      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
                        editForm.status === "active" ? "bg-emerald-500" : "bg-gray-300"
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`pointer-events-none absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ${
                          editForm.status === "active" ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </div>

                <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50">
                  <button
                    type="button"
                    onClick={closeEditModal}
                    disabled={savingEdit}
                    className="px-5 py-2.5 font-semibold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-100 disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingEdit}
                    className="px-6 py-2.5 font-semibold text-white rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] disabled:opacity-60"
                  >
                    {savingEdit ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ================= HELPER COMPONENTS ================= */

function StatCard({ label, value, icon: Icon, gradient, active, onClick }: StatCardProps) {
  return (
    <div
      onClick={onClick}
      className={`p-4 rounded-xl text-white bg-gradient-to-br ${gradient} cursor-pointer transition-all duration-300 hover:shadow-lg ${
        active ? "ring-2 ring-purple-400 ring-offset-2" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium opacity-90">{label}</p>
          <p className="mt-1 text-2xl font-bold">{value}</p>
        </div>
        <Icon className="w-8 h-8 opacity-80" />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: EmployeeStatus }) {
  const isActive = status === "active";
  const isPending = status === "pending";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
        isActive
          ? "bg-emerald-100 text-emerald-700"
          : isPending
            ? "bg-amber-100 text-amber-700"
            : "bg-red-100 text-red-700"
      }`}
    >
      {isActive ? <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" /> : <FiClock className="w-3 h-3" />}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function EditField({
  icon: Icon,
  label,
  required,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block mb-2 text-sm font-semibold text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      <span className="relative block">
        <Icon className="absolute z-10 w-5 h-5 text-gray-400 left-3.5 top-3.5" />
        {children}
      </span>
    </label>
  );
}
