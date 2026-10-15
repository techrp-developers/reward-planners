import { useEffect, useRef, useState, type ReactNode } from "react";

interface Props {
  /** Actual simulated screen width; the whole device scales to fit the panel. */
  width?: number;
  children: ReactNode;
}

export default function PhoneFrame({ width = 390, children }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const screenHeight = Math.round(width * 844 / 390);
  const frameWidth = width + 28;
  const frameHeight = screenHeight + 28;
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => {
      // Reserve space for the preview controls and zone summary, fitting a full
      // device into the browser instead of shortening its screen viewport.
      const availableHeight = Math.max(240, window.innerHeight - 250);
      setScale(Math.min(1, container.clientWidth / frameWidth, availableHeight / frameHeight));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    window.addEventListener("resize", measure);
    measure();
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, [frameWidth, frameHeight]);

  return (
    <div ref={containerRef} className="w-full min-w-0">
      <div className="relative mx-auto" style={{ width: frameWidth * scale, height: frameHeight * scale }}>
        <div
          className="absolute left-0 top-0 rounded-[42px] border-[14px] border-[#111827] bg-[#111827] shadow-[0_25px_60px_rgba(15,23,42,0.35)]"
          style={{ width: frameWidth, height: frameHeight, transform: `scale(${scale})`, transformOrigin: "top left" }}
        >
          <div className="pointer-events-none absolute left-1/2 top-0 z-10 h-6 w-32 -translate-x-1/2 rounded-b-2xl bg-[#111827]" />
          <div className="h-full overflow-hidden rounded-[28px] bg-[#0B0617]">{children}</div>
        </div>
      </div>
    </div>
  );
}
