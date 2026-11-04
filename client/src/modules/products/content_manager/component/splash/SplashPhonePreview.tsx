import { FiImage, FiX } from "react-icons/fi";
import PhoneFrame from "../PhoneFrame";
import type { SplashSlotKind } from "../../api/SplashscreenApi";

interface Props {
  imageUrl: string | null;
  title: string;
  ctaText?: string | null;
  slotKey: string;
  slotKind: SplashSlotKind;
  device: "android" | "ios";
  displaySeconds?: number | null;
  pageLabel?: string;
}

function StatusBar({ device, light }: { device: "android" | "ios"; light: boolean }) {
  const color = light ? "text-white" : "text-slate-900";
  return device === "ios"
    ? <div className={`flex h-11 items-end justify-between px-7 pb-1.5 text-[13px] font-semibold ${color}`}><span>9:41</span><span className="tracking-widest">▮▮▮ ◔</span></div>
    : <div className={`relative flex h-8 items-center justify-between px-5 text-[12px] font-medium ${color}`}>
        <span>9:41</span>
        <span className="absolute left-1/2 top-2 h-3 w-3 -translate-x-1/2 rounded-full bg-black" aria-hidden />
        <span>▾ ▮ 100%</span>
      </div>;
}

function Artwork({ url, className }: { url: string | null; className: string }) {
  return url
    ? <img src={url} alt="" className={`${className} object-cover`} />
    : <div className={`${className} flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-purple-100 to-pink-100 text-purple-400`}><FiImage size={28} /><span className="text-xs font-medium">No artwork selected</span></div>;
}

const PageSkeleton = ({ rows = 4 }: { rows?: number }) => (
  <div className="space-y-3 px-4">
    {Array.from({ length: rows }, (_, index) => (
      <div key={index} className="flex gap-3"><div className="h-14 w-14 rounded-xl bg-slate-200" /><div className="flex-1 space-y-2 py-1"><div className="h-3 w-3/4 rounded bg-slate-200" /><div className="h-3 w-1/2 rounded bg-slate-100" /></div></div>
    ))}
  </div>
);

/** A visual preview of how the artwork sits in the app. Not a live rendering of the app. */
export default function SplashPhonePreview({ imageUrl, title, ctaText, slotKey, slotKind, device, displaySeconds, pageLabel }: Props) {
  const cta = ctaText?.trim();
  const timer = displaySeconds ? `${displaySeconds}s` : null;

  if (slotKey === "promo_splash") {
    return (
      <PhoneFrame width={300}>
        <div className="relative h-full w-full bg-black" data-testid="preview-promo_splash">
          <Artwork url={imageUrl} className="absolute inset-0 h-full w-full" />
          <div className="absolute inset-x-0 top-0"><StatusBar device={device} light /></div>
          <button type="button" className="absolute right-4 top-14 rounded-full bg-black/55 px-3 py-1 text-xs font-semibold text-white backdrop-blur">Skip{timer ? ` · ${timer}` : ""}</button>
          {cta && <div className="absolute inset-x-6 bottom-10"><div className="rounded-2xl bg-white py-3 text-center text-sm font-bold text-[#852BAF] shadow-lg">{cta}</div></div>}
        </div>
      </PhoneFrame>
    );
  }

  if (slotKind === "overlay") {
    return (
      <PhoneFrame width={300}>
        <div className="relative h-full w-full bg-slate-50" data-testid="preview-entry_popup">
          <StatusBar device={device} light={false} />
          <p className="px-4 pb-3 text-lg font-bold text-slate-900">{pageLabel || "Page"}</p>
          <PageSkeleton rows={6} />
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 px-6">
            <div className="relative w-full overflow-hidden rounded-3xl bg-white shadow-2xl">
              <button type="button" aria-label="Close" className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white"><FiX size={14} /></button>
              <Artwork url={imageUrl} className="aspect-[4/5] w-full" />
              <div className="space-y-2 p-4">
                <p className="text-sm font-bold text-slate-900">{title || "Campaign title"}</p>
                {cta && <div className="rounded-xl bg-[#852BAF] py-2.5 text-center text-sm font-bold text-white">{cta}</div>}
                {timer && <p className="text-center text-[11px] text-slate-500">Closes automatically after {timer}</p>}
              </div>
            </div>
          </div>
        </div>
      </PhoneFrame>
    );
  }

  const banner = (
    <div className="relative mx-4 overflow-hidden rounded-2xl shadow-sm" data-testid={`preview-${slotKey}`}>
      <Artwork url={imageUrl} className="aspect-[2/1] w-full" />
      {cta && <span className="absolute bottom-3 left-3 rounded-full bg-white/95 px-3 py-1 text-xs font-bold text-[#852BAF]">{cta}</span>}
    </div>
  );
  return (
    <PhoneFrame width={300}>
      <div className="h-full w-full space-y-4 bg-slate-50">
        <StatusBar device={device} light={false} />
        <p className="px-4 text-lg font-bold text-slate-900">{pageLabel || "Page"}</p>
        {slotKey === "hero_banner" ? <>{banner}<PageSkeleton /></> : <><PageSkeleton rows={2} />{banner}<PageSkeleton rows={3} /></>}
      </div>
    </PhoneFrame>
  );
}
