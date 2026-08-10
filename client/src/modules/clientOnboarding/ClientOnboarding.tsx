import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../common/api/api";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { MdAdminPanelSettings, MdApartment as Building2, MdBusiness, MdCheck as Check, MdCheckCircle, MdFactCheck, MdLocationOn, MdOutlineVerifiedUser, MdPerson } from "react-icons/md";

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
  const [verifying, setVerifying] = useState(false);
  const [states, setStates] = useState<StateOption[]>([]);
  const [statesLoading, setStatesLoading] = useState(true);
  const [statesError, setStatesError] = useState("");

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
    <div className="grid gap-5 sm:grid-cols-2">
      {(fields[step] || []).map((field) => (
        <label key={field.name} className="block text-sm font-semibold text-slate-700">
          {field.label}{field.required && <span className="text-pink-500"> *</span>}
          {field.name === "state" ? (
            <>
              <select
                value={String(data.state ?? "")}
                onChange={(event) => update("state", event.target.value)}
                onBlur={() => setFieldErrors((current) => ({ ...current, state: validateField("state", data.state) }))}
                disabled={statesLoading || Boolean(statesError)}
                className={`mt-2 w-full rounded-xl border bg-white px-4 py-3 font-normal outline-none transition focus:ring-4 disabled:cursor-not-allowed disabled:bg-slate-50 ${fieldErrors.state ? "border-red-300 focus:border-red-400 focus:ring-red-100" : "border-slate-200 focus:border-purple-400 focus:ring-purple-100"}`}
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
            <input
              type={field.type || "text"} value={String(data[field.name] ?? "")}
              onChange={(event) => update(field.name, event.target.value)} placeholder={field.placeholder}
              onBlur={() => setFieldErrors((current) => ({ ...current, [field.name]: validateField(field.name, data[field.name] ?? "") }))}
              aria-invalid={Boolean(fieldErrors[field.name])}
              className={`mt-2 w-full rounded-xl border bg-white px-4 py-3 font-normal outline-none transition focus:ring-4 ${fieldErrors[field.name] ? "border-red-300 focus:border-red-400 focus:ring-red-100" : "border-slate-200 focus:border-purple-400 focus:ring-purple-100"}`}
            />
          )}
          {field.name !== "state" && fieldErrors[field.name] && <span className="mt-1.5 block text-xs font-semibold text-red-600">{fieldErrors[field.name]}</span>}
        </label>
      ))}
      {step === 1 && (
        <label className="sm:col-span-2 flex items-center gap-3 rounded-xl bg-slate-50 p-4 text-sm font-medium text-slate-700">
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
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          For safety, this temporary screen only collects the last four digits. Full Aadhaar must be handled by an approved KYC provider and must never be stored here.
        </div>
        <label className="block text-sm font-semibold text-slate-700">Last 4 digits of Aadhaar
          <input maxLength={4} inputMode="numeric" value={String(data.aadhaarLast4)} onChange={(e) => update("aadhaarLast4", e.target.value.replace(/\D/g, ""))} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 tracking-[.45em] outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100" placeholder="0000" />
        </label>
        <label className="flex items-start gap-3 text-sm text-slate-600"><input type="checkbox" checked={Boolean(data.identityConsent)} onChange={(e) => update("identityConsent", e.target.checked)} className="mt-1 h-4 w-4 accent-purple-600" />I authorize Reward Planner to verify my identity through an approved provider.</label>
        <button type="button" onClick={verifyIdentity} disabled={verifying || Boolean(data.aadhaarVerified)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 font-bold text-white disabled:bg-emerald-600">
          {verifying ? <><Loader2 className="h-5 w-5 animate-spin" /> Verifying…</> : data.aadhaarVerified ? <><MdCheckCircle className="h-5 w-5" /> Verification complete</> : <><ShieldCheck className="h-5 w-5" /> Verify Aadhaar</>}
        </button>
      </div>
    );
    if (step === 4) return (
      <div className="space-y-3">
        {[['terms','Terms of Service'],['privacy','Privacy Policy'],['dataConsent','Data Processing Consent'],['communicationConsent','Electronic Communication Consent']].map(([name, label]) => (
          <label key={name} className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <input type="checkbox" checked={Boolean(data[name])} onChange={(e) => update(name, e.target.checked)} className="h-4 w-4 accent-purple-600" /> I accept the {label}<span className="ml-auto text-pink-500">Required</span>
          </label>
        ))}
      </div>
    );
    return (
      <div className="py-5 text-center">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-emerald-100 text-emerald-600"><CheckCircle2 className="h-11 w-11" /></div>
        <h2 className="mt-6 text-3xl font-extrabold text-slate-900">Welcome to Reward Planner!</h2>
        <p className="mt-2 text-slate-500">Your onboarding information is ready to create the organization.</p>
        <div className="mx-auto mt-7 grid max-w-lg gap-3 rounded-2xl bg-slate-50 p-5 text-left text-sm sm:grid-cols-2">
          <div><span className="text-slate-500">Company</span><strong className="block text-slate-900">{String(data.companyName)}</strong></div>
          <div><span className="text-slate-500">Admin</span><strong className="block text-slate-900">{String(data.adminEmail)}</strong></div>
          <div><span className="text-slate-500">Status</span><strong className="block text-emerald-600">Ready</strong></div>
          <div><span className="text-slate-500">Next step</span><strong className="block text-slate-900">Organization setup</strong></div>
        </div>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <button onClick={() => navigate("/login", { state: { message: "Client onboarding completed successfully." } })} className="rounded-full bg-gradient-to-r from-[#852BAF] to-[#FC3F78] px-8 py-3 font-bold text-white shadow-lg">Return to login</button>
          <button type="button" onClick={startOver} className="rounded-full border border-slate-200 px-6 py-3 font-semibold text-slate-600 hover:bg-slate-50">Start over</button>
        </div>
      </div>
    );
  };

  const descriptions = ["Tell us about your organization.", "Add the registered business address.", "Add the authorized company representative.", "Verify the representative's identity.", "Review and accept the required agreements.", "Create the primary HR administrator.", "Your organization is ready for the next step."];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(198,78,254,0.18),_transparent_30%),linear-gradient(135deg,#fdf8ff_0%,#ffffff_48%,#fff5f8_100%)] p-3 sm:p-5 lg:p-7">
      <div className="mx-auto w-full max-w-[1600px]">
        <header className="mb-5 flex items-center justify-between px-1">
          <Link to="/login" className="inline-flex items-center gap-2 rounded-xl border border-purple-100 bg-white/80 px-4 py-2.5 text-sm font-bold text-slate-600 shadow-sm backdrop-blur transition hover:border-purple-300 hover:text-[#852BAF]"><ArrowLeft className="h-4 w-4" /> Back to login</Link>
          <div className="text-right"><p className="text-sm font-black text-slate-800">Reward Planner</p><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#852BAF]">Organization portal</p></div>
        </header>

        <section className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-[#25103d] via-[#68258d] to-[#c33076] px-6 py-7 text-white shadow-[0_28px_80px_rgba(91,33,124,0.25)] sm:px-9 lg:px-12">
          <div className="absolute -right-20 -top-28 h-80 w-80 rounded-full bg-white/10 blur-3xl" /><div className="absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-pink-400/15 blur-3xl" />
          <div className="relative flex flex-col justify-between gap-6 md:flex-row md:items-center"><div className="flex items-center gap-4"><span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-white/20 bg-white/10 shadow-inner"><Building2 className="h-6 w-6" /></span><div><p className="text-[10px] font-black uppercase tracking-[0.24em] text-purple-200">Client onboarding</p><h1 className="mt-1 text-2xl font-black sm:text-3xl">Create your organization workspace</h1><p className="mt-2 max-w-2xl text-sm text-purple-100/80">Complete the secure setup once. Your progress is saved automatically on this device.</p></div></div><div className="min-w-48 rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm"><div className="flex items-end justify-between"><span className="text-xs font-bold text-purple-100">Overall progress</span><strong className="text-lg">{Math.round((step / 6) * 100)}%</strong></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-gradient-to-r from-purple-300 to-pink-300 transition-all duration-500" style={{ width: `${(step / 6) * 100}%` }} /></div></div></div>
        </section>

        <section className="mt-5 overflow-hidden rounded-[32px] border border-purple-100 bg-white shadow-[0_22px_65px_rgba(67,31,91,0.10)]">
          <div className="border-b border-purple-100 bg-gradient-to-r from-purple-50/80 via-white to-pink-50/60 px-4 py-5 sm:px-7 lg:px-10">
            <div className="overflow-x-auto pb-2">
              <div className="flex min-w-[900px] items-start">{steps.map((item, index) => {
                const Icon = item.icon; const isAvailable = index <= highestStep; const isCompleted = index < highestStep; const isCurrent = index === step;
                return <div key={item.title} className="relative flex flex-1 flex-col items-center px-2 text-center">{index < steps.length - 1 && <span className={`absolute left-[56%] top-5 h-0.5 w-[88%] ${index < highestStep ? "bg-emerald-400" : "bg-slate-200"}`} />}
                  <button type="button" disabled={!isAvailable} onClick={() => { setStep(index); setError(""); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="relative z-10 flex flex-col items-center disabled:cursor-not-allowed" aria-label={`${item.title}${isCompleted ? " (completed, click to edit)" : ""}`}>
                    <span className={`grid h-11 w-11 place-items-center rounded-2xl border shadow-sm transition ${isCompleted ? "border-emerald-400 bg-emerald-500 text-white" : isCurrent ? "border-[#852BAF] bg-gradient-to-br from-[#852BAF] to-[#FC3F78] text-white shadow-purple-200" : "border-slate-200 bg-white text-slate-400"}`}>{isCompleted ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}</span>
                    <span className={`mt-2 text-xs font-extrabold ${isCurrent ? "text-[#852BAF]" : isCompleted ? "text-emerald-700" : "text-slate-400"}`}>{item.title}</span><span className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-300">Step {index + 1}</span>
                  </button>
                </div>;
              })}</div>
            </div>
          </div>

          <main className="px-5 py-7 sm:px-8 sm:py-9 lg:px-12 lg:py-11">
            <div className="mx-auto max-w-6xl"><div className="mb-8 flex flex-col justify-between gap-4 border-b border-slate-100 pb-6 sm:flex-row sm:items-end"><div><span className="inline-flex rounded-full bg-purple-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-[#852BAF]">Step {step + 1} of {steps.length}</span><h2 className="mt-3 text-3xl font-black tracking-tight text-slate-900">{steps[step].title}</h2><p className="mt-2 text-sm text-slate-500">{descriptions[step]}</p></div><span className="hidden rounded-2xl bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500 sm:block">Fields marked <span className="font-black text-pink-500">*</span> are required</span></div>
              {content()}
              {error && <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}
              {step < 6 && <div className="mt-10 flex items-center justify-between border-t border-slate-100 pt-6"><button type="button" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 font-bold text-slate-600 shadow-sm transition hover:border-purple-300 hover:text-[#852BAF] disabled:pointer-events-none disabled:opacity-0"><ArrowLeft className="h-4 w-4" /> Previous</button><button type="button" onClick={next} className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] px-7 py-3 font-black text-white shadow-lg shadow-purple-200 transition hover:-translate-y-0.5">Continue <ArrowRight className="h-4 w-4" /></button></div>}
            </div>
          </main>
        </section>
      </div>
    </div>
  );
}
