import { useEffect, useRef, useState, type CSSProperties } from "react";
import { MOTION_EFFECTS, type ContentEntry, type MotionEffect, type MotionIntensity, type MotionSpeed } from "../types";
import "./MotionEffectFields.css";

const selectClass = "mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-purple-400";

export default function MotionEffectFields({ draft, onChange }: {
  draft: ContentEntry;
  onChange: (patch: Partial<ContentEntry>) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(!document.hidden);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    if (ref.current) observer.observe(ref.current);
    const onVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const count = { low: 3, medium: 6, high: 10 }[draft.motionIntensity] ?? 6;
  const speed = { slow: 1.5, normal: 1, fast: 0.7 }[draft.motionSpeed] ?? 1;
  const effect = MOTION_EFFECTS.some(option => option.value === draft.motionEffect) ? draft.motionEffect : "none";
  const style = {
    "--motion-duration": `${6 * speed}s`,
    animationPlayState: visible && pageVisible ? "running" : "paused",
  } as CSSProperties;

  return (
    <div className="sm:col-span-2 space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="text-xs font-bold text-slate-500">
          Motion Effect
          <select required value={effect} onChange={event => onChange({ motionEffect: event.target.value as MotionEffect })} className={selectClass}>
            {MOTION_EFFECTS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        {effect !== "none" && <>
          <label className="text-xs font-bold text-slate-500">
            Intensity
            <select value={draft.motionIntensity} onChange={event => onChange({ motionIntensity: event.target.value as MotionIntensity })} className={selectClass}>
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
            </select>
          </label>
          <label className="text-xs font-bold text-slate-500">
            Speed
            <select value={draft.motionSpeed} onChange={event => onChange({ motionSpeed: event.target.value as MotionSpeed })} className={selectClass}>
              <option value="slow">Slow</option><option value="normal">Normal</option><option value="fast">Fast</option>
            </select>
          </label>
        </>}
      </div>
      <p className="text-xs font-bold text-slate-500">Motion Preview</p>
      <div ref={ref} className="cms-motion-preview rounded-2xl bg-slate-100" data-effect={draft.contentType === "image" && draft.imageUrl ? effect : "none"} style={style}>
        {draft.contentType === "image" && draft.imageUrl ? <>
          <img src={draft.imageUrl} alt="Promotional banner motion preview" />
          <div key={`${effect}-${count}-${speed}`} className="cms-motion-overlay" aria-hidden="true">
            {(effect === "falling_petals" || effect === "twinkle") && Array.from({ length: count }, (_, index) => (
              <span key={index} className={effect === "falling_petals" ? "cms-motion-petal" : "cms-motion-star"} style={{
                left: `${5 + ((index * 37) % 90)}%`,
                top: effect === "twinkle" ? `${10 + ((index * 29) % 75)}%` : "-10%",
                animationDelay: `${-index * 0.73 * speed}s`,
                backgroundColor: effect === "falling_petals" ? (index % 2 ? "#FFB52E" : "#E0115F") : undefined,
              }}>{effect === "twinkle" ? "✦" : null}</span>
            ))}
            {effect === "shine_sweep" && <span className="cms-motion-shine" />}
            {effect === "glow_pulse" && <span className="cms-motion-glow" style={{ opacity: { low: 0.35, medium: 0.6, high: 0.9 }[draft.motionIntensity] }} />}
          </div>
        </> : <span className="flex h-full items-center justify-center text-sm text-slate-500">Upload a banner image to preview motion.</span>}
      </div>
      <p className="text-xs text-slate-500">Recommended size 2048 x 1008 px, under 500 KB</p>
    </div>
  );
}
