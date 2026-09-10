import type { ReactNode } from "react";

interface Props {
  /** Simulated device width in CSS px (e.g. 360/390/430 for the CMS device selector). */
  width?: number;
  children: ReactNode;
}

/** Desktop-friendly phone mockup - the outer chrome is fixed, the screen width is whatever the caller picks. */
export default function PhoneFrame({ width = 390, children }: Props) {
  return (
    <div className="mx-auto" style={{ width: `${width}px`, maxWidth: "100%" }}>
      <div className="relative rounded-[42px] border-[14px] border-[#111827] bg-[#111827] shadow-[0_25px_60px_rgba(15,23,42,0.35)]">
        <div className="pointer-events-none absolute left-1/2 top-0 z-10 h-6 w-32 -translate-x-1/2 rounded-b-2xl bg-[#111827]" />
        {/* This bounded height is the phone's screen viewport, not a content image height - the mobile content inside scrolls naturally past it. */}
        <div className="h-[660px] max-h-[75vh] overflow-y-auto overscroll-contain rounded-[28px] bg-[#0B0617]">
          {children}
        </div>
      </div>
    </div>
  );
}
