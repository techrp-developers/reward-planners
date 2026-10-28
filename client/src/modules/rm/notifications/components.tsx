import type { ReactNode } from "react";
import { FiBell, FiChevronLeft, FiChevronRight, FiInbox, FiX } from "react-icons/fi";
import { LANGUAGE_LABELS, STATUS_META } from "./notificationUtils";
import type { Language } from "./notificationTypes";

export function Card({ title, subtitle, actions, children, className = "" }: { title?: string; subtitle?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div>
            {title && <h2 className="font-extrabold text-gray-900">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Metric({ label, value, hint, tone = "bg-violet-600" }: { label: string; value: number | string | null; hint?: string; tone?: string }) {
  return (
    <article className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <span className={`absolute -right-6 -top-6 h-16 w-16 rounded-full opacity-10 ${tone}`} />
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">{label}</p>
      <p className="mt-2 text-2xl font-black tracking-tight text-gray-900">{value === null ? "—" : typeof value === "number" ? value.toLocaleString() : value}</p>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </article>
  );
}

export function StatusPill({ status }: { status: string }) {
  const meta = STATUS_META[status] || { label: status, cls: "bg-gray-100 text-gray-700" };
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${meta.cls}`}>{meta.label}</span>;
}

export function Tag({ children, tone = "gray" }: { children: ReactNode; tone?: "gray" | "green" | "amber" | "purple" | "red" | "blue" }) {
  const tones = {
    gray: "bg-gray-100 text-gray-600",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    purple: "bg-purple-50 text-[#852BAF]",
    red: "bg-red-50 text-red-600",
    blue: "bg-sky-50 text-sky-700",
  };
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-bold ${tones[tone]}`}>{children}</span>;
}

export function Spinner() {
  return (
    <div className="flex h-40 items-center justify-center" role="status" aria-label="Loading">
      <div className="h-8 w-8 animate-spin rounded-full border-3 border-transparent border-r-[#FC3F78] border-t-[#852BAF]" />
    </div>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-50 text-xl text-[#852BAF]"><FiInbox /></span>
      <p className="font-bold text-gray-900">{title}</p>
      {text && <p className="max-w-md text-sm text-gray-500">{text}</p>}
      {action}
    </div>
  );
}

export function Notice({ tone = "amber", children }: { tone?: "amber" | "red" | "blue" | "green"; children: ReactNode }) {
  const tones = {
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    red: "border-red-100 bg-red-50 text-red-700",
    blue: "border-sky-100 bg-sky-50 text-sky-800",
    green: "border-emerald-100 bg-emerald-50 text-emerald-800",
  };
  return <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${tones[tone]}`}>{children}</div>;
}

export function Pagination({ page, limit, total, onPage }: { page: number; limit: number; total: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (total <= limit) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-5 py-3 text-xs text-gray-500">
      <span>{((page - 1) * limit + 1).toLocaleString()}–{Math.min(page * limit, total).toLocaleString()} of {total.toLocaleString()}</span>
      <div className="flex items-center gap-1">
        <button type="button" className="rounded-lg p-2 hover:bg-gray-100 disabled:opacity-40" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><FiChevronLeft /></button>
        <span className="px-2 font-bold text-gray-700">{page} / {pages}</span>
        <button type="button" className="rounded-lg p-2 hover:bg-gray-100 disabled:opacity-40" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><FiChevronRight /></button>
      </div>
    </div>
  );
}

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gray-900/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`w-full ${wide ? "max-w-5xl" : "max-w-2xl"} rounded-2xl bg-white shadow-2xl`}>
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h3 className="font-extrabold text-gray-900">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close"><FiX /></button>
        </div>
        <div className="max-h-[78vh] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

export function LanguageTabs({ value, onChange, approved, available }: { value: Language; onChange: (lang: Language) => void; approved?: Language[]; available?: Partial<Record<Language, boolean>> }) {
  return (
    <div className="inline-flex rounded-xl bg-gray-100 p-1" role="tablist" aria-label="Language">
      {(["en", "hi", "mr"] as Language[]).map((lang) => {
        const isApproved = lang === "en" || approved?.includes(lang);
        return (
          <button
            key={lang}
            type="button"
            role="tab"
            aria-selected={value === lang}
            onClick={() => onChange(lang)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${value === lang ? "bg-white text-[#852BAF] shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
          >
            {LANGUAGE_LABELS[lang]}
            {lang !== "en" && available?.[lang] && (
              <span className={`h-1.5 w-1.5 rounded-full ${isApproved ? "bg-emerald-500" : "bg-amber-400"}`} title={isApproved ? "Approved" : "Not yet approved"} />
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Approximation of the Android notification shade, for previews only. */
export function PushPreview({ title, message, imageUrl, note }: { title?: string; message?: string; imageUrl?: string | null; note?: string }) {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 p-4">
      <div className="rounded-xl bg-white/95 p-3 shadow-lg">
        <div className="flex items-center gap-2 text-[11px] text-gray-500">
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-br from-[#852BAF] to-[#FC3F78] text-[10px] text-white"><FiBell /></span>
          Reward Planners · now
        </div>
        <p className="mt-2 text-sm font-bold text-gray-900">{title || "Notification title"}</p>
        <p className="mt-0.5 whitespace-pre-line text-sm text-gray-600">{message || "Notification message"}</p>
        {imageUrl && <p className="mt-2 truncate rounded-lg bg-gray-100 px-2 py-1.5 text-[11px] text-gray-500">Image: {imageUrl}</p>}
      </div>
      {note && <p className="mt-2 text-[11px] font-medium text-slate-300">{note}</p>}
    </div>
  );
}

function AppBadge({ size = "h-5 w-5" }: { size?: string }) {
  return <span className={`flex ${size} shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-[#852BAF] to-[#FC3F78] text-[10px] text-white`}><FiBell /></span>;
}

/**
 * Approximate Android collapsed / expanded (BigPicture) and iOS renderings.
 * Real presentation depends on OS version, device and notification settings.
 */
export function NotificationPreviews({ title, message, imageUrl, note }: { title?: string; message?: string; imageUrl?: string | null; note?: string }) {
  const heading = title || "Notification title";
  const body = message || "Notification message";
  return (
    <div className="space-y-3">
      <div className="space-y-3 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 p-4">
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Android · collapsed</p>
          <div className="flex items-start gap-2.5 rounded-2xl bg-white/95 p-3 shadow-lg">
            <AppBadge />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-gray-500">Reward Planners · now</p>
              <p className="truncate text-sm font-bold text-gray-900">{heading}</p>
              <p className="truncate text-xs text-gray-600">{body}</p>
            </div>
            {imageUrl && <img src={imageUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Android · expanded{imageUrl ? " (big picture)" : ""}</p>
          <div className="rounded-2xl bg-white/95 p-3 shadow-lg">
            <div className="flex items-center gap-2 text-[11px] text-gray-500"><AppBadge /> Reward Planners · now</div>
            <p className="mt-2 text-sm font-bold text-gray-900">{heading}</p>
            <p className="mt-0.5 whitespace-pre-line text-xs text-gray-600">{body}</p>
            {imageUrl && <img src={imageUrl} alt="" className="mt-2 aspect-[2/1] w-full rounded-lg object-cover" />}
          </div>
        </div>
      </div>
      <div className="rounded-2xl bg-gradient-to-br from-sky-200 via-indigo-200 to-purple-200 p-4">
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">iOS · lock screen</p>
        <div className="rounded-[18px] bg-white/80 p-3 shadow-md backdrop-blur">
          <div className="flex items-start gap-2.5">
            <AppBadge size="h-8 w-8 rounded-lg" />
            <div className="min-w-0 flex-1">
              <div className="flex justify-between text-[11px] text-gray-500"><span className="font-semibold uppercase">Reward Planners</span><span>now</span></div>
              <p className="text-sm font-semibold text-gray-900">{heading}</p>
              <p className="line-clamp-2 text-xs text-gray-700">{body}</p>
            </div>
            {imageUrl && <img src={imageUrl} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" />}
          </div>
        </div>
        {imageUrl && <p className="mt-1.5 text-[10px] text-slate-600">Long-press on iOS shows the full image (needs the Notification Service Extension).</p>}
      </div>
      <p className="text-[11px] text-gray-500">Approximate previews. Actual appearance depends on the phone, OS version and notification settings.{note ? ` ${note}` : ""}</p>
    </div>
  );
}

export const inputCls = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-[#852BAF] focus:ring-2 focus:ring-purple-100 disabled:bg-gray-50 disabled:text-gray-500";
export const labelCls = "mb-1 block text-xs font-bold text-gray-600";
export const primaryBtn = "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#852BAF] to-[#C64EFE] px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:translate-y-0 disabled:opacity-50";
export const secondaryBtn = "inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 transition hover:border-[#852BAF] hover:text-[#852BAF] disabled:opacity-50";
export const dangerBtn = "inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-50";
