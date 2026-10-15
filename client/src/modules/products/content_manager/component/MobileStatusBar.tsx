import { FiWifi } from "react-icons/fi";

/** Purely cosmetic - simulates a phone status bar so the preview reads as a real screen, independent of the browser chrome. */
export default function MobileStatusBar() {
  return (
    <div className="flex items-center justify-between px-4 pb-1 pt-2.5 text-[11px] font-bold text-white">
      <span>9:41</span>
      <div className="flex items-center gap-1.5">
        <div className="flex items-end gap-[2px]" aria-hidden>
          {[3, 5, 7, 9].map((h) => (
            <span key={h} className="w-[3px] rounded-sm bg-white" style={{ height: h }} />
          ))}
        </div>
        <FiWifi size={12} />
        <span className="h-[10px] w-[18px] rounded-[3px] border border-white/80 p-[1px]">
          <span className="block h-full w-3/4 rounded-[1px] bg-white" />
        </span>
      </div>
    </div>
  );
}
