import type { SplashPlacement, SplashStatus } from "../../api/SplashscreenApi";
import { STATUS_LABELS } from "../../utils/splash";

const STYLES: Record<SplashStatus, string> = {
  live: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  scheduled: "bg-sky-50 text-sky-700 ring-sky-200",
  draft: "bg-slate-100 text-slate-600 ring-slate-200",
  expired: "bg-amber-50 text-amber-700 ring-amber-200",
  disabled: "bg-rose-50 text-rose-700 ring-rose-200",
};

/** Effective status, plus whether the campaign is actually the one shown now. */
export default function SplashStatusBadge({ placement }: { placement: Pick<SplashPlacement, "effective_status" | "showing_now"> }) {
  const status = placement.effective_status;
  const showing = status === "live" && placement.showing_now.length > 0;
  return (
    <div className="flex flex-col items-start gap-1">
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${STYLES[status]}`}>
        {status === "live" && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />}
        {STATUS_LABELS[status]}
      </span>
      {status === "live" && (
        <span className={`text-[11px] ${showing ? "font-semibold text-emerald-700" : "text-slate-500"}`}>
          {showing ? "Showing now" : "Eligible, outranked"}
        </span>
      )}
    </div>
  );
}
