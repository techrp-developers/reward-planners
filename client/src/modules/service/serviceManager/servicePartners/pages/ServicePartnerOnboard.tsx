import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FiPlus, FiTrash2, FiUserPlus } from "react-icons/fi";
import Swal from "sweetalert2";
import { useServicePartnerRoutes } from "../../shared/useModuleRoutes";
import { serviceCategories, getSubCategories } from "../../shared/serviceCategories";
import { usePartnerManagers } from "../../partnerManagers/store/usePartnerManagers";
import { servicePartnersApi } from "../api/servicePartnersApi";
import { useServicePartners } from "../store/useServicePartners";
import {
  validateServicePartner,
  hasServicePartnerErrors,
  type ServicePartnerFormErrors,
} from "../validation/servicePartnerValidation";
import type { ServicePartnerInput, ServicePartnerStatus } from "../types";

const emptyForm: ServicePartnerInput = {
  partnerName: "",
  category: "",
  subCategory: "",
  managedBy: "",
  city: "",
  contact: { phone: "", email: "", address: "" },
  services: [{ label: "", rate: 0 }],
  status: "pending",
  rating: 0,
};

const inputBaseCls =
  "px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl font-semibold text-gray-700 outline-none focus:border-[#852BAF] focus:ring-2 focus:ring-purple-100 transition-all";
const inputCls = `w-full ${inputBaseCls}`;

