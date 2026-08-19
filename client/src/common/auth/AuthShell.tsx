import type { ReactNode } from "react";
import { Check } from "lucide-react";
import logoImage from "../assets/logo.svg";

type AuthShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  compact?: boolean;
};

const benefits = [
  "One secure workspace for every role",
  "Real-time operations, rewards and insights",
  "Role-based access for every team",
];

export default function AuthShell({
  eyebrow,
  title,
  description,
  children,
  compact = false,
}: AuthShellProps) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f7f5fa] px-4 py-5 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute -left-32 top-[-10rem] h-[30rem] w-[30rem] rounded-full bg-purple-300/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 right-[-8rem] h-[32rem] w-[32rem] rounded-full bg-pink-300/20 blur-3xl" />

      <section className={`relative mx-auto grid min-h-[calc(100vh-2.5rem)] w-full max-w-6xl overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-[0_30px_90px_rgba(50,25,80,0.16)] lg:grid-cols-[0.92fr_1.08fr] ${compact ? "lg:max-h-[860px]" : ""}`}>
        <aside className="relative hidden overflow-hidden bg-[#180d26] p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_5%,rgba(168,85,247,0.45),transparent_36%),radial-gradient(circle_at_95%_90%,rgba(252,63,120,0.35),transparent_40%)]" />
          <div className="pointer-events-none absolute inset-0 opacity-[0.07] bg-[linear-gradient(rgba(255,255,255,.5)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.5)_1px,transparent_1px)] [background-size:38px_38px]" />

          <div className="relative z-10">
            <div className="inline-flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-md">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-white shadow-lg shadow-purple-950/40">
                <img src={logoImage} alt="Rewards portal" className="h-7 w-7 object-contain" />
              </div>
              <div>
                <p className="text-sm font-bold tracking-wide">Rewards Portal</p>
                <p className="text-[10px] uppercase tracking-[0.2em] text-purple-200">Your workspace</p>
              </div>
            </div>
          </div>

          <div className="relative z-10 my-12">
            {/* <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-purple-300/20 bg-purple-300/10 px-3 py-1.5 text-xs font-semibold text-purple-100">
              <Sparkles className="h-3.5 w-3.5" />
              Built for every team
            </div> */}
            <h2 className="max-w-md text-4xl font-semibold leading-[1.08] tracking-[-0.04em] xl:text-5xl">
              One workspace. Every team.
            </h2>
            <p className="mt-5 max-w-md text-base leading-7 text-white/60">
              Manage people, rewards and day-to-day operations from one secure, connected portal.
            </p>

            <div className="mt-9 space-y-4">
              {benefits.map((benefit) => (
                <div key={benefit} className="flex items-center gap-3 text-sm text-white/80">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-white/10 text-pink-200">
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </span>
                  {benefit}
                </div>
              ))}
            </div>
          </div>

          <p className="relative z-10 text-xs text-white/35">A connected workspace for your entire organization.</p>
        </aside>

        <div className="relative flex items-center justify-center px-6 py-9 sm:px-10 lg:px-14 xl:px-20">
          <div className="w-full max-w-[490px]">
            <div className="mb-8 lg:hidden">
              <div className="inline-flex items-center gap-2.5">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#180d26] shadow-lg">
                  <img src={logoImage} alt="Rewards portal" className="h-7 w-7 object-contain brightness-0 invert" />
                </span>
                <span className="font-bold tracking-tight text-slate-900">Rewards Portal</span>
              </div>
            </div>

            <header className="mb-7">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[#8b3ab5]">{eyebrow}</p>
              <h1 className="text-3xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-4xl">{title}</h1>
              <p className="mt-3 text-sm leading-6 text-slate-500 sm:text-[15px]">{description}</p>
            </header>

            {children}
          </div>
        </div>
      </section>
    </main>
  );
}
