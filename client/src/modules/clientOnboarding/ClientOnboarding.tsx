import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../common/api/api";
import { MdAdminPanelSettings, MdAnalytics, MdArrowBack, MdArrowForward, MdAutorenew, MdBusiness, MdCelebration, MdCheck as Check, MdCheckCircle, MdClose, MdDarkMode, MdFactCheck, MdGroups, MdLightMode, MdLocationOn, MdOutlineVerifiedUser, MdPerson, MdRedeem, MdSecurity, MdVerifiedUser, MdVisibility, MdVisibilityOff } from "react-icons/md";

type FormData = Record<string, string | boolean>;
type StateOption = { state_id: number; state_name: string };

const steps = [
  { title: "Company", icon: MdBusiness },
  { title: "Address", icon: MdLocationOn },
  { title: "Representative", icon: MdPerson },
  { title: "Verification", icon: MdOutlineVerifiedUser },
  { title: "Legal", icon: MdFactCheck },
  { title: "Admin", icon: MdAdminPanelSettings },
  { title: "Welcome", icon: MdCheckCircle },
];

const initialData: FormData = {
  companyName: "", legalName: "", companyType: "", industry: "", employeeCount: "",
  website: "", officialEmail: "", officialPhone: "", pan: "", gst: "",
  address1: "", address2: "", country: "India", state: "", city: "", pincode: "",
  officeSame: true, repName: "", designation: "", repEmail: "", repPhone: "", repPan: "",
  aadhaarLast4: "", identityConsent: false, terms: false, privacy: false, dataConsent: false,
  communicationConsent: false, adminName: "", adminEmail: "", password: "", confirmPassword: "",
  aadhaarVerified: false,
};

const fields: Record<number, Array<{ name: string; label: string; type?: string; required?: boolean; placeholder?: string }>> = {
  0: [
    { name: "companyName", label: "Company name", required: true }, { name: "legalName", label: "Legal entity name" },
    { name: "companyType", label: "Company type", required: true, placeholder: "Pvt Ltd / LLP / Startup" },
    { name: "industry", label: "Industry", required: true }, { name: "employeeCount", label: "Number of employees", type: "number", required: true },
    { name: "website", label: "Website", type: "url" }, { name: "officialEmail", label: "Official email", type: "email", required: true },
    { name: "officialPhone", label: "Mobile number", type: "tel", required: true }, { name: "pan", label: "Company PAN", required: true },
    { name: "gst", label: "GST number (optional)" },
  ],
  1: [
    { name: "address1", label: "Address line 1", required: true }, { name: "address2", label: "Address line 2" },
    { name: "country", label: "Country", required: true }, { name: "state", label: "State", required: true },
    { name: "city", label: "City", required: true }, { name: "pincode", label: "PIN code", required: true },
  ],
  2: [
    { name: "repName", label: "Full name", required: true }, { name: "designation", label: "Designation", required: true },
    { name: "repEmail", label: "Official email", type: "email", required: true }, { name: "repPhone", label: "Mobile number", type: "tel", required: true },
    { name: "repPan", label: "PAN", required: true },
  ],
  5: [
    { name: "adminName", label: "Admin name", required: true }, { name: "adminEmail", label: "Admin email", type: "email", required: true },
    { name: "password", label: "Create password", type: "password", required: true }, { name: "confirmPassword", label: "Confirm password", type: "password", required: true },
  ],
};