export default function ServicePartnerOnboard() {
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;
  const navigate = useNavigate();
  const servicePartnerRoutes = useServicePartnerRoutes();
  const { managers } = usePartnerManagers();
  const { createPartner, updatePartner } = useServicePartners();

  const [form, setForm] = useState<ServicePartnerInput>(emptyForm);
  const [errors, setErrors] = useState<ServicePartnerFormErrors>({});
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEditing);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const res = await servicePartnersApi.getById(id);
      if (res.data.success && res.data.data) {
        const { partnerId: _partnerId, partnerCode: _partnerCode, onboardedOn: _onboardedOn, ...rest } = res.data.data;
        setForm(rest);
      }
      setFetching(false);
    })();
  }, [id]);

  const handleServiceChange = (index: number, field: "label" | "rate", value: string) => {
    setForm((prev) => ({
      ...prev,
      services: prev.services.map((s, i) =>
        i === index ? { ...s, [field]: field === "rate" ? Number(value) || 0 : value } : s,
      ),
    }));
  };

  const addServiceRow = () =>
    setForm((prev) => ({ ...prev, services: [...prev.services, { label: "", rate: 0 }] }));

  const removeServiceRow = (index: number) =>
    setForm((prev) => ({ ...prev, services: prev.services.filter((_, i) => i !== index) }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateServicePartner(form);
    setErrors(validation);
    if (hasServicePartnerErrors(validation)) {
      await Swal.fire({
        title: "Check the form",
        text: "Please fix the highlighted fields before saving.",
        icon: "warning",
        confirmButtonText: "OK",
      });
      return;
    }

    try {
      setLoading(true);
      if (isEditing && id) {
        await updatePartner(id, form);
      } else {
        await createPartner(form);
      }
      await Swal.fire({
        title: isEditing ? "Updated!" : "Onboarded!",
        text: `Service partner ${isEditing ? "updated" : "onboarded"} successfully.`,
        icon: "success",
        timer: 1400,
        showConfirmButton: false,
      });
      navigate(servicePartnerRoutes.list);
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
    <div className="min-h-screen p-8 bg-[#FAFAFE]">
      <div className="max-w-4xl mx-auto">
        <div className="mb-10">
          <h1 className="flex items-center gap-4 text-3xl font-black tracking-tight text-gray-900">
            <div className="p-3 bg-white shadow-sm rounded-2xl text-[#852BAF]">
              <FiUserPlus />
            </div>
            {isEditing ? "Edit Service Partner" : "Onboard Service Partner"}
          </h1>
          <p className="mt-2 ml-16 font-medium text-gray-400">
            Add or update a service partner and their rate card
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[2rem] border border-gray-100 p-8 space-y-6"
        >
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="text-xs font-bold text-gray-400 block mb-2">Partner Name</label>
              <input
                value={form.partnerName}
                onChange={(e) => setForm({ ...form, partnerName: e.target.value })}
                className={inputCls}
                placeholder="e.g. Sharma Eye Care Centre"
              />
              {errors.partnerName && <p className="text-xs text-red-500 mt-1.5">{errors.partnerName}</p>}
            </div>

            <div>
              <label className="text-xs font-bold text-gray-400 block mb-2">City</label>
              <input
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                className={inputCls}
                placeholder="e.g. Mumbai"
              />
              {errors.city && <p className="text-xs text-red-500 mt-1.5">{errors.city}</p>}
            </div>

            <div>
              <label className="text-xs font-bold text-gray-400 block mb-2">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value, subCategory: "" })}
                className={`${inputCls} cursor-pointer`}
              >
                <option value="">Select category</option>
                {serviceCategories.map((c) => (
                  <option key={c.slug} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
              {errors.category && <p className="text-xs text-red-500 mt-1.5">{errors.category}</p>}
            </div>

            <div>
              <label className="text-xs font-bold text-gray-400 block mb-2">Sub-Category</label>
              <select
                value={form.subCategory}
                onChange={(e) => setForm({ ...form, subCategory: e.target.value })}
                disabled={!form.category}
                className={`${inputCls} cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <option value="">Select sub-category</option>
                {getSubCategories(form.category).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              {errors.subCategory && <p className="text-xs text-red-500 mt-1.5">{errors.subCategory}</p>}
            </div>

            <div>
              <label className="text-xs font-bold text-gray-400 block mb-2">Managed By</label>
              <select
                value={form.managedBy}
                onChange={(e) => setForm({ ...form, managedBy: e.target.value })}
                className={`${inputCls} cursor-pointer`}
              >
                <option value="">Select partner manager</option>
                {managers.map((m) => (
                  <option key={m.managerId} value={m.managerId}>
                    {m.name} ({m.region})
                  </option>
                ))}
              </select>
              {errors.managedBy && <p className="text-xs text-red-500 mt-1.5">{errors.managedBy}</p>}
            </div>

            <div>
              <label className="text-xs font-bold text-gray-400 block mb-2">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as ServicePartnerStatus })}
                className={`${inputCls} cursor-pointer`}
              >
                <option value="pending">Pending</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-50">
            <h2 className="text-sm font-black text-gray-700 uppercase tracking-wider mb-4">Contact</h2>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="text-xs font-bold text-gray-400 block mb-2">Phone</label>
                <input
                  value={form.contact.phone}
                  onChange={(e) => setForm({ ...form, contact: { ...form.contact, phone: e.target.value } })}
                  className={inputCls}
                  placeholder="+91 90000 00000"
                />
                {errors.phone && <p className="text-xs text-red-500 mt-1.5">{errors.phone}</p>}
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 block mb-2">Email</label>
                <input
                  value={form.contact.email}
                  onChange={(e) => setForm({ ...form, contact: { ...form.contact, email: e.target.value } })}
                  className={inputCls}
                  placeholder="contact@partner.in"
                />
                {errors.email && <p className="text-xs text-red-500 mt-1.5">{errors.email}</p>}
              </div>
              <div className="col-span-2">
                <label className="text-xs font-bold text-gray-400 block mb-2">Address</label>
                <input
                  value={form.contact.address}
                  onChange={(e) => setForm({ ...form, contact: { ...form.contact, address: e.target.value } })}
                  className={inputCls}
                  placeholder="Street, Area, City"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-50">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-black text-gray-700 uppercase tracking-wider">Rate Card</h2>
              <button
                type="button"
                onClick={addServiceRow}
                className="flex items-center gap-1.5 text-xs font-bold text-[#852BAF] hover:opacity-80 cursor-pointer"
              >
                <FiPlus size={14} /> Add Service
              </button>
            </div>

            <div className="space-y-3">
              {form.services.map((service, index) => (
                <div key={index} className="flex items-center gap-3">
                  <input
                    value={service.label}
                    onChange={(e) => handleServiceChange(index, "label", e.target.value)}
                    className={`${inputBaseCls} flex-1`}
                    placeholder="Service label (e.g. Basic Eye Checkup)"
                  />
                  <input
                    type="number"
                    min={0}
                    value={service.rate || ""}
                    onChange={(e) => handleServiceChange(index, "rate", e.target.value)}
                    className={`${inputBaseCls} w-36`}
                    placeholder="Rate (₹)"
                  />
                  <button
                    type="button"
                    onClick={() => removeServiceRow(index)}
                    disabled={form.services.length === 1}
                    className="p-3 text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <FiTrash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
            {errors.services && <p className="text-xs text-red-500 mt-2">{errors.services}</p>}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 font-black text-white bg-gradient-to-r from-[#852BAF] to-[#FC3F78] rounded-2xl shadow-lg shadow-purple-200 hover:opacity-90 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Saving…" : isEditing ? "Save Changes" : "Onboard Partner"}
          </button>
        </form>
      </div>
    </div>
  );
}
