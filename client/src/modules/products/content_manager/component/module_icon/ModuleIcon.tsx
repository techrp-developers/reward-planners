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
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Module icons</h1>
          <p className="mt-1 text-sm text-slate-500">Manage the icons and labels displayed in the mobile application's top navigation.</p>
        </div>
        <button
            type="button"
            onClick={() => setAddModalOpen(true)}
            className="inline-flex w-fit items-center gap-2 rounded-lg bg-[#852BAF] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#702393]"
          >
            <FiPlus /> Add Module
          </button>
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
