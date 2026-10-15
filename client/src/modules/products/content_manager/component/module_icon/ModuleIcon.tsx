import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FiAlertTriangle, FiPlus } from "react-icons/fi";
import { getModules } from "../../api/ModuleIconApi";
import ModuleIconCard from "./ModuleIconCard";
import AddModuleModal from "./AddModuleModal";

export default function ModuleIcon() {
  const queryClient = useQueryClient();
  const [addModalOpen, setAddModalOpen] = useState(false);

  const { data: modules, isLoading, isError, refetch } = useQuery({
    queryKey: ["content", "modules"],
    queryFn: getModules,
  });

  const sorted = [...(modules ?? [])].sort((a, b) => a.sort_order - b.sort_order);

  const handleSaved = () => {
    void queryClient.invalidateQueries({ queryKey: ["content", "modules"] });
    // The public resolved-modules preview (used by LivePreviewPanel) must pick up the change too.
    void queryClient.invalidateQueries({ queryKey: ["content", "resolved-modules"] });
  };

  return (
    <main className="space-y-6">
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#25103d] via-[#68258d] to-[#c33076] p-7 text-white shadow-[0_24px_65px_rgba(91,33,124,0.24)]">
        <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-purple-200">Content management</p>
            <h1 className="mt-1 text-3xl font-black">Module Icons</h1>
            <p className="mt-2 text-sm text-purple-100/80">Manage the icons and labels displayed in the mobile application's top navigation.</p>
          </div>
          <button
            type="button"
            onClick={() => setAddModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-[#852BAF] shadow hover:bg-purple-50"
          >
            <FiPlus /> Add Module
          </button>
        </div>
      </header>

      {addModalOpen && (
        <AddModuleModal onClose={() => setAddModalOpen(false)} onCreated={handleSaved} />
      )}

      {isLoading ? (
        <div className="grid place-items-center rounded-3xl border border-purple-100 bg-white p-16 text-sm font-semibold text-slate-400">
          Loading module icons...
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-red-100 bg-red-50 p-16 text-center">
          <FiAlertTriangle className="text-2xl text-red-500" />
          <p className="text-sm font-bold text-red-700">Unable to load module icons</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          {sorted.map((module) => (
            <ModuleIconCard key={module.module_key} module={module} onSaved={handleSaved} />
          ))}
        </div>
      )}
    </main>
  );
}
