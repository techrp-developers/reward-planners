import type { ReactNode } from "react";

export default function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-[320px]">
      <div className="relative rounded-[42px] border-[14px] border-[#111827] bg-[#111827] shadow-[0_25px_60px_rgba(15,23,42,0.35)]">
        <div className="pointer-events-none absolute left-1/2 top-0 z-10 h-6 w-32 -translate-x-1/2 rounded-b-2xl bg-[#111827]" />
        <div className="h-[660px] overflow-y-auto overscroll-contain rounded-[28px] bg-white">
          {children}
        </div>
      </div>
    </div>
  );
}
