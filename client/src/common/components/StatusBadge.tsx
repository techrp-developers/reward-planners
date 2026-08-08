import type { ReactNode } from "react";

export default function StatusBadge({
  label,
  cls,
  icon,
}: {
  label: string;
  cls: string;
  icon: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide ${cls}`}
    >
      {icon} {label}
    </span>
  );
}
