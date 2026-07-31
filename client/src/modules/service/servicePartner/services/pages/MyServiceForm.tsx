import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FiBriefcase } from "react-icons/fi";
import Swal from "sweetalert2";
import { routes } from "../../../../../routes";
import { servicesApi } from "../../api/servicesApi";
import { useMyServices } from "../../store/useMyServices";
import type { MyService, ServiceStatus } from "../../types";

type FormState = Omit<MyService, "serviceId">;

const emptyForm: FormState = {
  name: "",
  description: "",
  price: 0,
  discount: 0,
  duration: "",
  homeVisit: false,
  status: "active",
};

const inputCls =
  "w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl font-semibold text-gray-700 outline-none focus:border-[#852BAF] focus:ring-2 focus:ring-purple-100 transition-all";

export default function MyServiceForm() {
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;
  const navigate = useNavigate();
  const { createService, updateService } = useMyServices();

  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEditing);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const res = await servicesApi.getById(id);
      if (res.data.success && res.data.data) {
        const { serviceId: _serviceId, ...rest } = res.data.data;
        setForm(rest);
      }
      setFetching(false);
    })();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.name.trim() || !form.duration.trim() || form.price <= 0) {
      setError("Service name, duration, and a valid price are required.");
      return;
    }

    try {
      setLoading(true);
      if (isEditing && id) {
        await updateService(id, form);
      } else {
        await createService(form);
      }
      await Swal.fire({
        title: isEditing ? "Updated!" : "Added!",
        text: `Service ${isEditing ? "updated" : "added"} successfully.`,
        icon: "success",
        timer: 1400,
        showConfirmButton: false,
      });
      navigate(routes.servicePartner.services.list);
    } catch {
      await Swal.fire({ title: "Failed", text: "Something went wrong while saving.", icon: "error" });
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-[3px] border-transparent border-t-[#852BAF] border-r-[#FC3F78] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-2">
      <div className="max-w-3xl mx-auto">
        <div className="mb-10">
          <h1 className="flex items-center gap-4 text-3xl font-black tracking-tight text-gray-900">
            <div className="p-3 bg-white shadow-sm rounded-2xl text-[#852BAF]">
              <FiBriefcase />
            </div>
            {isEditing ? "Edit Service" : "Add Service"}
          </h1>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[2rem] border border-gray-100 p-8 space-y-6"
        >
          {error && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 font-semibold text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-gray-400 block mb-2">Service Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={inputCls}
              placeholder="e.g. Basic Eye Checkup"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-400 block mb-2">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className={`${inputCls} min-h-24 resize-none`}
              placeholder="Briefly describe this service"
            />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="text-xs font-bold text-gray-400 block mb-2">Price (₹)</label>
              <input
                type="number"
                min={0}
                value={form.price || ""}
                onChange={(e) => setForm({ ...form, price: Number(e.target.value) || 0 })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 block mb-2">Discount (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={form.discount || ""}
                onChange={(e) => setForm({ ...form, discount: Number(e.target.value) || 0 })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 block mb-2">Duration</label>
              <input
                value={form.duration}
                onChange={(e) => setForm({ ...form, duration: e.target.value })}
                className={inputCls}
                placeholder="e.g. 30 mins"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 block mb-2">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as ServiceStatus })}
                className={`${inputCls} cursor-pointer`}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          <label className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={form.homeVisit}
              onChange={(e) => setForm({ ...form, homeVisit: e.target.checked })}
              className="accent-[#852BAF] w-4 h-4"
            />
            <span className="text-sm font-semibold text-gray-700">Home visit available</span>
          </label>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-4 font-black text-white bg-gradient-to-r from-[#852BAF] to-[#FC3F78] rounded-2xl shadow-lg shadow-purple-200 hover:opacity-90 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Saving…" : isEditing ? "Save Changes" : "Add Service"}
            </button>
            <button
              type="button"
              onClick={() => navigate(routes.servicePartner.services.list)}
              className="px-8 py-4 font-bold text-gray-500 bg-white border border-gray-100 rounded-2xl hover:bg-gray-50 transition-all cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