export default function ClientOnboarding() {
  const navigate = useNavigate();
  const saved = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("rp-client-onboarding") || "null"); } catch { return null; }
  }, []);
  const [step, setStep] = useState<number>(saved?.step ?? 0);
  const [highestStep, setHighestStep] = useState<number>(saved?.highestStep ?? saved?.step ?? 0);
  const [data, setData] = useState<FormData>({ ...initialData, ...(saved?.data ?? {}) });
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [verifying, setVerifying] = useState(false);
  const [states, setStates] = useState<StateOption[]>([]);
  const [statesLoading, setStatesLoading] = useState(true);
  const [statesError, setStatesError] = useState("");
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("rp-onboarding-theme") !== "light");
  const [showIntroduction, setShowIntroduction] = useState(true);

  useEffect(() => { localStorage.setItem("rp-onboarding-theme", darkMode ? "dark" : "light"); }, [darkMode]);

  useEffect(() => {
    let active = true;
    const loadStates = async () => {
      try {
        const response = await api.get("/auth/all-states");
        if (active && response.data?.success && Array.isArray(response.data.data)) {
          setStates(response.data.data);
        }
      } catch {
        if (active) setStatesError("Unable to load states. Please refresh and try again.");
      } finally {
        if (active) setStatesLoading(false);
      }
    };
    void loadStates();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    localStorage.setItem("rp-client-onboarding", JSON.stringify({
      step,
      highestStep,
      data,
      savedAt: new Date().toISOString(),
      completed: step === 6,
    }));
  }, [step, highestStep, data]);

  const update = (name: string, value: string | boolean) => {
    let normalized = value;
    if (typeof value === "string") {
      if (["pan", "repPan", "gst"].includes(name)) normalized = value.toUpperCase().replace(/\s/g, "").slice(0, name === "gst" ? 15 : 10);
      if (["officialPhone", "repPhone"].includes(name)) normalized = value.replace(/\D/g, "").slice(0, 10);
      if (name === "pincode") normalized = value.replace(/\D/g, "").slice(0, 6);
      if (name === "employeeCount") normalized = value.replace(/\D/g, "");
    }
    setData((current) => ({
      ...current,
      [name]: normalized,
      ...(name === "aadhaarLast4" && normalized !== current.aadhaarLast4
        ? { aadhaarVerified: false }
        : {}),
    }));
    setError("");
    setFieldErrors((current) => ({ ...current, [name]: "" }));
  };

  const validateField = (name: string, value: string | boolean) => {
    const text = String(value ?? "").trim();
    const required = (fields[step] || []).find((field) => field.name === name)?.required;
    if (required && !text) return "This field is required.";
    if (!text) return "";
    if (["officialEmail", "repEmail", "adminEmail"].includes(name) && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text)) return "Enter a valid email address.";
    if (["officialPhone", "repPhone"].includes(name) && !/^[6-9]\d{9}$/.test(text.replace(/\D/g, ""))) return "Enter a valid 10-digit Indian mobile number.";
    if (["pan", "repPan"].includes(name) && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(text.toUpperCase())) return "Use PAN format ABCDE1234F.";
    if (name === "gst" && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(text.toUpperCase())) return "Enter a valid 15-character GSTIN.";
    if (name === "pincode" && !/^[1-9][0-9]{5}$/.test(text)) return "Enter a valid 6-digit PIN code.";
    if (name === "employeeCount" && (!Number.isInteger(Number(text)) || Number(text) < 1)) return "Employee count must be at least 1.";
    if (name === "website") { try { const url = new URL(text); if (!["http:", "https:"].includes(url.protocol)) throw new Error(); } catch { return "Enter a complete URL starting with http:// or https://."; } }
    if (name === "password" && !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(text)) return "Use 8+ characters with uppercase, lowercase, number and symbol.";
    if (name === "confirmPassword" && text !== String(data.password)) return "Passwords do not match.";
    return "";
  };

  const validate = () => {
    const required = (fields[step] || []).filter((field) => field.required);
    const currentFields = fields[step] || [];
    const errors = Object.fromEntries(currentFields.map((field) => [field.name, validateField(field.name, data[field.name] ?? "")]).filter(([, value]) => value));
    setFieldErrors((current) => ({ ...current, ...errors }));
    if (required.some((field) => !String(data[field.name] ?? "").trim()) || Object.keys(errors).length) return "Review the highlighted fields before continuing.";
    if (step === 3 && !data.aadhaarVerified) return "Complete Aadhaar verification before continuing.";
    if (step === 4 && ![data.terms, data.privacy, data.dataConsent, data.communicationConsent].every(Boolean)) return "Accept all mandatory legal agreements.";
    return "";
  };

  const next = () => {
    const message = validate();
    if (message) return setError(message);
    const nextStep = Math.min(step + 1, 6);
    setHighestStep((current) => Math.max(current, nextStep));
    setStep(nextStep);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const verifyIdentity = () => {
    if (!data.identityConsent || !/^\d{4}$/.test(String(data.aadhaarLast4))) {
      setError("Provide the last 4 Aadhaar digits and authorize verification."); return;
    }
    setVerifying(true); setError("");
    window.setTimeout(() => {
      setVerifying(false);
      update("aadhaarVerified", true);
    }, 900);
  };

  const startOver = () => {
    localStorage.removeItem("rp-client-onboarding");
    setData(initialData);
    setStep(0);
    setHighestStep(0);
    setError("");
    setFieldErrors({});
  };

  const renderFields = () => (
    <div className="grid gap-4 sm:grid-cols-2">
      {(fields[step] || []).map((field) => (
        <label key={field.name} className="group block border-0 bg-transparent p-1 transition-all duration-200">
          <span className={`flex items-center justify-between text-sm font-bold ${darkMode ? "text-white" : "text-slate-600"}`}><span>{field.label}{field.required && <span className="text-pink-500"> *</span>}</span>{!darkMode && <span className="h-1.5 w-1.5 rounded-full bg-purple-300 transition group-focus-within:bg-[#C64EFE]" />}</span>
          {field.name === "state" ? (
            <>
              <select
                value={String(data.state ?? "")}
                onChange={(event) => update("state", event.target.value)}
                onBlur={() => setFieldErrors((current) => ({ ...current, state: validateField("state", data.state) }))}
                disabled={statesLoading || Boolean(statesError)}
                className={`mt-3 w-full rounded-lg border px-4 py-4 text-base font-medium outline-none transition focus:ring-4 disabled:cursor-not-allowed ${darkMode ? "border-[#4c4852] bg-[#242328] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] focus:border-fuchsia-500 focus:ring-fuchsia-500/10" : "border-transparent bg-[#f4f1f6] text-slate-800 focus:border-purple-300 focus:bg-white focus:ring-purple-100 disabled:bg-slate-100"} ${fieldErrors.state ? "border-red-400 focus:border-red-400 focus:ring-red-500/10" : ""}`}
              >
                <option value="">{statesLoading ? "Loading states…" : "Select state"}</option>
                {states.map((state) => (
                  <option key={state.state_id} value={state.state_id}>{state.state_name}</option>
                ))}
              </select>
              {statesError && <span className="mt-1 block text-xs font-normal text-red-600">{statesError}</span>}
              {fieldErrors.state && <span className="mt-1.5 block text-xs font-semibold text-red-600">{fieldErrors.state}</span>}
            </>
          ) : (
            <div className="relative">
            <input
              type={field.type === "password" && visiblePasswords[field.name] ? "text" : field.type || "text"} value={String(data[field.name] ?? "")}
              onChange={(event) => update(field.name, event.target.value)} placeholder={field.placeholder}
              onBlur={() => setFieldErrors((current) => ({ ...current, [field.name]: validateField(field.name, data[field.name] ?? "") }))}
              aria-invalid={Boolean(fieldErrors[field.name])}
              className={`mt-3 w-full rounded-lg border px-4 py-4 text-base font-medium outline-none transition placeholder:font-normal focus:ring-4 ${field.type === "password" ? "pr-12" : ""} ${darkMode ? "border-[#4c4852] bg-[#242328] text-white placeholder:text-[#8c8992] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] focus:border-fuchsia-500 focus:ring-fuchsia-500/10" : "border-transparent bg-[#f4f1f6] text-slate-800 placeholder:text-slate-400 focus:border-purple-300 focus:bg-white focus:ring-purple-100"} ${fieldErrors[field.name] ? "border-red-400 focus:border-red-400 focus:ring-red-500/10" : ""}`}
            />
            {field.type === "password" && <button type="button" onClick={() => setVisiblePasswords((current) => ({ ...current, [field.name]: !current[field.name] }))} className={`absolute right-3 top-[27px] grid h-9 w-9 place-items-center rounded-md text-xl transition ${darkMode ? "text-slate-400 hover:bg-slate-700 hover:text-white" : "text-slate-500 hover:bg-white hover:text-purple-700"}`} aria-label={visiblePasswords[field.name] ? `Hide ${field.label}` : `Show ${field.label}`} title={visiblePasswords[field.name] ? "Hide password" : "Show password"}>{visiblePasswords[field.name] ? <MdVisibilityOff /> : <MdVisibility />}</button>}
            </div>
          )}
          {field.name !== "state" && fieldErrors[field.name] && <span className="mt-1.5 block text-xs font-semibold text-red-600">{fieldErrors[field.name]}</span>}
        </label>
      ))}
      {step === 1 && (
        <label className={`sm:col-span-2 flex items-center gap-4 rounded-2xl border p-5 text-base font-bold shadow-sm ${darkMode ? "border-purple-500/20 bg-purple-950/30 text-slate-200" : "border-purple-100 bg-gradient-to-r from-purple-50 to-pink-50/60 text-slate-700"}`}>
          <input type="checkbox" checked={Boolean(data.officeSame)} onChange={(e) => update("officeSame", e.target.checked)} className="h-4 w-4 accent-purple-600" />
          Office address is the same as the registered address
        </label>
      )}
    </div>
  );

  const content = () => {
    if ([0, 1, 2, 5].includes(step)) return renderFields();
    if (step === 3) return (
      <div className="mx-auto max-w-xl space-y-5">
        <div className={`rounded-2xl border p-5 text-base leading-7 ${darkMode ? "border-amber-500/30 bg-amber-950/20 text-amber-200" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          For safety, this temporary screen only collects the last four digits. Full Aadhaar must be handled by an approved KYC provider and must never be stored here.
        </div>
        <label className={`block text-base font-bold ${darkMode ? "text-slate-200" : "text-slate-700"}`}>Last 4 digits of Aadhaar
          <input maxLength={4} inputMode="numeric" value={String(data.aadhaarLast4)} onChange={(e) => update("aadhaarLast4", e.target.value.replace(/\D/g, ""))} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 tracking-[.45em] outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100" placeholder="0000" />
        </label>
        <label className="flex items-start gap-3 text-sm text-slate-600"><input type="checkbox" checked={Boolean(data.identityConsent)} onChange={(e) => update("identityConsent", e.target.checked)} className="mt-1 h-4 w-4 accent-purple-600" />I authorize Reward Planner to verify my identity through an approved provider.</label>
        <button type="button" onClick={verifyIdentity} disabled={verifying || Boolean(data.aadhaarVerified)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 font-bold text-white disabled:bg-emerald-600">
          {verifying ? <><MdAutorenew className="h-5 w-5 animate-spin" /> Verifying…</> : data.aadhaarVerified ? <><MdCheckCircle className="h-5 w-5" /> Verification complete</> : <><MdVerifiedUser className="h-5 w-5" /> Verify Aadhaar</>}
        </button>
      </div>
    );
    if (step === 4) return (
      <div className="space-y-3">
        {[['terms','Terms of Service'],['privacy','Privacy Policy'],['dataConsent','Data Processing Consent'],['communicationConsent','Electronic Communication Consent']].map(([name, label]) => (
          <label key={name} className={`flex items-center gap-4 rounded-2xl border p-5 text-base font-bold transition ${darkMode ? "border-slate-700 bg-slate-900/70 text-slate-200 hover:border-purple-500/50" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
            <input type="checkbox" checked={Boolean(data[name])} onChange={(e) => update(name, e.target.checked)} className="h-4 w-4 accent-purple-600" /> I accept the {label}<span className="ml-auto text-pink-500">Required</span>
          </label>
        ))}
      </div>
    );
    return (
      <div className="relative min-h-[500px] overflow-hidden py-10 text-center">
        <style>{`@keyframes rp-burst{0%{opacity:0;transform:scale(.05) rotate(0)}18%{opacity:1}65%{opacity:.9}100%{opacity:0;transform:scale(1.2) rotate(25deg)}}.rp-firework{position:absolute;width:5px;height:5px;border-radius:999px;animation:rp-burst 1.9s ease-out infinite;box-shadow:0 -58px #a855f7,41px -41px #ec4899,58px 0 #f59e0b,41px 41px #8b5cf6,0 58px #22c55e,-41px 41px #f43f5e,-58px 0 #06b6d4,-41px -41px #eab308}.rp-firework:nth-of-type(2){animation-delay:.55s}.rp-firework:nth-of-type(3){animation-delay:1.1s}@media(prefers-reduced-motion:reduce){.rp-firework{display:none}}`}</style>
        <span className="rp-firework left-[13%] top-[28%]" /><span className="rp-firework right-[13%] top-[24%]" /><span className="rp-firework left-1/2 top-[12%]" />
        <div className="relative z-10 mx-auto max-w-3xl">
          <div className={`mx-auto grid h-24 w-24 place-items-center rounded-full border text-5xl ${darkMode ? "border-purple-500/30 bg-purple-500/10 text-purple-300" : "border-purple-100 bg-purple-50 text-purple-700"}`}><MdCelebration /></div>
          <p className={`mt-7 text-sm font-semibold uppercase tracking-[0.18em] ${darkMode ? "text-purple-300" : "text-purple-700"}`}>Onboarding complete</p>
          <h2 className={`mt-3 text-4xl font-semibold tracking-tight sm:text-5xl ${darkMode ? "text-white" : "text-slate-900"}`}>Welcome aboard, {String(data.companyName || "your team")}!</h2>
          <p className={`mx-auto mt-4 max-w-xl text-lg leading-8 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Your organization profile is ready. You can now continue to Reward Planners and begin setting up your workplace experience.</p>
          <div className={`mx-auto mt-9 grid max-w-2xl border-y text-left sm:grid-cols-2 ${darkMode ? "divide-slate-700 border-slate-700 sm:divide-x" : "divide-slate-200 border-slate-200 sm:divide-x"}`}>
            <div className="px-5 py-5"><span className={`text-sm ${darkMode ? "text-slate-500" : "text-slate-400"}`}>Organization</span><strong className="mt-1 block text-base">{String(data.companyName)}</strong></div>
            <div className="px-5 py-5"><span className={`text-sm ${darkMode ? "text-slate-500" : "text-slate-400"}`}>Primary administrator</span><strong className="mt-1 block text-base">{String(data.adminEmail)}</strong></div>
            <div className="px-5 py-5"><span className={`text-sm ${darkMode ? "text-slate-500" : "text-slate-400"}`}>Setup status</span><strong className="mt-1 flex items-center gap-2 text-base text-purple-500"><MdCheckCircle /> Ready to continue</strong></div>
            <div className="px-5 py-5"><span className={`text-sm ${darkMode ? "text-slate-500" : "text-slate-400"}`}>Next step</span><strong className="mt-1 block text-base">Organization workspace</strong></div>
          </div>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-4"><button onClick={() => navigate("/login", { state: { message: "Client onboarding completed successfully." } })} className="inline-flex items-center gap-2 rounded-md bg-gradient-to-r from-[#7457d7] to-[#a855d5] px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-purple-900/20">Continue to login <MdArrowForward /></button><button type="button" onClick={startOver} className={`rounded-md border px-6 py-3.5 text-base font-medium ${darkMode ? "border-slate-700 text-slate-300 hover:bg-slate-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>Start over</button></div>
        </div>
      </div>
    );
  };

  const descriptions = ["Tell us about your organization.", "Add the registered business address.", "Add the authorized company representative.", "Verify the representative's identity.", "Review and accept the required agreements.", "Create the primary HR administrator.", "Your organization is ready for the next step."];
  if (showIntroduction) {
    const benefits = [
      { Icon: MdRedeem, title: "Meaningful rewards", text: "Create rewarding experiences that make recognition useful, timely and memorable." },
      { Icon: MdGroups, title: "Connected workforce", text: "Bring employees, HR teams and organization administrators into one shared ecosystem." },
      { Icon: MdAnalytics, title: "Clear visibility", text: "Understand participation, engagement and reward activity through one organized portal." },
      { Icon: MdSecurity, title: "Secure by design", text: "Protected account access, verified organization details and role-based workspaces." },
    ];
    return <div className={`min-h-screen px-5 py-6 sm:px-8 lg:px-12 ${darkMode ? "bg-[#090d18] text-white" : "bg-[#f7f5f8] text-slate-900"}`} style={{ fontFamily: '"Segoe UI Variable", "Avenir Next", Inter, ui-sans-serif, system-ui, sans-serif' }}>
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-7xl flex-col">
        <header className="flex items-center justify-between"><Link to="/login" className={`inline-flex items-center gap-2 text-sm font-medium ${darkMode ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-purple-700"}`}><MdArrowBack className="h-5 w-5" /> Back to login</Link><button type="button" onClick={() => setDarkMode((value) => !value)} className={`grid h-10 w-10 place-items-center rounded-full text-lg ${darkMode ? "bg-slate-800 text-amber-300" : "bg-white text-purple-700 shadow-sm"}`} aria-label={darkMode ? "Use light mode" : "Use dark mode"}>{darkMode ? <MdLightMode /> : <MdDarkMode />}</button></header>
        <main className="grid flex-1 items-center gap-12 py-12 lg:grid-cols-[1.08fr_.92fr] lg:py-16">
          <section><span className={`inline-flex rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] ${darkMode ? "bg-purple-500/10 text-purple-300" : "bg-purple-100 text-purple-700"}`}>Welcome to Reward Planners</span><h1 className="mt-7 max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">Recognition that feels <span className="bg-gradient-to-r from-[#8b5cf6] to-[#ec4899] bg-clip-text text-transparent">personal.</span><br />Rewards that create impact.</h1><p className={`mt-7 max-w-2xl text-lg leading-8 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>Reward Planners is a unified employee engagement and rewards platform that helps organizations recognize people, manage benefits and build a stronger workplace culture.</p><div className="mt-9 flex flex-wrap items-center gap-4"><button type="button" onClick={() => { setShowIntroduction(false); window.scrollTo({ top: 0 }); }} className="inline-flex items-center gap-3 rounded-lg bg-gradient-to-r from-[#7457d7] to-[#a855d5] px-7 py-3.5 text-base font-semibold text-white shadow-lg shadow-purple-900/20 transition hover:-translate-y-0.5">Get Onboarded <MdArrowForward className="text-xl" /></button><span className={`text-sm ${darkMode ? "text-slate-500" : "text-slate-500"}`}>Takes approximately 5–8 minutes</span></div></section>
          <section className={`border px-6 py-7 sm:px-8 sm:py-9 ${darkMode ? "border-slate-700 bg-[#0e1422]" : "border-slate-200 bg-white shadow-xl shadow-slate-200/60"}`}><div className="mb-7"><p className={`text-sm font-medium ${darkMode ? "text-purple-300" : "text-purple-700"}`}>One platform. Shared purpose.</p><h2 className="mt-2 text-2xl font-semibold">What your organization gains</h2></div><div className="divide-y divide-slate-700/30">{benefits.map(({ Icon, title, text }) => <article key={title} className="flex gap-4 py-5 first:pt-0 last:pb-0"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-xl ${darkMode ? "bg-purple-500/10 text-purple-300" : "bg-purple-50 text-purple-700"}`}><Icon /></span><div><h3 className="text-base font-semibold">{title}</h3><p className={`mt-1 text-sm leading-6 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>{text}</p></div></article>)}</div></section>
        </main>
        <footer className={`border-t py-5 text-sm ${darkMode ? "border-slate-800 text-slate-600" : "border-slate-200 text-slate-400"}`}>Reward Planners · Organization onboarding</footer>
      </div>
    </div>;
  }
  return (
    <div className={`min-h-screen px-4 py-8 sm:py-12 ${darkMode ? "bg-[#090d18] text-white" : "bg-[#f5f5f7] text-slate-900"}`} style={{ fontFamily: '"Segoe UI Variable", "Avenir Next", Inter, ui-sans-serif, system-ui, sans-serif' }}>
      <div className={`mx-auto w-full max-w-7xl overflow-hidden border shadow-2xl ${darkMode ? "border-slate-700 bg-[#0e1422] shadow-black/40" : "border-slate-200 bg-white shadow-slate-300/50"}`}>
        <header className={`flex items-center justify-between border-b px-6 py-4 ${darkMode ? "border-slate-700" : "border-slate-200"}`}>
          <div><h1 className="text-lg font-semibold">Client Onboarding</h1><p className={`mt-0.5 text-sm ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Set up your organization account</p></div>
          <div className="flex items-center gap-2"><button type="button" onClick={() => setDarkMode((value) => !value)} className={`grid h-9 w-9 place-items-center rounded-full text-lg ${darkMode ? "bg-slate-800 text-amber-300" : "bg-slate-100 text-purple-700"}`} aria-label={darkMode ? "Use light mode" : "Use dark mode"}>{darkMode ? <MdLightMode /> : <MdDarkMode />}</button><Link to="/login" className={`grid h-9 w-9 place-items-center rounded-full text-xl ${darkMode ? "text-slate-400 hover:bg-slate-800" : "text-slate-500 hover:bg-slate-100"}`} aria-label="Close onboarding"><MdClose /></Link></div>
        </header>

        <nav className={`overflow-x-auto border-b px-6 py-6 ${darkMode ? "border-slate-700" : "border-slate-200"}`}>
          <div className="flex min-w-[900px]">{steps.map((item, index) => { const available = index <= highestStep; const completed = index < highestStep; const current = index === step; return <div key={item.title} className="relative flex flex-1 justify-center">{index < steps.length - 1 && <span className={`absolute left-[58%] top-5 w-[84%] border-t border-dashed ${completed ? "border-purple-500" : darkMode ? "border-slate-600" : "border-slate-300"}`} />}<button type="button" disabled={!available} onClick={() => { setStep(index); setError(""); }} className="relative z-10 flex w-28 flex-col items-center disabled:cursor-not-allowed"><span className={`grid h-11 w-11 place-items-center rounded-full text-sm font-semibold ${current ? "bg-gradient-to-br from-[#7457d7] to-[#9a63df] text-white" : completed ? "bg-[#6f4dcc] text-white" : darkMode ? "bg-slate-700 text-slate-300" : "bg-slate-200 text-slate-600"}`}>{completed ? <Check className="text-xl" /> : index + 1}</span><span className={`mt-2 text-center text-sm leading-4 ${current ? darkMode ? "text-white" : "text-slate-900" : darkMode ? "text-slate-400" : "text-slate-500"}`}>{item.title}</span></button></div>; })}</div>
        </nav>

        <main className="px-6 py-9 sm:px-12 sm:py-11 lg:px-16 lg:py-12">
          <div className="mb-7"><p className={`text-sm font-medium ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Step {step + 1} of {steps.length}</p><h2 className="mt-1 text-2xl font-semibold">{steps[step].title}</h2><p className={`mt-2 text-base ${darkMode ? "text-slate-400" : "text-slate-500"}`}>{descriptions[step]}</p></div>
          {content()}
          {error && <div className={`mt-5 border px-4 py-3 text-sm ${darkMode ? "border-red-500/40 bg-red-950/30 text-red-300" : "border-red-200 bg-red-50 text-red-700"}`}>{error}</div>}
          {step < 6 && <footer className={`mt-9 flex items-center justify-between border-t pt-6 ${darkMode ? "border-slate-700" : "border-slate-200"}`}><button type="button" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0} className={`inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium disabled:invisible ${darkMode ? "text-slate-300" : "text-slate-600"}`}><MdArrowBack className="text-lg" />Previous</button><button type="button" onClick={next} className="inline-flex items-center gap-2 rounded-md bg-gradient-to-r from-[#7457d7] to-[#9a63df] px-7 py-2.5 text-sm font-semibold text-white">Continue<MdArrowForward className="text-lg" /></button></footer>}
        </main>
      </div>
    </div>
  );
}
