import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FiUserPlus } from "react-icons/fi";
import Swal from "sweetalert2";
import { usePartnerManagerRoutes } from "../../shared/useModuleRoutes";
import { partnerManagersApi } from "../api/partnerManagersApi";
import { usePartnerManagers } from "../store/usePartnerManagers";
import { useServicePartners } from "../../servicePartners/store/useServicePartners";
import type { PartnerManagerInput } from "../types";

const emptyForm: PartnerManagerInput = {
  name: "",
  region: "",
  assignedPartners: [],
};

const inputCls =
  "w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl font-semibold text-gray-700 outline-none focus:border-[#852BAF] focus:ring-2 focus:ring-purple-100 transition-all";

export default function PartnerManagerOnboard() {
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;
  const navigate = useNavigate();
  const partnerManagerRoutes = usePartnerManagerRoutes();
  const { createManager, updateManager } = usePartnerManagers();
  const { partners } = useServicePartners();

  const [form, setForm] = useState<PartnerManagerInput>(emptyForm);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEditing);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const res = await partnerManagersApi.getById(id);
      if (res.data.success && res.data.data) {
        const { managerId: _managerId, ...rest } = res.data.data;
        setForm(rest);
      }
      setFetching(false);
    })();
  }, [id]);

  const togglePartner = (partnerId: string) => {
    setForm((prev) => ({
      ...prev,
      assignedPartners: prev.assignedPartners.includes(partnerId)
        ? prev.assignedPartners.filter((p) => p !== partnerId)
        : [...prev.assignedPartners, partnerId],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.name.trim() || !form.region.trim()) {
      await Swal.fire({
        title: "Missing details",
        text: "Name and region are required.",
        icon: "warning",
        confirmButtonText: "OK",
      });
      return;
    }

    try {
      setLoading(true);
      if (isEditing && id) {
        await updateManager(id, form);
      } else {
        await createManager(form);
      }
      await Swal.fire({
        title: isEditing ? "Updated!" : "Added!",
        text: `Partner manager ${isEditing ? "updated" : "added"} successfully.`,
        icon: "success",
        timer: 1400,
        showConfirmButton: false,
      });
      navigate(partnerManagerRoutes.list);
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
      <div className="max-w-3xl mx-auto">
        <div className="mb-10">
          <h1 className="flex items-center gap-4 text-3xl font-black tracking-tight text-gray-900">
            <div className="p-3 bg-white shadow-sm rounded-2xl text-[#852BAF]">
              <FiUserPlus />
            </div>
            {isEditing ? "Edit Partner Manager" : "Add Partner Manager"}
          </h1>
          <p className="mt-2 ml-16 font-medium text-gray-400">
            Assign a regional manager to oversee service partners
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[2rem] border border-gray-100 p-8 space-y-6"
        >
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="text-xs font-bold text-gray-400 block mb-2">Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputCls}
                placeholder="e.g. Ritu Sharma"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 block mb-2">Region</label>
              <input
                value={form.region}
                onChange={(e) => setForm({ ...form, region: e.target.value })}
                className={inputCls}
                placeholder="e.g. Mumbai"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-gray-50">
            <h2 className="text-sm font-black text-gray-700 uppercase tracking-wider mb-4">Assigned Partners</h2>
            <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
              {partners.map((p) => (
                <label
                  key={p.partnerId}
                  className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-purple-50/40"
                >
                  <input
                    type="checkbox"
                    checked={form.assignedPartners.includes(p.partnerId)}
                    onChange={() => togglePartner(p.partnerId)}
                    className="accent-[#852BAF] w-4 h-4"
                  />
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{p.partnerName}</p>
                    <p className="text-xs text-gray-400">
                      {p.category} · {p.city}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 font-black text-white bg-gradient-to-r from-[#852BAF] to-[#FC3F78] rounded-2xl shadow-lg shadow-purple-200 hover:opacity-90 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Saving…" : isEditing ? "Save Changes" : "Add Manager"}
          </button>
        </form>
      </div>
    </div>
  );
}
