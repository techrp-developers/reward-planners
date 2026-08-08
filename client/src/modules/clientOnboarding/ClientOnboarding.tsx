import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../common/api/api";
import {
  ArrowLeft, ArrowRight, BadgeCheck, Building2, Check, CheckCircle2,
  KeyRound, Loader2, MapPin, ShieldCheck, UserRound,
} from "lucide-react";

type FormData = Record<string, string | boolean>;
type StateOption = { state_id: number; state_name: string };

const steps = [
  { title: "Company", icon: Building2 },
  { title: "Address", icon: MapPin },
  { title: "Representative", icon: UserRound },
  { title: "Verification", icon: ShieldCheck },
  { title: "Legal", icon: BadgeCheck },
  { title: "Admin", icon: KeyRound },
  { title: "Welcome", icon: CheckCircle2 },
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
    setData((current) => ({
      ...current,
      [name]: value,
      ...(name === "aadhaarLast4" && value !== current.aadhaarLast4
        ? { aadhaarVerified: false }
        : {}),
    }));
    setError("");
  };

  const validate = () => {
    const required = (fields[step] || []).filter((field) => field.required);
    if (required.some((field) => !String(data[field.name] ?? "").trim())) return "Please complete all required fields.";
    if (step === 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.officialEmail))) return "Enter a valid official email.";
    if (step === 3 && !data.aadhaarVerified) return "Complete Aadhaar verification before continuing.";
    if (step === 4 && ![data.terms, data.privacy, data.dataConsent, data.communicationConsent].every(Boolean)) return "Accept all mandatory legal agreements.";
    if (step === 5 && data.password !== data.confirmPassword) return "Passwords do not match.";
    if (step === 5 && String(data.password).length < 8) return "Password must contain at least 8 characters.";
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
                disabled={statesLoading || Boolean(statesError)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-normal outline-none transition focus:border-purple-400 focus:ring-4 focus:ring-purple-100 disabled:cursor-not-allowed disabled:bg-slate-50"
              >
                <option value="">{statesLoading ? "Loading states…" : "Select state"}</option>
                {states.map((state) => (
                  <option key={state.state_id} value={state.state_id}>{state.state_name}</option>
                ))}
              </select>
              {statesError && <span className="mt-1 block text-xs font-normal text-red-600">{statesError}</span>}
            </>
          ) : (
            <input
              type={field.type || "text"} value={String(data[field.name] ?? "")}
              onChange={(event) => update(field.name, event.target.value)} placeholder={field.placeholder}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-normal outline-none transition focus:border-purple-400 focus:ring-4 focus:ring-purple-100"
            />
          )}
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
          {verifying ? <><Loader2 className="h-5 w-5 animate-spin" /> Verifying…</> : data.aadhaarVerified ? <><Check className="h-5 w-5" /> Verification complete</> : <><ShieldCheck className="h-5 w-5" /> Verify Aadhaar</>}
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
    <div className="min-h-screen bg-slate-50 px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <Link to="/login" className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-purple-700"><ArrowLeft className="h-4 w-4" /> Back to login</Link>
          <span className="text-sm font-bold text-slate-400">Reward Planner</span>
        </div>
        <div className="overflow-hidden rounded-3xl bg-white shadow-xl shadow-slate-200/70 lg:grid lg:grid-cols-[280px_1fr]">
          <aside className="bg-gradient-to-b from-[#852BAF] to-[#5b217d] p-6 text-white">
            <div className="mb-8 flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-white/15"><Building2 /></div><div><strong className="block">Client onboarding</strong><span className="text-xs text-purple-200">Progress saves automatically</span></div></div>
            <div className="space-y-2">{steps.map((item, index) => {
              const Icon = item.icon;
              const isAvailable = index <= highestStep;
              const isCompleted = index < highestStep;
              return (
                <button
                  key={item.title}
                  type="button"
                  disabled={!isAvailable}
                  onClick={() => { setStep(index); setError(""); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${index === step ? "bg-white text-purple-800 shadow-sm" : isCompleted ? "text-white hover:bg-white/10" : "cursor-not-allowed text-purple-200"}`}
                  aria-label={`${item.title}${isCompleted ? " (completed, click to edit)" : ""}`}
                >
                  <span className={`grid h-7 w-7 place-items-center rounded-full ${isCompleted ? "bg-emerald-400 text-white" : index === step ? "bg-purple-100" : "bg-white/10"}`}>
                    {isCompleted ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </span>
                  <span className="flex-1">{item.title}</span>
                  {isCompleted && <span className="text-[10px] font-semibold uppercase tracking-wide text-purple-100">Edit</span>}
                </button>
              );
            })}</div>
          </aside>
          <main className="p-6 sm:p-10">
            <div className="mb-8"><span className="text-xs font-bold uppercase tracking-widest text-purple-600">Step {step + 1} of {steps.length}</span><h1 className="mt-2 text-3xl font-extrabold text-slate-900">{steps[step].title}</h1><p className="mt-2 text-slate-500">{descriptions[step]}</p></div>
            {content()}
            {error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
            {step < 6 && <div className="mt-9 flex items-center justify-between border-t border-slate-100 pt-6"><button type="button" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0} className="flex items-center gap-2 rounded-xl px-4 py-3 font-semibold text-slate-600 disabled:opacity-0"><ArrowLeft className="h-4 w-4" /> Previous</button><button type="button" onClick={next} className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] px-6 py-3 font-bold text-white shadow-lg shadow-purple-200">Continue <ArrowRight className="h-4 w-4" /></button></div>}
          </main>
        </div>
      </div>
    </div>
  );
}
