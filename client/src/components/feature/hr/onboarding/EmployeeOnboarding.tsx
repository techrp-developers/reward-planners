import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import Swal from "sweetalert2";
import {
  FiUser,
  FiMail,
  FiPhone,
  FiBriefcase,
  FiUpload,
  FiCheck,
  FiArrowLeft,
  FiFileText,
} from "react-icons/fi";

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
  const [isSubmitting, setIsSubmitting] = useState(false);

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

    // Simulate API call
    setTimeout(() => {
      Swal.fire({
        title: "Success!",
        text: "Employee has been onboarded successfully!",
        icon: "success",
        confirmButtonColor: "#852BAF",
      });
      setFormData(initialForm);
      setIsSubmitting(false);
    }, 1000);
  };

  const handleCSVUpload = async () => {
    if (!csvFile) {
      Swal.fire("Error", "Please upload CSV file", "error");
      return;
    }

    setIsSubmitting(true);

    // Simulate API call
    setTimeout(() => {
      Swal.fire({
        title: "Success!",
        text: `Successfully uploaded ${csvFile.name}`,
        icon: "success",
        confirmButtonColor: "#852BAF",
      });
      setCsvFile(null);
      setIsSubmitting(false);
    }, 1000);
  };

  /* ================= UI ================= */

  return (
    <div className="max-w-5xl p-4 mx-auto md:p-6">

      {/* HEADER */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link
            to="/hr/dashboard"
            className="inline-flex items-center gap-1 mb-2 text-sm text-gray-500 hover:text-purple-600"
          >
            <FiArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-gray-800 md:text-3xl">
            Employee <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#852BAF] to-[#FC3F78]">Onboarding</span>
          </h1>
          <p className="mt-1 text-gray-500">Add new employees to your organization</p>
        </div>
      </div>

      {/* TAB SWITCH */}
      <div className="flex inline-flex gap-2 p-1 mb-6 bg-gray-100 rounded-xl">
        <button
          onClick={() => setActiveTab("form")}
          className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === "form"
              ? "bg-white text-purple-600 shadow-md"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          <FiUser className="inline w-4 h-4 mr-2" />
          Manual Entry
        </button>

        <button
          onClick={() => setActiveTab("bulk")}
          className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === "bulk"
              ? "bg-white text-purple-600 shadow-md"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          <FiUpload className="inline w-4 h-4 mr-2" />
          Bulk Upload
        </button>
      </div>

      {/* ================= FORM ================= */}
      {activeTab === "form" && (
        <form
          onSubmit={handleSubmit}
          className="p-6 space-y-6 bg-white border border-gray-100 shadow-lg md:p-8 rounded-2xl"
        >
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Full Name */}
            <div>
              <label className="block mb-2 text-sm font-semibold text-gray-700">
                Full Name <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <FiUser className="absolute left-4 top-3.5 text-gray-400 w-5 h-5" />
                <input
                  name="fullName"
                  placeholder="Enter full name"
                  value={formData.fullName}
                  onChange={handleChange}
                  required
                  className="w-full py-3 pl-12 pr-4 transition-all border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block mb-2 text-sm font-semibold text-gray-700">
                Email <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <FiMail className="absolute left-4 top-3.5 text-gray-400 w-5 h-5" />
                <input
                  name="email"
                  type="email"
                  placeholder="Enter email address"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="w-full py-3 pl-12 pr-4 transition-all border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Phone */}
            <div>
              <label className="block mb-2 text-sm font-semibold text-gray-700">
                Phone Number
              </label>
              <div className="relative">
                <FiPhone className="absolute left-4 top-3.5 text-gray-400 w-5 h-5" />
                <input
                  name="phone"
                  type="tel"
                  placeholder="+91 9876543210"
                  value={formData.phone}
                  onChange={handleChange}
                  className="w-full py-3 pl-12 pr-4 transition-all border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Department */}
            <div>
              <label className="block mb-2 text-sm font-semibold text-gray-700">
                Department
              </label>
              <div className="relative">
                <FiBriefcase className="absolute left-4 top-3.5 text-gray-400 w-5 h-5" />
                <select
                  name="department"
                  value={formData.department}
                  onChange={handleChange}
                  className="w-full py-3 pl-12 pr-4 transition-all bg-white border border-gray-200 appearance-none rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent"
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
                </select>
              </div>
            </div>

            {/* Role */}
            <div className="md:col-span-2">
              <label className="block mb-2 text-sm font-semibold text-gray-700">
                Role / Position
              </label>
              <div className="relative">
                <FiFileText className="absolute left-4 top-3.5 text-gray-400 w-5 h-5" />
                <input
                  name="role"
                  placeholder="e.g., Software Engineer, Marketing Manager"
                  value={formData.role}
                  onChange={handleChange}
                  className="w-full py-3 pl-12 pr-4 transition-all border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end pt-4">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-8 py-3 font-semibold text-white transition-all duration-300 shadow-lg rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] hover:from-[#9B3DCF] hover:to-[#FD4F88] shadow-purple-500/30 hover:scale-105 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white rounded-full border-t-transparent animate-spin"></div>
                  Processing...
                </>
              ) : (
                <>
                  <FiCheck className="w-5 h-5" />
                  Add Employee
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* ================= CSV UPLOAD ================= */}
      {activeTab === "bulk" && (
        <div className="p-6 space-y-6 bg-white border border-gray-100 shadow-lg md:p-8 rounded-2xl">

          {/* Upload Area */}
          <div className="p-8 text-center transition-colors border-2 border-gray-300 border-dashed rounded-2xl hover:border-purple-400">
            <div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-[#852BAF] to-[#FC3F78] rounded-full">
              <FiUpload className="w-8 h-8 text-white" />
            </div>
            
            {csvFile ? (
              <div className="flex items-center justify-center gap-2 font-medium text-green-600">
                <FiCheck className="w-5 h-5" />
                {csvFile.name}
              </div>
            ) : (
              <>
                <p className="mb-2 font-medium text-gray-700">
                  Drag & drop your CSV file here
                </p>
                <p className="mb-4 text-sm text-gray-500">
                  or click to browse files
                </p>
              </>
            )}
            
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
              className="hidden"
              id="csv-upload"
            />
            <label
              htmlFor="csv-upload"
              className="inline-block px-5 py-2.5 text-purple-600 font-semibold border border-purple-200 rounded-lg hover:bg-purple-50 cursor-pointer transition-colors"
            >
              Choose File
            </label>
          </div>

          {/* Sample Format */}
          <div className="p-5 bg-gray-50 rounded-xl">
            <h3 className="mb-3 font-semibold text-gray-800">CSV Format Required</h3>
            <div className="p-4 overflow-x-auto font-mono text-sm text-gray-600 bg-white rounded-lg">
              fullName,email,phone,department,role
            </div>
            <p className="mt-3 text-sm text-gray-500">
              Example: John Doe,john@company.com,+91 9876543210,Engineering,Developer
            </p>
          </div>

          {/* Upload Button */}
          <div className="flex justify-end">
            <button
              onClick={handleCSVUpload}
              disabled={isSubmitting || !csvFile}
              className="flex items-center gap-2 px-8 py-3 font-semibold text-white transition-all duration-300 shadow-lg rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 shadow-emerald-500/30 hover:scale-105 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white rounded-full border-t-transparent animate-spin"></div>
                  Uploading...
                </>
              ) : (
                <>
                  <FiUpload className="w-5 h-5" />
                  Upload CSV
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}