import { useCallback, useEffect, useState } from "react";
import { FiBriefcase, FiCheck, FiEdit2, FiPlus, FiSearch, FiTrash2, FiX } from "react-icons/fi";
import { toast } from "sonner";
import { hrApi } from "../../../common/api/hrApi";

interface Department {
  id: number | null;
  name: string;
  employee_count: number;
}

const NAME_MAX = 50;

function errorMessage(error: unknown) {
  const candidate = error as { response?: { data?: { message?: string } } };
  return candidate.response?.data?.message || "Something went wrong. Please try again.";
}

export default function DepartmentManagement() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const loadDepartments = useCallback(async () => {
    try {
      const response = await hrApi.get("/employees/departments");
      setDepartments(response.data?.data || []);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadDepartments(); }, [loadDepartments]);

  const addDepartment = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name) {
      toast.error("Enter a department name.");
      return;
    }
    setSaving(true);
    try {
      await hrApi.post("/employees/departments", { name });
      setNewName("");
      toast.success("Department added");
      await loadDepartments();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (department: Department) => {
    setEditing(department.name);
    setEditName(department.name);
  };

  const saveRename = async (department: Department) => {
    const name = editName.trim();
    if (!name || name === department.name) {
      setEditing(null);
      return;
    }
    if (
      department.employee_count &&
      !window.confirm(`Rename “${department.name}” to “${name}”? ${department.employee_count} employee(s) will be moved to the new name.`)
    ) return;
    setSaving(true);
    try {
      const response = await hrApi.put("/employees/departments", { current_name: department.name, name });
      toast.success(response.data?.message || "Department renamed");
      setEditing(null);
      await loadDepartments();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const removeDepartment = async (department: Department) => {
    if (!window.confirm(`Delete “${department.name}”?`)) return;
    try {
      await hrApi.delete("/employees/departments", { params: { name: department.name } });
      setDepartments((current) => current.filter((item) => item.name !== department.name));
      toast.success("Department deleted");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const filtered = departments.filter((department) =>
    department.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <main className="min-h-screen bg-slate-50/70 p-5 md:p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-7">
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-[#852BAF]">Settings</p>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Departments</h1>
          <p className="mt-2 text-sm text-slate-500">
            Departments added here appear in the dropdown when onboarding or editing employees.
          </p>
        </div>

        <form onSubmit={addDepartment} className="mb-6 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
          <label htmlFor="new-department" className="mb-2 block text-sm font-semibold text-gray-700">
            Add a department
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <FiBriefcase className="absolute left-4 top-3.5 h-5 w-5 text-gray-400" />
              <input
                id="new-department"
                value={newName}
                maxLength={NAME_MAX}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="e.g. Customer Success"
                className="w-full rounded-xl border border-gray-200 py-3 pl-12 pr-4 transition-all focus:border-transparent focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <button
              type="submit"
              disabled={saving || !newName.trim()}
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] px-6 py-3 text-sm font-bold text-white shadow-md transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FiPlus /> Add Department
            </button>
          </div>
        </form>

        <section className="rounded-3xl border border-slate-100 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-bold text-slate-900">
              All departments <span className="font-medium text-slate-400">({departments.length})</span>
            </h2>
            <div className="relative sm:w-64">
              <FiSearch className="absolute left-3 top-3 text-gray-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search departments..."
                className="w-full rounded-xl border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-transparent focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          {loading ? (
            <p className="p-8 text-center text-sm text-slate-400">Loading departments...</p>
          ) : filtered.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-400">
              {departments.length ? "No departments match your search." : "No departments yet. Add your first one above."}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filtered.map((department) => (
                <li key={department.name} className="flex items-center gap-3 px-5 py-4">
                  {editing === department.name ? (
                    <>
                      <input
                        autoFocus
                        value={editName}
                        maxLength={NAME_MAX}
                        onChange={(event) => setEditName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void saveRename(department);
                          if (event.key === "Escape") setEditing(null);
                        }}
                        className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-purple-500"
                      />
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void saveRename(department)}
                        className="cursor-pointer rounded-lg p-2 text-emerald-600 hover:bg-emerald-50"
                        aria-label="Save"
                      >
                        <FiCheck />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(null)}
                        className="cursor-pointer rounded-lg p-2 text-slate-400 hover:bg-slate-100"
                        aria-label="Cancel"
                      >
                        <FiX />
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-800">{department.name}</p>
                        <p className="text-xs text-slate-400">
                          {department.employee_count} employee{department.employee_count === 1 ? "" : "s"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => startEdit(department)}
                        className="cursor-pointer rounded-lg p-2 text-slate-500 hover:bg-purple-50 hover:text-[#852BAF]"
                        aria-label={`Rename ${department.name}`}
                      >
                        <FiEdit2 />
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeDepartment(department)}
                        disabled={department.employee_count > 0}
                        title={department.employee_count > 0 ? "Move its employees before deleting" : "Delete"}
                        className="cursor-pointer rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                        aria-label={`Delete ${department.name}`}
                      >
                        <FiTrash2 />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
