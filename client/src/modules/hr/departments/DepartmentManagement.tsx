import { useCallback, useEffect, useState } from "react";
import { FiCheck, FiEdit2, FiSearch, FiTrash2, FiX } from "react-icons/fi";
import { toast } from "sonner";
import { hrApi } from "../../../common/api/hrApi";
import { Card, EmptyState, LoadingRow, PageHeader } from "../components/ui";
import { button, field, iconButton } from "../components/styles";

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
      toast.success(`Added ${name}`);
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
      toast.success(`Deleted ${department.name}`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const filtered = departments.filter((department) =>
    department.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Departments"
        description="These show up as options when you add or edit an employee, and let you reward a whole team at once."
      />

      <Card>
        <form onSubmit={addDepartment} className="flex flex-col gap-2 border-b border-slate-200 p-4 sm:flex-row">
          <label htmlFor="new-department" className="sr-only">New department name</label>
          <input
            id="new-department"
            value={newName}
            maxLength={NAME_MAX}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="New department, e.g. Customer Success"
            className={field}
          />
          <button type="submit" disabled={saving || !newName.trim()} className={`${button.primary} shrink-0`}>
            Add department
          </button>
        </form>

        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <p className="text-sm text-slate-500">
            {departments.length} {departments.length === 1 ? "department" : "departments"}
          </p>
          {departments.length > 6 && (
            <div className="relative w-56">
              <FiSearch className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter" aria-label="Filter departments" className={`${field} py-1.5 pl-8`} />
            </div>
          )}
        </div>

        {loading ? (
          <LoadingRow text="Loading departments…" />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={departments.length ? "No departments match" : "No departments yet"}
            hint={departments.length ? "Try a different name." : "Add your first one above. You can rename it later."}
          />
        ) : (
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {filtered.map((department) => (
              <li key={department.name} className="flex min-h-14 items-center gap-3 px-4 py-2.5">
                {editing === department.name ? (
                  <>
                    <input
                      autoFocus
                      value={editName}
                      maxLength={NAME_MAX}
                      aria-label={`New name for ${department.name}`}
                      onChange={(event) => setEditName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void saveRename(department);
                        if (event.key === "Escape") setEditing(null);
                      }}
                      className={`${field} py-1.5`}
                    />
                    <button type="button" disabled={saving} onClick={() => void saveRename(department)} className={iconButton} aria-label="Save">
                      <FiCheck className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => setEditing(null)} className={iconButton} aria-label="Cancel">
                      <FiX className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <p className="min-w-0 flex-1 truncate text-sm text-slate-900">{department.name}</p>
                    <span className="text-sm tabular-nums text-slate-500">
                      {department.employee_count} {department.employee_count === 1 ? "person" : "people"}
                    </span>
                    <div className="flex">
                      <button type="button" onClick={() => startEdit(department)} className={iconButton} aria-label={`Rename ${department.name}`} title="Rename">
                        <FiEdit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeDepartment(department)}
                        disabled={department.employee_count > 0}
                        title={department.employee_count > 0 ? "Move its employees to another department first" : "Delete"}
                        className={`${iconButton} hover:text-red-600`}
                        aria-label={`Delete ${department.name}`}
                      >
                        <FiTrash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
