import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import Drawer from "../ui/Drawer";
import { ErrorState } from "../ui/EmptyState";
import { createVendor, type FleaMarketVendor } from "../../api/fleaMarketVendorsApi";

interface VendorQuickCreateDrawerProps {
  open: boolean;
  onClose: () => void;
  onCreated: (vendor: FleaMarketVendor) => void;
}

const inputClass =
  "w-full px-3 py-2 mt-1 text-sm bg-white border border-slate-200 rounded-lg outline-none focus:border-transparent focus:ring-4 focus:ring-[#852BAF]/15";

function VendorQuickCreateDrawer({ open, onClose, onCreated }: VendorQuickCreateDrawerProps) {
  const [companyName, setCompanyName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const mutation = useMutation({
    mutationFn: () => createVendor({ companyName, fullName, email, phone: phone || undefined }),
  });

  const reset = () => {
    setCompanyName("");
    setFullName("");
    setEmail("");
    setPhone("");
    mutation.reset();
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate(undefined, {
      onSuccess: (vendor) => {
        toast.success(`Vendor "${vendor.companyName}" created`);
        onCreated(vendor);
        reset();
        onClose();
      },
    });
  };

  return (
    <Drawer open={open} title="Add New Vendor" onClose={handleClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs font-semibold text-slate-700">Company Name</label>
          <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} required className={inputClass} />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700">Contact Full Name</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} required className={inputClass} />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700">Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={inputClass} />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700">
            Phone <span className="text-gray-400">(optional)</span>
          </label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
        </div>

        {mutation.isError && (
          <ErrorState
            message={
              (mutation.error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
              "Failed to create vendor."
            }
          />
        )}

        <button
          type="submit"
          disabled={mutation.isPending}
          className="w-full py-2.5 text-sm font-bold text-white rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] hover:from-[#9B3DCF] hover:to-[#FD4F88] shadow-md shadow-purple-500/20 transition-all disabled:opacity-60"
        >
          {mutation.isPending ? "Creating..." : "Create Vendor"}
        </button>
      </form>
    </Drawer>
  );
}

export default VendorQuickCreateDrawer;
