// Shared class strings and helpers for the HR portal (see ui.tsx for components).

// Brand gradient: mostly purple, a touch of pink.
export const brandGradient = "bg-gradient-to-r from-[#852BAF] from-60% to-[#C13A8E]";

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50";

export const button = {
  primary: `${buttonBase} bg-gradient-to-r from-[#852BAF] from-60% to-[#C13A8E] text-white shadow-sm shadow-purple-200 hover:brightness-95`,
  secondary: `${buttonBase} border border-purple-200 bg-white text-[#6E2391] hover:bg-purple-50`,
  ghost: `${buttonBase} text-slate-600 hover:bg-slate-100 hover:text-slate-900`,
  danger: `${buttonBase} border border-red-200 bg-white text-red-600 hover:bg-red-50`,
};

export const iconButton =
  "inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-purple-50 hover:text-[#852BAF] cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent";

export const field =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-[#852BAF] focus:ring-2 focus:ring-[#852BAF]/15 disabled:bg-slate-50";

export const label = "mb-1.5 block text-sm font-medium text-slate-700";

export function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
