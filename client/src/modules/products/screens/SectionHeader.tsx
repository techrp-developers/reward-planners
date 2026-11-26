import type { ElementType } from "react";

// Section heading shared by the product form screens.
export default function SectionHeader({ icon: Icon, title, description }: { icon: ElementType; title: string; description?: string }) {
  return (
    <div className="mb-6 flex items-center gap-3 border-b border-gray-100 pb-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-[#852BAF]">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
      </div>
    </div>
  );
}
