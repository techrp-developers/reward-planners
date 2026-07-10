import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiPlus } from "react-icons/fi";
import {
  FaBuilding,
  FaAddressBook,
  FaUniversity,
  FaFileUpload,
  FaUserCircle,
} from "react-icons/fa";
import Swal from "sweetalert2";
import { routes } from "../../../../../routes";
import { serviceCategories, getSubCategories } from "../../../serviceManager/shared/serviceCategories";
import { useMyProfile } from "../../store/useMyProfile";
import { useMyDocuments } from "../../store/useMyDocuments";
import { validateOnboarding, hasOnboardingErrors, type OnboardingFormErrors } from "../../validation/onboardingValidation";
import type { PartnerProfile, PartnerStatus } from "../../types";

const inputBaseCls =
  "px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl font-semibold text-gray-700 outline-none focus:border-[#852BAF] focus:ring-2 focus:ring-purple-100 transition-all";
const inputCls = `w-full ${inputBaseCls}`;

export default function ServicePartnerOnboarding() {
  const navigate = useNavigate();
  const { profile, loading, updateProfile } = useMyProfile();
  const { documents, uploadDocument } = useMyDocuments();

  const [form, setForm] = useState<PartnerProfile | null>(null);
  const [errors, setErrors] = useState<OnboardingFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setForm(profile);
      setImagePreview(profile.profileImage);
    }
  }, [profile]);

  if (loading || !form) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-[3px] border-transparent border-t-[#852BAF] border-r-[#FC3F78] rounded-full animate-spin" />
      </div>
    );
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImagePreview(url);
    setForm((prev) => (prev ? { ...prev, profileImage: url } : prev));
  };

  const handleDocumentUpload = async (key: Parameters<typeof uploadDocument>[0], file: File) => {
    await uploadDocument(key, file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;

    const validation = validateOnboarding(form);
    setErrors(validation);
    if (hasOnboardingErrors(validation)) {
      await Swal.fire({
        title: "Check the form",
        text: "Please fix the highlighted fields before saving.",
        icon: "warning",
        confirmButtonText: "OK",
      });
      return;
    }

    try {
      setSaving(true);
      await updateProfile(form);
      await Swal.fire({
        title: "Saved!",
        text: "Your profile has been updated successfully.",
        icon: "success",
        timer: 1400,
        showConfirmButton: false,
      });
      navigate(routes.servicePartner.profile);
    } catch {
      await Swal.fire({ title: "Failed", text: "Something went wrong while saving.", icon: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen p-2">
      <div className="max-w-4xl mx-auto">
        <div className="mb-10">
          <h1 className="flex items-center gap-4 text-3xl font-black tracking-tight text-gray-900">
            <div className="p-3 bg-white shadow-sm rounded-2xl text-[#852BAF]">
              <FaBuilding />
            </div>
            Service Partner Onboarding
          </h1>
          <p className="mt-2 ml-16 font-medium text-gray-400">
            Keep your business details, documents and bank information up to date
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[2rem] border border-gray-100 p-8 space-y-8"
        >
          {/* PROFILE IMAGE */}
          <div className="flex items-center gap-6">
            <label className="relative w-24 h-24 rounded-2xl overflow-hidden border-2 border-dashed border-gray-200 flex items-center justify-center bg-gray-50 cursor-pointer hover:border-[#852BAF] transition-all shrink-0">
              {imagePreview ? (
                <img src={imagePreview} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <FaUserCircle className="text-gray-300" size={40} />
              )}
              <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
            </label>
            <div>
              <p className="text-sm font-bold text-gray-700">Profile Image</p>
              <p className="text-xs text-gray-400">PNG, JPG up to 5MB</p>
            </div>
          </div>

          {/* BUSINESS INFO */}
          <div>
            <h2 className="flex items-center gap-2 text-sm font-black text-gray-700 uppercase tracking-wider mb-4">
              <FaBuilding className="text-[#852BAF]" size={13} /> Business Information
            </h2>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="text-xs font-bold text-gray-400 block mb-2">Business Name</label>
                <input
                  value={form.businessName}
                  onChange={(e) => setForm({ ...form, businessName: e.target.value })}
                  className={inputCls}
                />
                {errors.businessName && <p className="text-xs text-red-500 mt-1.5">{errors.businessName}</p>}
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 block mb-2">Owner Name</label>
                <input
                  value={form.ownerName}
                  onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
                  className={inputCls}
                />
                {errors.ownerName && <p className="text-xs text-red-500 mt-1.5">{errors.ownerName}</p>}
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
                <label className="text-xs font-bold text-gray-400 block mb-2">Sub Category</label>
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
                <label className="text-xs font-bold text-gray-400 block mb-2">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as PartnerStatus })}
                  className={`${inputCls} cursor-pointer`}
                >
                  <option value="pending">Pending</option>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 block mb-2">GST</label>
                <input
                  value={form.gst}
                  onChange={(e) => setForm({ ...form, gst: e.target.value.toUpperCase() })}
                  className={inputCls}
                  placeholder="15-character GSTIN"
                />
                {errors.gst && <p className="text-xs text-red-500 mt-1.5">{errors.gst}</p>}
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 block mb-2">PAN</label>
                <input
                  value={form.pan}
                  onChange={(e) => setForm({ ...form, pan: e.target.value.toUpperCase() })}
                  className={inputCls}
                  placeholder="10-character PAN"
                />
                {errors.pan && <p className="text-xs text-red-500 mt-1.5">{errors.pan}</p>}
              </div>
            </div>
          </div>

          {/* CONTACT & ADDRESS */}
          <div className="pt-4 border-t border-gray-50">
            <h2 className="flex items-center gap-2 text-sm font-black text-gray-700 uppercase tracking-wider mb-4">
              <FaAddressBook className="text-[#852BAF]" size={13} /> Contact &amp; Address
            </h2>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="text-xs font-bold text-gray-400 block mb-2">Phone</label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className={inputCls}
                />
                {errors.phone && <p className="text-xs text-red-500 mt-1.5">{errors.phone}</p>}
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 block mb-2">Email</label>
                <input
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className={inputCls}
                />
                {errors.email && <p className="text-xs text-red-500 mt-1.5">{errors.email}</p>}
              </div>
              <div className="col-span-2">
                <label className="text-xs font-bold text-gray-400 block mb-2">Address</label>
                <input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className={inputCls}
                />
                {errors.address && <p className="text-xs text-red-500 mt-1.5">{errors.address}</p>}
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 block mb-2">City</label>
                <input
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  className={inputCls}
                />
                {errors.city && <p className="text-xs text-red-500 mt-1.5">{errors.city}</p>}
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 block mb-2">State</label>
                <input
                  value={form.state}
                  onChange={(e) => setForm({ ...form, state: e.target.value })}
                  className={inputCls}
                />
                {errors.state && <p className="text-xs text-red-500 mt-1.5">{errors.state}</p>}
              </div>
            </div>
          </div>

          {/* BANK DETAILS */}
          <div className="pt-4 border-t border-gray-50">
            <h2 className="flex items-center gap-2 text-sm font-black text-gray-700 uppercase tracking-wider mb-4">
              <FaUniversity className="text-[#852BAF]" size={13} /> Bank Details
            </h2>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="text-xs font-bold text-gray-400 block mb-2">Account Holder</label>
                <input
                  value={form.bank.accountHolder}
                  onChange={(e) => setForm({ ...form, bank: { ...form.bank, accountHolder: e.target.value } })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 block mb-2">Bank Name</label>
                <input
                  value={form.bank.bankName}
                  onChange={(e) => setForm({ ...form, bank: { ...form.bank, bankName: e.target.value } })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 block mb-2">Account Number</label>
                <input
                  value={form.bank.accountNumber}
                  onChange={(e) => setForm({ ...form, bank: { ...form.bank, accountNumber: e.target.value } })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 block mb-2">IFSC Code</label>
                <input
                  value={form.bank.ifscCode}
                  onChange={(e) => setForm({ ...form, bank: { ...form.bank, ifscCode: e.target.value.toUpperCase() } })}
                  className={inputCls}
                />
              </div>
            </div>
          </div>

          {/* DOCUMENTS */}
          <div className="pt-4 border-t border-gray-50">
            <h2 className="flex items-center gap-2 text-sm font-black text-gray-700 uppercase tracking-wider mb-4">
              <FaFileUpload className="text-[#852BAF]" size={13} /> Documents
            </h2>
            <div className="grid grid-cols-2 gap-4">
              {documents.map((doc) => (
                <label
                  key={doc.key}
                  className="flex items-center justify-between gap-3 px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl cursor-pointer hover:border-[#852BAF] transition-all"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-700 truncate">{doc.label}</p>
                    <p className="text-xs text-gray-400 truncate">{doc.fileName ?? "Not uploaded"}</p>
                  </div>
                  <span className="flex items-center gap-1.5 text-xs font-bold text-[#852BAF] shrink-0">
                    <FiPlus size={13} /> Upload
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleDocumentUpload(doc.key, file);
                    }}
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-4 font-black text-white bg-gradient-to-r from-[#852BAF] to-[#FC3F78] rounded-2xl shadow-lg shadow-purple-200 hover:opacity-90 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : "Save Profile"}
            </button>
            <button
              type="button"
              onClick={() => navigate(routes.servicePartner.profile)}
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
