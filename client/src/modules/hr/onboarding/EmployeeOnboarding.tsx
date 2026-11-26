import { useEffect, useState, type DragEvent, type FormEvent } from "react";
import { Link } from "react-router-dom";
import Swal from "sweetalert2";
import { FiFile, FiUpload, FiX } from "react-icons/fi";
import { hrApi } from "../../../common/api/hrApi";
import { Card, PageHeader } from "../components/ui";
import { button, field, label } from "../components/styles";

/* ================= TYPES ================= */

interface EmployeeForm {
  fullName: string;
  email: string;
  phone: string;
  role: string;
  department: string;
}

type TabType = "form" | "bulk";

/* ================= INITIAL ================= */

const initialForm: EmployeeForm = {
  fullName: "",
  email: "",
  phone: "",
  role: "",
  department: "",
};

/* ================= COMPONENT ================= */

export default function EmployeeOnboarding() {
  const [activeTab, setActiveTab] = useState<TabType>("form");
  const [formData, setFormData] = useState<EmployeeForm>(initialForm);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [departments, setDepartments] = useState<string[]>([]);
  const [departmentsLoading, setDepartmentsLoading] = useState(true);

  useEffect(() => {
    hrApi
      .get("/employees/departments")
      .then((response) =>
        setDepartments((response.data?.data || []).map((item: { name: string }) => item.name)),
      )
      .catch((error) => console.error("Unable to load departments:", error))
      .finally(() => setDepartmentsLoading(false));
  }, []);

  /* ================= HANDLERS ================= */

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!formData.fullName || !formData.email) {
      Swal.fire("Error", "Name & Email required", "error");
      return;
    }

    setIsSubmitting(true);

    try {
      await hrApi.post("/employees", formData);
      await Swal.fire({
        title: "Employee added",
        text: `${formData.fullName} can now activate their account in the Reward Planners app.`,
        icon: "success",
        confirmButtonColor: "#852BAF",
      });
      setFormData(initialForm);
    } catch (error: any) {
      await Swal.fire(
        "Unable to add employee",
        error.response?.data?.message || "Please check that the local server is running.",
        "error",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCSVUpload = async () => {
    if (!csvFile) {
      Swal.fire("Error", "Please upload CSV file", "error");
      return;
    }

    setIsSubmitting(true);

    try {
      const uploadData = new FormData();
      uploadData.append("file", csvFile);
      const response = await hrApi.post("/employees/bulk-upload", uploadData);
      await Swal.fire({
        title: "Upload complete",
        text: response.data?.message || `Successfully uploaded ${csvFile.name}`,
        icon: "success",
        confirmButtonColor: "#852BAF",
      });
      setCsvFile(null);
    } catch (error: any) {
      await Swal.fire(
        "Unable to upload CSV",
        error.response?.data?.message || "Please check the CSV and try again.",
        "error",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) setCsvFile(file);
  };

  /* ================= UI ================= */

  const tabClass = (tab: TabType) =>
    `rounded-md px-3 py-1.5 text-sm transition-colors cursor-pointer ${
      activeTab === tab ? "bg-white font-medium text-[#6E2391] shadow-sm" : "text-slate-500 hover:text-slate-800"
    }`;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Add employees"
        description="Add one person at a time, or upload a spreadsheet for a whole team. They'll be able to activate the Reward Planners app with the email or phone you enter."
        backTo={{ to: "/hr/employees", label: "Employees" }}
      />

      <div className="mb-4 inline-flex rounded-lg bg-purple-50 p-1" role="tablist">
        <button type="button" role="tab" aria-selected={activeTab === "form"} onClick={() => setActiveTab("form")} className={tabClass("form")}>
          One employee
        </button>
        <button type="button" role="tab" aria-selected={activeTab === "bulk"} onClick={() => setActiveTab("bulk")} className={tabClass("bulk")}>
          Upload a file
        </button>
      </div>

      {/* ================= FORM ================= */}
      {activeTab === "form" && (
        <Card>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 gap-5 p-5 sm:grid-cols-2 sm:p-6">
              <div>
                <label htmlFor="fullName" className={label}>Full name</label>
                <input id="fullName" name="fullName" value={formData.fullName} onChange={handleChange} required autoComplete="off" className={field} />
              </div>

              <div>
                <label htmlFor="email" className={label}>Work email</label>
                <input id="email" name="email" type="email" placeholder="name@company.com" value={formData.email} onChange={handleChange} required className={field} />
              </div>

              <div>
                <label htmlFor="phone" className={label}>
                  Phone <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <input id="phone" name="phone" type="tel" placeholder="+91 98765 43210" value={formData.phone} onChange={handleChange} className={field} />
              </div>

              <div>
                <label htmlFor="department" className={label}>Department</label>
                <select id="department" name="department" value={formData.department} onChange={handleChange} className={`${field} cursor-pointer`}>
                  <option value="">{departmentsLoading ? "Loading…" : "No department"}</option>
                  {departments.map((department) => (
                    <option key={department} value={department}>{department}</option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-slate-500">
                  Missing one? <Link to="/hr/departments" className="text-[#852BAF] hover:underline">Add a department</Link>
                </p>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="role" className={label}>
                  Job title <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <input id="role" name="role" placeholder="e.g. Account Manager" value={formData.role} onChange={handleChange} className={field} />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3 sm:px-6">
              <button type="button" onClick={() => setFormData(initialForm)} disabled={isSubmitting} className={button.ghost}>
                Clear
              </button>
              <button type="submit" disabled={isSubmitting} className={button.primary}>
                {isSubmitting ? "Adding…" : "Add employee"}
              </button>
            </div>
          </form>
        </Card>
      )}

      {/* ================= CSV UPLOAD ================= */}
      {activeTab === "bulk" && (
        <Card>
          <div className="space-y-5 p-5 sm:p-6">
            {csvFile ? (
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <FiFile className="h-5 w-5 shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{csvFile.name}</p>
                  <p className="text-xs text-slate-500">{(csvFile.size / 1024).toFixed(1)} KB</p>
                </div>
                <button type="button" onClick={() => setCsvFile(null)} aria-label="Remove file" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 cursor-pointer">
                  <FiX className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label
                htmlFor="csv-upload"
                onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                className={`flex cursor-pointer flex-col items-center rounded-lg border border-dashed px-6 py-10 text-center transition-colors ${
                  dragging ? "border-[#852BAF] bg-purple-50/40" : "border-slate-300 hover:border-slate-400 hover:bg-slate-50"
                }`}
              >
                <FiUpload className="mb-3 h-5 w-5 text-slate-400" />
                <span className="text-sm font-medium text-slate-800">Drop your CSV here, or click to choose a file</span>
                <span className="mt-1 text-xs text-slate-500">One row per employee</span>
              </label>
            )}
            <input type="file" accept=".csv" onChange={(e) => setCsvFile(e.target.files?.[0] || null)} className="hidden" id="csv-upload" />

            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">Columns, in this order</p>
              <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs leading-relaxed text-slate-700">
{`fullName,email,phone,department,role
Priya Nair,priya@company.com,+91 98765 43210,Finance,Analyst`}
              </pre>
            </div>
          </div>

          <div className="flex justify-end border-t border-slate-200 px-5 py-3 sm:px-6">
            <button type="button" onClick={() => void handleCSVUpload()} disabled={isSubmitting || !csvFile} className={button.primary}>
              {isSubmitting ? "Uploading…" : "Upload employees"}
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}
