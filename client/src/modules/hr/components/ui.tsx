// Small shared UI kit for the HR portal: slate neutrals with the brand
// purple (and a touch of pink) on cards, icons and active states.
import type { ComponentType, ReactNode } from "react";
import { Link } from "react-router-dom";
import { FiArrowLeft } from "react-icons/fi";

type IconComponent = ComponentType<{ className?: string }>;

const cardSurface = "rounded-2xl border border-purple-100 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(133,43,175,0.18)]";

const iconTones = {
  purple: "bg-purple-50 text-[#852BAF]",
  pink: "bg-pink-50 text-[#C13A8E]",
  green: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  grey: "bg-slate-100 text-slate-500",
};

export function IconTile({ icon: Icon, tone = "purple", size = "md" }: { icon: IconComponent; tone?: keyof typeof iconTones; size?: "sm" | "md" }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-xl ${iconTones[tone]} ${size === "sm" ? "h-8 w-8" : "h-10 w-10"}`}>
      <Icon className={size === "sm" ? "h-4 w-4" : "h-5 w-5"} />
    </span>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  backTo,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  backTo?: { to: string; label: string };
}) {
  return (
    <header className="mb-6">
      {backTo && (
        <Link to={backTo.to} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
          <FiArrowLeft className="h-3.5 w-3.5" /> {backTo.label}
        </Link>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-sm text-slate-500">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`${cardSurface} ${className}`}>{children}</section>;
}

export function CardHeader({
  title,
  description,
  action,
  icon,
  tone,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: IconComponent;
  tone?: keyof typeof iconTones;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-purple-100/80 px-5 py-4">
      <div className="flex min-w-0 items-center gap-3">
        {icon && <IconTile icon={icon} tone={tone} size="sm" />}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function StatStrip({ children }: { children: ReactNode }) {
  return <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">{children}</div>;
}

export function Stat({
  label: statLabel,
  value,
  note,
  icon,
  tone = "purple",
  active,
  onClick,
}: {
  label: string;
  value: ReactNode;
  note?: string;
  icon?: IconComponent;
  tone?: keyof typeof iconTones;
  active?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500">{statLabel}</p>
        <p className="mt-1.5 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
        {note && <p className="mt-0.5 truncate text-xs text-slate-400">{note}</p>}
      </div>
      {icon && <IconTile icon={icon} tone={tone} />}
    </div>
  );
  if (!onClick) return <div className={`${cardSurface} px-5 py-4`}>{content}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`${cardSurface} relative overflow-hidden px-5 py-4 text-left transition cursor-pointer hover:border-purple-200 ${
        active ? "border-purple-300 bg-purple-50/40 ring-1 ring-purple-300" : ""
      }`}
    >
      {active && <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#852BAF] from-60% to-[#C13A8E]" />}
      {content}
    </button>
  );
}

const statusTones = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  grey: "bg-slate-400",
  red: "bg-red-500",
};

export function StatusDot({ tone, children }: { tone: keyof typeof statusTones; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-slate-700">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusTones[tone]}`} />
      {children}
    </span>
  );
}

export function Initials({ name, size = "md" }: { name?: string | null; size?: "sm" | "md" }) {
  const initials = (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full bg-purple-50 font-medium text-[#852BAF] ${size === "sm" ? "h-7 w-7 text-[11px]" : "h-9 w-9 text-xs"}`}>
      {initials || "?"}
    </span>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadingRow({ text = "Loading…" }: { text?: string }) {
  return <p className="px-6 py-12 text-center text-sm text-slate-500">{text}</p>;
}
