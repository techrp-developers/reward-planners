import type { ReactNode } from "react";
import { FiX } from "react-icons/fi";

interface DrawerProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

// Minimal right-side slide-over — used for the allocation page's "+ Add New
// Vendor" / "+ Add New Product" quick-create forms, which need to stay on
// the allocation page rather than navigating away.
function Drawer({ open, title, onClose, children }: DrawerProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative flex flex-col w-full max-w-md h-full bg-white shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-900">{title}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <FiX className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export default Drawer;
