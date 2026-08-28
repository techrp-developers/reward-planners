import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../common/api/api";
import logoImage from "../../common/assets/logo.svg";
import { MdAdminPanelSettings, MdAnalytics, MdArrowBack, MdArrowForward, MdAutorenew, MdBusiness, MdCheck as Check, MdCheckCircle, MdClose, MdDarkMode, MdDraw, MdEmail, MdErrorOutline, MdFactCheck, MdGroups, MdHourglassTop, MdLightMode, MdLocationOn, MdPerson, MdRedeem, MdSecurity, MdVerifiedUser, MdVisibility, MdVisibilityOff, MdWhatsapp } from "react-icons/md";

type FormData = Record<string, string | boolean>;
type StateOption = { state_id: number; state_name: string };
type OtpChannel = "email" | "whatsapp";
type OtpState = { sessionId: string; otp: string; sent: boolean; verified: boolean; verificationToken: string; loading: boolean; message: string; error: string };

const emptyOtpState = (): OtpState => ({ sessionId: "", otp: "", sent: false, verified: false, verificationToken: "", loading: false, message: "", error: "" });
const ENABLE_WHATSAPP_VERIFICATION = true;
const REQUIRE_ZOHO_SIGNING = String(import.meta.env.VITE_REQUIRE_ZOHO_SIGNING ?? "true").toLowerCase() !== "false";

const steps = [
  { title: "Company", icon: MdBusiness },
  { title: "Address", icon: MdLocationOn },
  { title: "Representative", icon: MdPerson },
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
    { name: "companyName", label: "Company name", required: true },
    { name: "companyType", label: "Company type", required: true, placeholder: "Pvt Ltd / LLP / Startup" },
    { name: "industry", label: "Industry", required: true }, { name: "employeeCount", label: "Employee count", required: true },
    { name: "website", label: "Website", type: "url" }, { name: "officialEmail", label: "Official email", type: "email", required: true },
    { name: "officialPhone", label: "Mobile number", type: "tel", required: true }, { name: "gst", label: "GST number (optional)" },
  ],
  1: [
    { name: "address1", label: "Address line 1", required: true }, { name: "address2", label: "Address line 2" },
    { name: "country", label: "Country", required: true }, { name: "state", label: "State", required: true },
    { name: "city", label: "City", required: true }, { name: "pincode", label: "PIN code", required: true },
  ],
  2: [
    { name: "repName", label: "Full name", required: true }, { name: "designation", label: "Designation", required: true },
    { name: "repEmail", label: "Official email", type: "email", required: true }, { name: "repPhone", label: "Mobile number", type: "tel", required: true },
  ],
  4: [
    { name: "adminName", label: "Admin name", required: true }, { name: "adminEmail", label: "Admin email", type: "email", required: true },
    { name: "password", label: "Create password", type: "password", required: true }, { name: "confirmPassword", label: "Confirm password", type: "password", required: true },
  ],
};

export default function ClientOnboarding() {
  const navigate = useNavigate();
  const saved = useMemo(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem("rp-client-onboarding") || "null");
      if (parsed?.completed) {
        localStorage.removeItem("rp-client-onboarding");
        return null;
      }
      if (parsed?.data) parsed.data = { ...parsed.data, password: "", confirmPassword: "" };
      return parsed;
    } catch { return null; }
  }, []);
  const migrateStep = (value: unknown) => {
    const numericStep = Math.max(0, Math.min(Number(value) || 0, saved?.version === 2 ? 5 : 6));
    return saved?.version === 2 ? numericStep : numericStep >= 4 ? numericStep - 1 : Math.min(numericStep, 2);
  };
  const [step, setStep] = useState<number>(migrateStep(saved?.step));
  const [highestStep, setHighestStep] = useState<number>(migrateStep(saved?.highestStep ?? saved?.step));
  const [data, setData] = useState<FormData>({ ...initialData, ...(saved?.data ?? {}) });
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [verifying, setVerifying] = useState(false);
  const [states, setStates] = useState<StateOption[]>([]);
  const [statesLoading, setStatesLoading] = useState(true);
  const [statesError, setStatesError] = useState("");
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("rp-onboarding-theme") === "dark");
  const [showIntroduction, setShowIntroduction] = useState(true);
  const [otpVerification, setOtpVerification] = useState<Record<OtpChannel, OtpState>>({
    email: { ...emptyOtpState(), verified: Boolean(saved?.emailVerificationToken), verificationToken: String(saved?.emailVerificationToken || "") },
    whatsapp: { ...emptyOtpState(), verified: Boolean(saved?.whatsappVerificationToken), verificationToken: String(saved?.whatsappVerificationToken || "") },
  });
  const [sendingAdminWelcome, setSendingAdminWelcome] = useState(false);
  const [adminWelcomeSent, setAdminWelcomeSent] = useState(false);
  const [agreementSigned, setAgreementSigned] = useState(Boolean(saved?.agreementSigned));
  const [agreementState, setAgreementState] = useState(String(saved?.agreementState || ""));
  const [agreementLoading, setAgreementLoading] = useState(false);
  const [agreementMessage, setAgreementMessage] = useState("");

  useEffect(() => { localStorage.setItem("rp-onboarding-theme", darkMode ? "dark" : "light"); }, [darkMode]);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const signingState = query.get("zoho_state") || String(saved?.agreementState || "");
    if (!signingState) return;
    setAgreementState(signingState);
    setShowIntroduction(false);
    setStep(3);
    setHighestStep((current) => Math.max(current, 3));
    setAgreementLoading(true);
    const returnStatus = query.get("zoho_sign");
    if (returnStatus === "declined" || returnStatus === "later") {
      setAgreementMessage(returnStatus === "declined" ? "The agreement was declined. Start again when you are ready to sign." : "Signing was postponed. Start again to complete the agreement.");
      setAgreementLoading(false);
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }
    void api.post("/client-onboarding/otp/sign/status", { state: signingState }).then((response) => {
      const consumed = Boolean(response.data?.data?.consumed);
      const signed = Boolean(response.data?.data?.signed);
      setAgreementSigned(signed);
      if (consumed) {
        localStorage.removeItem("rp-client-onboarding");
        setAdminWelcomeSent(true);
        setHighestStep(steps.length - 1);
        setStep(steps.length - 1);
        setAgreementMessage("This onboarding application has already been submitted.");
        return;
      }
      setAgreementMessage(signed ? "Agreement signed and confirmed by Zoho Sign." : "Zoho has not marked the agreement as signed yet. Please open it again and complete all required fields.");
    }).catch((requestError) => setAgreementMessage((requestError as { response?: { data?: { message?: string } } }).response?.data?.message || "Unable to confirm the signed agreement.")).finally(() => {
      setAgreementLoading(false);
      window.history.replaceState({}, "", window.location.pathname);
    });
  }, []);

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
    if (step === steps.length - 1) {
      localStorage.removeItem("rp-client-onboarding");
      return;
    }
    const { password: _password, confirmPassword: _confirmPassword, ...draftData } = data;
    localStorage.setItem("rp-client-onboarding", JSON.stringify({
      step,
      highestStep,
      version: 2,
      data: draftData,
      emailVerificationToken: otpVerification.email.verificationToken,
      whatsappVerificationToken: otpVerification.whatsapp.verificationToken,
      agreementState,
      agreementSigned,
      savedAt: new Date().toISOString(),
      completed: false,
    }));
  }, [step, highestStep, data, otpVerification.email.verificationToken, otpVerification.whatsapp.verificationToken, agreementState, agreementSigned]);

  const update = (name: string, value: string | boolean) => {
    let normalized = value;
    if (typeof value === "string") {
      if (["pan", "repPan", "gst"].includes(name)) normalized = value.toUpperCase().replace(/\s/g, "").slice(0, name === "gst" ? 15 : 10);
      if (["officialPhone", "repPhone"].includes(name)) normalized = value.replace(/\D/g, "").slice(0, 10);
      if (name === "pincode") normalized = value.replace(/\D/g, "").slice(0, 6);
    }
    setData((current) => ({
      ...current,
      [name]: normalized,
      ...(name === "aadhaarLast4" && normalized !== current.aadhaarLast4
        ? { aadhaarVerified: false }
        : {}),
    }));
    if ((name === "repEmail" || name === "repPhone") && value !== data[name]) {
      const channel: OtpChannel = name === "repEmail" ? "email" : "whatsapp";
      setOtpVerification((current) => ({ ...current, [channel]: emptyOtpState() }));
    }
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
    if (name === "employeeCount" && !["1-100", "101-500", "501-1,000", "1,001-5,000", "5,001+"].includes(text)) return "Select an employee count range.";
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
    if (step === 2 && (!otpVerification.email.verified || (ENABLE_WHATSAPP_VERIFICATION && !otpVerification.whatsapp.verified))) return "Verify the representative's email before continuing.";
    if (step === 3 && REQUIRE_ZOHO_SIGNING && !agreementSigned) return "Sign the client agreement through Zoho Sign before continuing.";
    if (step === 3 && ![data.terms, data.privacy, data.dataConsent, data.communicationConsent].every(Boolean)) return "Accept all mandatory legal agreements.";
    return "";
  };

  const next = async () => {
    const message = validate();
    if (message) return setError(message);
    if (step === 4 && !adminWelcomeSent) {
      setSendingAdminWelcome(true);
      setError("");
      try {
        await api.post("/client-onboarding/otp/submit", {
          onboarding: data,
          emailVerificationToken: otpVerification.email.verificationToken,
          signingState: agreementState,
        });
        localStorage.removeItem("rp-client-onboarding");
        setAdminWelcomeSent(true);
      } catch (requestError) {
        const responseError = requestError as { response?: { data?: { code?: string } } };
        if (responseError.response?.data?.code === "EMAIL_VERIFICATION_REQUIRED") {
          setOtpVerification((current) => ({ ...current, email: emptyOtpState() }));
          setStep(2);
          setHighestStep((current) => Math.min(current, 2));
        }
        setError(otpErrorMessage(requestError));
        setSendingAdminWelcome(false);
        return;
      }
      setSendingAdminWelcome(false);
    }
    const nextStep = Math.min(step + 1, steps.length - 1);
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

  const otpErrorMessage = (requestError: unknown) => {
    const responseError = requestError as { response?: { data?: { message?: string } } };
    return responseError.response?.data?.message || (requestError instanceof Error ? requestError.message : "Something went wrong. Please try again.");
  };

  const sendRepresentativeOtp = async (channel: OtpChannel) => {
    setError("");
    const destination = String(channel === "email" ? data.repEmail : data.repPhone).trim();
    const fieldName = channel === "email" ? "repEmail" : "repPhone";
    const validationMessage = validateField(fieldName, destination);
    if (validationMessage) {
      setFieldErrors((current) => ({ ...current, [fieldName]: validationMessage }));
      return;
    }
    setOtpVerification((current) => ({ ...current, [channel]: { ...current[channel], loading: true, error: "", message: "" } }));
    try {
      const response = await api.post("/client-onboarding/otp/send", { channel, destination });
      setOtpVerification((current) => ({ ...current, [channel]: { ...emptyOtpState(), sent: true, sessionId: response.data?.data?.sessionId || "", message: response.data?.message || "OTP sent." } }));
    } catch (requestError) {
      setOtpVerification((current) => ({ ...current, [channel]: { ...current[channel], loading: false, error: otpErrorMessage(requestError) } }));
    }
  };

  const verifyRepresentativeOtp = async (channel: OtpChannel) => {
    setError("");
    const channelState = otpVerification[channel];
    if (!/^\d{6}$/.test(channelState.otp)) {
      setOtpVerification((current) => ({ ...current, [channel]: { ...current[channel], error: "Enter the 6-digit OTP." } }));
      return;
    }
    setOtpVerification((current) => ({ ...current, [channel]: { ...current[channel], loading: true, error: "", message: "" } }));
    try {
      const response = await api.post("/client-onboarding/otp/verify", { sessionId: channelState.sessionId, otp: channelState.otp });
      const verificationToken = String(response.data?.data?.verificationToken || "");
      if (!verificationToken) throw new Error("Verification succeeded but no verification proof was returned. Please request a new OTP.");
      setOtpVerification((current) => ({ ...current, [channel]: { ...current[channel], loading: false, verified: true, verificationToken, error: "", message: response.data?.message || "Verified successfully." } }));
      setError("");
    } catch (requestError) {
      setOtpVerification((current) => ({ ...current, [channel]: { ...current[channel], loading: false, error: otpErrorMessage(requestError) } }));
    }
  };

  const startAgreementSigning = async () => {
    setAgreementLoading(true);
    setAgreementMessage("");
    const isLocalHttp = window.location.protocol === "http:" && ["localhost", "127.0.0.1"].includes(window.location.hostname);
    const signingWindow = isLocalHttp ? window.open("about:blank", "_blank") : null;
    try {
      const response = await api.post("/client-onboarding/otp/sign/start", {
        recipientName: data.repName,
        recipientEmail: data.repEmail,
        companyName: data.companyName,
        returnUrl: `${window.location.origin}${window.location.pathname}`,
      });
      const signUrl = response.data?.data?.signUrl;
      const signingState = response.data?.data?.state;
      if (!signUrl) throw new Error("Zoho Sign did not return a signing URL.");
      setAgreementState(String(signingState || ""));
      if (isLocalHttp) {
        if (!signingWindow) throw new Error("Allow pop-ups for localhost to open Zoho Sign.");
        signingWindow.location.href = signUrl;
        setAgreementMessage("Zoho Sign opened in a new tab. Complete signing there; this page will confirm it automatically.");

        for (let attempt = 0; attempt < 200; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 3000));
          const statusResponse = await api.post("/client-onboarding/otp/sign/status", { state: signingState });
          if (statusResponse.data?.data?.signed) {
            setAgreementSigned(true);
            setAgreementMessage("Agreement signed and confirmed by Zoho Sign.");
            signingWindow.close();
            setAgreementLoading(false);
            return;
          }
        }
        throw new Error("Signing confirmation timed out. Please start the agreement again.");
      }
      window.location.assign(signUrl);
    } catch (requestError) {
      signingWindow?.close();
      setAgreementMessage(otpErrorMessage(requestError));
      setAgreementLoading(false);
    }
  };

  const renderFields = () => (
    <div className="rp-field-grid grid gap-5 sm:grid-cols-2">
      {(fields[step] || []).map((field) => (
        <label key={field.name} className="rp-field group block">
          <span className={`mb-2 flex items-center justify-between text-sm font-semibold ${darkMode ? "text-slate-300" : "text-slate-700"}`}><span>{field.label}{field.required && <span className="text-pink-500"> *</span>}</span>{String(data[field.name] ?? "").trim() && !fieldErrors[field.name] && <MdCheckCircle className="text-base text-emerald-500" />}</span>
          {field.name === "state" ? (
            <>
              <select
                value={String(data.state ?? "")}
                onChange={(event) => update("state", event.target.value)}
                onBlur={() => setFieldErrors((current) => ({ ...current, state: validateField("state", data.state) }))}
                disabled={statesLoading || Boolean(statesError)}
                aria-invalid={Boolean(fieldErrors.state)}
                aria-describedby={fieldErrors.state ? "state-error" : undefined}
                className={`w-full rounded-2xl border px-4 py-3.5 text-sm font-medium outline-none transition focus:ring-4 disabled:cursor-not-allowed ${darkMode ? "border-white/10 bg-[#0c111d] text-white focus:border-violet-500 focus:ring-violet-500/10" : "border-slate-200 bg-slate-50/70 text-slate-800 focus:border-purple-400 focus:bg-white focus:ring-purple-100 disabled:bg-slate-100"} ${fieldErrors.state ? "border-red-400 bg-red-50/40 focus:border-red-400 focus:ring-red-100" : ""}`}
              >
                <option value="">{statesLoading ? "Loading states…" : "Select state"}</option>
                {states.map((state) => (
                  <option key={state.state_id} value={state.state_id}>{state.state_name}</option>
                ))}
              </select>
              {statesError && <span className="rp-field-error mt-2 flex items-center gap-1.5 text-xs font-semibold text-red-500"><MdErrorOutline className="shrink-0 text-sm" />{statesError}</span>}
              {fieldErrors.state && <span id="state-error" className="rp-field-error mt-2 flex items-center gap-1.5 text-xs font-semibold text-red-500"><MdErrorOutline className="shrink-0 text-sm" />{fieldErrors.state}</span>}
            </>
          ) : field.name === "employeeCount" ? (
            <>
              <select
                value={String(data.employeeCount ?? "")}
                onChange={(event) => update("employeeCount", event.target.value)}
                onBlur={() => setFieldErrors((current) => ({ ...current, employeeCount: validateField("employeeCount", data.employeeCount) }))}
                aria-invalid={Boolean(fieldErrors.employeeCount)}
                aria-describedby={fieldErrors.employeeCount ? "employeeCount-error" : undefined}
                className={`w-full rounded-2xl border px-4 py-3.5 text-sm font-medium outline-none transition focus:ring-4 ${darkMode ? "border-white/10 bg-[#0c111d] text-white focus:border-violet-500 focus:ring-violet-500/10" : "border-slate-200 bg-slate-50/70 text-slate-800 focus:border-purple-400 focus:bg-white focus:ring-purple-100"} ${fieldErrors.employeeCount ? "border-red-400 bg-red-50/40 focus:border-red-400 focus:ring-red-100" : ""}`}
              >
                <option value="">Select employee range</option>
                <option value="1-100">1–100 employees</option>
                <option value="101-500">101–500 employees</option>
                <option value="501-1,000">501–1,000 employees</option>
                <option value="1,001-5,000">1,001–5,000 employees</option>
                <option value="5,001+">5,001+ employees</option>
              </select>
            </>
          ) : (
            <div className="relative">
            {field.type === "tel" && <span className={`pointer-events-none absolute left-4 top-2 z-10 flex h-9 items-center border-r pr-3 text-sm font-semibold ${darkMode ? "border-slate-600 text-slate-300" : "border-slate-300 text-slate-600"}`}>+91</span>}
            <input
              type={field.type === "password" && visiblePasswords[field.name] ? "text" : field.type || "text"} value={String(data[field.name] ?? "")}
              onChange={(event) => update(field.name, event.target.value)} placeholder={field.type === "tel" ? "10-digit mobile number" : field.placeholder}
              autoComplete={field.type === "tel" ? "tel-national" : undefined}
              onBlur={() => setFieldErrors((current) => ({ ...current, [field.name]: validateField(field.name, data[field.name] ?? "") }))}
              aria-invalid={Boolean(fieldErrors[field.name])}
              aria-describedby={fieldErrors[field.name] ? `${field.name}-error` : undefined}
              className={`w-full rounded-2xl border px-4 py-3.5 text-sm font-medium outline-none transition placeholder:font-normal focus:ring-4 ${field.type === "password" ? "pr-12" : ""} ${field.type === "tel" ? "pl-[4.5rem]" : ""} ${darkMode ? "border-white/10 bg-[#0c111d] text-white placeholder:text-slate-600 focus:border-violet-500 focus:ring-violet-500/10" : "border-slate-200 bg-slate-50/70 text-slate-800 placeholder:text-slate-400 focus:border-purple-400 focus:bg-white focus:ring-purple-100"} ${fieldErrors[field.name] ? "border-red-400 bg-red-50/40 focus:border-red-400 focus:ring-red-100" : ""}`}
            />
            {field.type === "password" && <button type="button" onClick={() => setVisiblePasswords((current) => ({ ...current, [field.name]: !current[field.name] }))} className={`absolute right-3 top-2 grid h-9 w-9 place-items-center rounded-md text-xl transition ${darkMode ? "text-slate-400 hover:bg-slate-700 hover:text-white" : "text-slate-500 hover:bg-white hover:text-purple-700"}`} aria-label={visiblePasswords[field.name] ? `Hide ${field.label}` : `Show ${field.label}`} title={visiblePasswords[field.name] ? "Hide password" : "Show password"}>{visiblePasswords[field.name] ? <MdVisibilityOff /> : <MdVisibility />}</button>}
            </div>
          )}
          {field.name !== "state" && fieldErrors[field.name] && <span id={`${field.name}-error`} className="rp-field-error mt-2 flex items-center gap-1.5 text-xs font-semibold text-red-500"><MdErrorOutline className="shrink-0 text-sm" />{fieldErrors[field.name]}</span>}
        </label>
      ))}
      {step === 2 && (
        <section className="mt-3 grid gap-4 sm:col-span-2 lg:grid-cols-2">
          {([
            { channel: "email", title: "Verify email address", destination: String(data.repEmail || ""), Icon: MdEmail, hint: "We will send a 6-digit code to the representative's email." },
            ...(ENABLE_WHATSAPP_VERIFICATION ? [{ channel: "whatsapp" as const, title: "Verify WhatsApp number", destination: `+91 ${String(data.repPhone || "")}`, Icon: MdWhatsapp, hint: "We will send a separate 6-digit code through WhatsApp." }] : []),
          ] as const).map(({ channel, title, destination, Icon, hint }) => {
            const channelState = otpVerification[channel];
            return (
              <article key={channel} className={`rounded-lg border p-5 transition ${channelState.verified ? darkMode ? "border-emerald-500/40 bg-emerald-500/10" : "border-emerald-200 bg-emerald-50/60" : darkMode ? "border-slate-700 bg-slate-900/45" : "border-slate-200 bg-white"}`}>
                <div className="flex items-start gap-4"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-xl ${channelState.verified ? "bg-emerald-600 text-white" : darkMode ? "bg-purple-500/15 text-purple-300" : "bg-purple-50 text-purple-700"}`}><Icon /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{title}</h3>{channelState.verified && <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${darkMode ? "bg-emerald-500/15 text-emerald-300" : "bg-emerald-100 text-emerald-700"}`}><MdCheckCircle /> Verified</span>}</div><p className={`mt-1 truncate text-sm font-medium ${darkMode ? "text-slate-300" : "text-slate-600"}`}>{destination}</p></div></div>
                <p className={`mt-4 text-sm leading-6 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>{hint}</p>
                {!channelState.sent && !channelState.verified && <button type="button" onClick={() => void sendRepresentativeOtp(channel)} disabled={channelState.loading} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#7457d7] to-[#9a63df] px-4 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-70">{channelState.loading ? <MdAutorenew className="animate-spin text-lg" /> : <Icon className="text-lg" />}{channelState.loading ? "Sending..." : `Send ${channel === "email" ? "email" : "WhatsApp"} OTP`}</button>}
                {channelState.sent && !channelState.verified && <div className="mt-5"><div className="flex gap-2"><input inputMode="numeric" maxLength={6} value={channelState.otp} onChange={(event) => setOtpVerification((current) => ({ ...current, [channel]: { ...current[channel], otp: event.target.value.replace(/\D/g, "").slice(0, 6), error: "" } }))} placeholder="Enter 6-digit OTP" className={`min-w-0 flex-1 rounded-xl border px-4 py-3 text-center font-semibold tracking-[.25em] outline-none focus:border-purple-400 focus:ring-4 ${darkMode ? "border-slate-700 bg-slate-800 text-white focus:ring-purple-500/10" : "border-slate-200 bg-slate-50 focus:bg-white focus:ring-purple-100"}`} /><button type="button" onClick={() => void verifyRepresentativeOtp(channel)} disabled={channelState.loading} className="rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-70">{channelState.loading ? <MdAutorenew className="animate-spin text-lg" /> : "Verify"}</button></div><button type="button" onClick={() => void sendRepresentativeOtp(channel)} disabled={channelState.loading} className={`mt-3 text-sm font-semibold ${darkMode ? "text-purple-300" : "text-purple-700"}`}>Resend OTP</button></div>}
                {(channelState.message || channelState.error) && <p className={`mt-3 text-sm font-medium ${channelState.error ? "text-red-500" : channelState.verified ? "text-emerald-600" : darkMode ? "text-purple-300" : "text-purple-700"}`}>{channelState.error || channelState.message}</p>}
              </article>
            );
          })}
        </section>
      )}
      {step === 1 && (
        <label className={`group sm:col-span-2 flex cursor-pointer items-center gap-4 rounded-2xl border p-4 transition-all duration-200 ${data.officeSame ? darkMode ? "border-purple-500/60 bg-purple-500/10 shadow-[0_10px_28px_rgba(139,92,246,0.08)]" : "border-purple-300 bg-purple-50/70 shadow-[0_10px_28px_rgba(116,87,215,0.08)]" : darkMode ? "border-slate-700 bg-slate-900/45 hover:border-slate-600" : "border-slate-200 bg-white hover:border-purple-200 hover:shadow-[0_10px_25px_rgba(60,72,88,0.07)]"}`}>
          <input type="checkbox" checked={Boolean(data.officeSame)} onChange={(e) => update("officeSame", e.target.checked)} className="sr-only" />
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-xl transition ${data.officeSame ? "bg-gradient-to-br from-[#7457d7] to-[#9a63df] text-white" : darkMode ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-500 group-hover:bg-purple-50 group-hover:text-purple-600"}`}><MdLocationOn /></span>
          <span className="min-w-0 flex-1"><span className={`block text-base font-semibold ${darkMode ? "text-slate-100" : "text-slate-800"}`}>Use registered address as office address</span><span className={`mt-1 block text-sm font-normal ${darkMode ? "text-slate-400" : "text-slate-500"}`}>The office address fields will use the same details entered above.</span></span>
          <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg border text-sm transition ${data.officeSame ? "border-purple-600 bg-purple-600 text-white" : darkMode ? "border-slate-600 bg-slate-800 text-transparent" : "border-slate-300 bg-white text-transparent"}`}><Check /></span>
        </label>
      )}
    </div>
  );

  const content = () => {
    if ([0, 1, 2, 4].includes(step)) return renderFields();
    if (step === -1) return (<>
      <div className={`mx-auto grid max-w-4xl overflow-hidden rounded-3xl border lg:grid-cols-[.78fr_1.22fr] ${darkMode ? "border-slate-700 bg-slate-900/45" : "border-slate-200 bg-white shadow-[0_18px_45px_rgba(60,72,88,0.08)]"}`}>
        <aside className={`p-6 sm:p-8 ${darkMode ? "bg-purple-500/10" : "bg-gradient-to-br from-purple-50 via-white to-indigo-50"}`}>
          <span className={`grid h-12 w-12 place-items-center rounded-2xl text-2xl ${darkMode ? "bg-purple-500/15 text-purple-300" : "bg-white text-purple-700 shadow-sm"}`}><MdSecurity /></span>
          <h3 className="mt-6 text-xl font-semibold tracking-tight">Your identity stays protected</h3>
          <p className={`mt-3 text-sm leading-6 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>Only the final four Aadhaar digits are collected on this temporary screen.</p>
          <div className={`mt-6 border-t pt-5 text-sm leading-6 ${darkMode ? "border-slate-700 text-slate-400" : "border-purple-100 text-slate-500"}`}><strong className={`block font-semibold ${darkMode ? "text-slate-200" : "text-slate-700"}`}>Privacy notice</strong>Full Aadhaar details must only be handled by an approved KYC provider and are never stored here.</div>
        </aside>
        <section className="p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4"><div><p className={`text-sm font-semibold ${darkMode ? "text-purple-300" : "text-purple-700"}`}>Secure verification</p><h3 className="mt-1 text-2xl font-semibold tracking-tight">Confirm your identity</h3></div>{Boolean(data.aadhaarVerified) && <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${darkMode ? "bg-emerald-500/15 text-emerald-300" : "bg-emerald-50 text-emerald-700"}`}><MdCheckCircle className="text-base" /> Verified</span>}</div>
          <label className={`mt-7 block text-sm font-semibold ${darkMode ? "text-slate-200" : "text-slate-700"}`}>Last 4 digits of Aadhaar
            <input maxLength={4} inputMode="numeric" disabled={Boolean(data.aadhaarVerified)} value={String(data.aadhaarLast4)} onChange={(e) => update("aadhaarLast4", e.target.value.replace(/\D/g, ""))} className={`mt-2.5 w-full rounded-xl border px-5 py-4 text-xl font-semibold tracking-[.65em] outline-none transition focus:border-purple-400 focus:ring-4 disabled:cursor-not-allowed ${darkMode ? "border-slate-700 bg-slate-800 text-white focus:ring-purple-500/10 disabled:text-slate-400" : "border-slate-200 bg-slate-50 text-slate-800 focus:bg-white focus:ring-purple-100 disabled:bg-slate-100 disabled:text-slate-500"}`} placeholder="0000" />
          </label>
          <label className={`mt-5 flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${data.identityConsent ? darkMode ? "border-purple-500/50 bg-purple-500/10" : "border-purple-200 bg-purple-50/60" : darkMode ? "border-slate-700" : "border-slate-200"}`}><input type="checkbox" checked={Boolean(data.identityConsent)} onChange={(e) => update("identityConsent", e.target.checked)} className="sr-only" /><span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border text-xs ${data.identityConsent ? "border-purple-600 bg-purple-600 text-white" : darkMode ? "border-slate-600 text-transparent" : "border-slate-300 text-transparent"}`}><Check /></span><span className={`text-sm leading-6 ${darkMode ? "text-slate-300" : "text-slate-600"}`}>I authorize Reward Planners to verify my identity through an approved provider.</span></label>
          <button type="button" onClick={verifyIdentity} disabled={verifying || Boolean(data.aadhaarVerified)} className={`mt-5 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 font-semibold text-white shadow-sm transition ${data.aadhaarVerified ? "bg-emerald-600" : "bg-gradient-to-r from-[#7457d7] to-[#9a63df] hover:-translate-y-0.5 hover:shadow-[0_10px_25px_rgba(116,87,215,0.2)]"}`}>
            {verifying ? <><MdAutorenew className="h-5 w-5 animate-spin" /> Verifying...</> : data.aadhaarVerified ? <><MdCheckCircle className="h-5 w-5" /> Identity verified successfully</> : <><MdVerifiedUser className="h-5 w-5" /> Verify identity</>}
          </button>
        </section>
      </div>
      {/* verification-old
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
      </div> */}
      </>
    );
    if (step === 3) return (
      <div>
        <section className={`mb-6 overflow-hidden rounded-lg border ${agreementSigned ? darkMode ? "border-emerald-500/40 bg-emerald-500/10" : "border-emerald-200 bg-emerald-50/60" : darkMode ? "border-slate-700 bg-slate-900/45" : "border-slate-200 bg-slate-50"}`}>
          <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex items-start gap-4"><span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-2xl ${agreementSigned ? "bg-emerald-600 text-white" : darkMode ? "bg-slate-800 text-slate-300" : "bg-white text-purple-700 shadow-sm"}`}>{agreementSigned ? <MdCheckCircle /> : <MdDraw />}</span><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold">Client service agreement</h3>{agreementSigned ? <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${darkMode ? "bg-emerald-500/15 text-emerald-300" : "bg-emerald-100 text-emerald-700"}`}>Signed</span> : !REQUIRE_ZOHO_SIGNING && <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${darkMode ? "bg-amber-500/15 text-amber-300" : "bg-amber-100 text-amber-700"}`}>Temporarily optional</span>}</div><p className={`mt-1.5 max-w-2xl text-sm leading-6 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>{agreementSigned ? "Zoho Sign has confirmed your completed signature." : REQUIRE_ZOHO_SIGNING ? "Review and digitally sign the client agreement securely through Zoho Sign. You will return to this page automatically after signing." : "Zoho Sign integration is being finalized. You may continue onboarding without signing for now."}</p></div></div>
            {(REQUIRE_ZOHO_SIGNING || agreementSigned) && <button type="button" onClick={() => void startAgreementSigning()} disabled={agreementLoading || agreementSigned} className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition ${agreementSigned ? "cursor-default bg-emerald-600 text-white" : "bg-gradient-to-r from-[#7457d7] to-[#9a63df] text-white shadow-[0_10px_24px_rgba(116,87,215,0.2)] hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-70"}`}>{agreementLoading ? <><MdAutorenew className="animate-spin text-lg" /> Checking...</> : agreementSigned ? <><MdCheckCircle className="text-lg" /> Agreement signed</> : <><MdDraw className="text-lg" /> Review and sign</>}</button>}
          </div>
          {agreementMessage && <p className={`border-t px-5 py-3 text-sm font-medium sm:px-6 ${agreementSigned ? darkMode ? "border-emerald-500/20 text-emerald-300" : "border-emerald-200 text-emerald-700" : darkMode ? "border-slate-700 text-slate-400" : "border-purple-100 text-purple-700"}`}>{agreementMessage}</p>}
        </section>
        <div className="grid gap-4 md:grid-cols-2">
          {[
            { name: "terms", label: "Terms of Service", description: "I have reviewed and agree to the platform terms.", Icon: MdFactCheck },
            { name: "privacy", label: "Privacy Policy", description: "I understand how organization data is handled.", Icon: MdSecurity },
            { name: "dataConsent", label: "Data Processing Consent", description: "I authorize processing for account administration.", Icon: MdAnalytics },
            { name: "communicationConsent", label: "Communication Consent", description: "I agree to receive essential account communications.", Icon: MdGroups },
          ].map(({ name, label, description, Icon }) => {
            const checked = Boolean(data[name]);
            return (
              <label key={name} className={`group relative flex cursor-pointer items-start gap-4 rounded-lg border p-5 transition-colors duration-150 ${checked ? darkMode ? "border-slate-600 bg-slate-800/70" : "border-purple-300 bg-purple-50/60" : darkMode ? "border-slate-700 bg-slate-900/45 hover:border-slate-600" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                <input type="checkbox" checked={checked} onChange={(e) => update(name, e.target.checked)} className="sr-only" />
                <span className={`mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-xl text-xl transition ${checked ? "bg-gradient-to-br from-[#7457d7] to-[#9a63df] text-white" : darkMode ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-500 group-hover:bg-purple-50 group-hover:text-purple-600"}`}><Icon /></span>
                <span className="min-w-0 flex-1"><span className={`block text-base font-semibold ${darkMode ? "text-slate-100" : "text-slate-800"}`}>{label}</span><span className={`mt-1.5 block text-sm leading-6 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>{description}</span></span>
                <span className={`mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-lg border text-sm transition ${checked ? "border-purple-600 bg-purple-600 text-white" : darkMode ? "border-slate-600 bg-slate-800 text-transparent" : "border-slate-300 bg-white text-transparent"}`}><Check /></span>
              </label>
            );
          })}
        </div>
        <div className={`mt-5 flex items-center gap-3 rounded-xl px-4 py-3 text-sm ${darkMode ? "border border-slate-700 bg-slate-900/40 text-slate-400" : "bg-slate-100/80 text-slate-500"}`}><MdSecurity className={`shrink-0 text-lg ${darkMode ? "text-slate-400" : "text-purple-600"}`} />All four agreements are required to continue. Your selections are securely recorded with the onboarding submission.</div>
      </div>
    );
    return (
      <div className="relative min-h-[500px] overflow-hidden py-10 text-center">
        <div className="relative z-10 mx-auto max-w-3xl">
          <div className={`mx-auto grid h-20 w-20 place-items-center rounded-full border text-4xl ${darkMode ? "border-amber-500/30 bg-amber-500/10 text-amber-300" : "border-amber-200 bg-amber-50 text-amber-700"}`}><MdHourglassTop /></div>
          <p className={`mt-7 text-sm font-semibold uppercase tracking-[0.16em] ${darkMode ? "text-amber-300" : "text-amber-700"}`}>Application submitted</p>
          <h2 className={`mt-3 text-4xl font-semibold tracking-tight sm:text-5xl ${darkMode ? "text-white" : "text-slate-900"}`}>Your organization is under review</h2>
          <p className={`mx-auto mt-4 max-w-2xl text-lg leading-8 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>We have received the onboarding details for {String(data.companyName || "your organization")}. Review may take up to seven days, and the HR portal will remain unavailable until your account is approved.</p>
          <div className={`mx-auto mt-9 grid max-w-2xl border-y text-left sm:grid-cols-2 ${darkMode ? "divide-slate-700 border-slate-700 sm:divide-x" : "divide-slate-200 border-slate-200 sm:divide-x"}`}>
            <div className="px-5 py-5"><span className={`text-sm ${darkMode ? "text-slate-500" : "text-slate-400"}`}>Organization</span><strong className="mt-1 block text-base">{String(data.companyName)}</strong></div>
            <div className="px-5 py-5"><span className={`text-sm ${darkMode ? "text-slate-500" : "text-slate-400"}`}>Primary administrator</span><strong className="mt-1 block text-base">{String(data.adminEmail)}</strong></div>
            <div className="px-5 py-5"><span className={`text-sm ${darkMode ? "text-slate-500" : "text-slate-400"}`}>Account status</span><strong className={`mt-1 flex items-center gap-2 text-base ${darkMode ? "text-amber-300" : "text-amber-700"}`}><MdHourglassTop /> Pending approval</strong></div>
            <div className="px-5 py-5"><span className={`text-sm ${darkMode ? "text-slate-500" : "text-slate-400"}`}>What happens next</span><strong className="mt-1 block text-base">Approval notification by email</strong></div>
          </div>
          <p className={`mx-auto mt-7 max-w-xl text-sm leading-6 ${darkMode ? "text-slate-500" : "text-slate-500"}`}>We will send the approval decision to {String(data.adminEmail)}. Please do not submit another onboarding application for the same organization.</p>
          <div className="mt-7 flex justify-center"><button onClick={() => navigate("/login", { state: { message: "Your HR account is pending approval. Reviews may take up to 7 days." } })} className="inline-flex items-center gap-2 rounded-md bg-purple-700 px-7 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-purple-800">Return to login <MdArrowForward /></button></div>
        </div>
      </div>
    );
  };

  const descriptions = ["Tell us about your organization.", "Add the registered business address.", "Add and verify the authorized company representative.", "Review and accept the required agreements.", "Create the primary HR administrator.", "Your application has been submitted for review."];
  const prompts = ["Tell us about your business", "Where is your organization located?", "Who should we contact?", "Review your legal requirements", "Set up your workspace administrator", "Application received"];
  const representativeVerificationComplete = otpVerification.email.verified && (!ENABLE_WHATSAPP_VERIFICATION || otpVerification.whatsapp.verified);
  const legalStepComplete = (!REQUIRE_ZOHO_SIGNING || agreementSigned) && [data.terms, data.privacy, data.dataConsent, data.communicationConsent].every(Boolean);
  const interactionStyles = `@import url('https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@400;500;600;700;800&display=swap');.rp-client-onboarding{font-family:'Nunito Sans','Segoe UI',sans-serif!important}.rp-display{font-family:'Nunito Sans','Segoe UI',sans-serif}.rp-client-onboarding button:not(:disabled),.rp-client-onboarding a,.rp-client-onboarding select:not(:disabled),.rp-client-onboarding label:has(input[type="checkbox"]){cursor:pointer}.rp-client-onboarding button:disabled,.rp-client-onboarding select:disabled{cursor:not-allowed}.rp-client-onboarding button:focus-visible,.rp-client-onboarding a:focus-visible,.rp-client-onboarding input:focus-visible,.rp-client-onboarding select:focus-visible{outline:2px solid #7c3aed;outline-offset:3px}@keyframes rp-step-enter{0%{opacity:0;transform:translate3d(24px,0,0) scale(.985)}100%{opacity:1;transform:translate3d(0,0,0) scale(1)}}@keyframes rp-field-enter{0%{opacity:0;transform:translateY(10px)}100%{opacity:1;transform:translateY(0)}}@keyframes rp-error-enter{0%{opacity:0;transform:translateY(-5px)}100%{opacity:1;transform:translateY(0)}}@keyframes rp-sheen{0%{transform:translateX(-140%)}100%{transform:translateX(340%)}}@keyframes rp-active-pulse{0%,100%{box-shadow:0 0 0 0 rgba(168,85,247,.18)}50%{box-shadow:0 0 0 7px rgba(168,85,247,0)}}.rp-step-panel{transform-origin:center;animation:rp-step-enter .45s cubic-bezier(.22,1,.36,1) both}.rp-field-error{animation:rp-error-enter .22s ease-out both}.rp-progress-fill{position:relative;overflow:hidden}.rp-progress-fill:after{content:"";position:absolute;inset:0;width:35%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.8),transparent);animation:rp-sheen 2.4s ease-in-out infinite}.rp-active-step{animation:rp-active-pulse 2.4s ease-in-out infinite}.rp-field{opacity:0;animation:rp-field-enter .38s cubic-bezier(.22,1,.36,1) forwards}.rp-field:nth-child(1){animation-delay:.05s}.rp-field:nth-child(2){animation-delay:.09s}.rp-field:nth-child(3){animation-delay:.13s}.rp-field:nth-child(4){animation-delay:.17s}.rp-field:nth-child(5){animation-delay:.21s}.rp-field:nth-child(6){animation-delay:.25s}.rp-field:nth-child(7){animation-delay:.29s}.rp-field:nth-child(8){animation-delay:.33s}@media(prefers-reduced-motion:reduce){.rp-step-panel,.rp-field,.rp-field-error,.rp-progress-fill:after,.rp-active-step{animation:none;opacity:1}}`;
  if (showIntroduction) {
    const benefits = [
      { Icon: MdRedeem, title: "Meaningful rewards", text: "Create rewarding experiences that make recognition useful, timely and memorable." },
      { Icon: MdGroups, title: "Connected workforce", text: "Bring employees, HR teams and organization administrators into one shared ecosystem." },
      { Icon: MdAnalytics, title: "Clear visibility", text: "Understand participation, engagement and reward activity through one organized portal." },
      { Icon: MdSecurity, title: "Secure by design", text: "Protected account access, verified organization details and role-based workspaces." },
    ];
    return <div className={`rp-client-onboarding min-h-screen px-5 py-6 sm:px-8 lg:px-12 ${darkMode ? "bg-[#0b1020] text-white" : "bg-slate-50 text-slate-900"}`} style={{ fontFamily: 'Inter, "Segoe UI Variable", ui-sans-serif, system-ui, sans-serif' }}>
      <style>{interactionStyles}</style>
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
  const progress = Math.round((step / (steps.length - 1)) * 100);
  return (
    <div className={`rp-client-onboarding relative min-h-screen overflow-hidden ${darkMode ? "bg-[#090d17] text-white" : "bg-[#f7f5fa] text-slate-950"}`} style={{ fontFamily: 'Inter, "Segoe UI Variable", ui-sans-serif, system-ui, sans-serif' }}>
      <style>{interactionStyles}</style>
      <span className="pointer-events-none absolute -left-32 top-[-10rem] h-[30rem] w-[30rem] rounded-full bg-purple-300/25 blur-3xl" /><span className="pointer-events-none absolute -bottom-40 right-[-8rem] h-[32rem] w-[32rem] rounded-full bg-pink-300/20 blur-3xl" />
      <div className="relative mx-auto flex min-h-screen max-w-[1440px] flex-col p-3 sm:p-5 lg:flex-row lg:p-6">
        <aside className={`relative hidden w-[300px] shrink-0 flex-col overflow-hidden rounded-l-[2rem] border-y border-l p-7 lg:flex ${darkMode ? "border-white/10 bg-[#111624]" : "border-white bg-[#180d26] text-white shadow-2xl shadow-purple-950/20"}`}>
          <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_5%,rgba(168,85,247,0.45),transparent_36%),radial-gradient(circle_at_95%_90%,rgba(252,63,120,0.35),transparent_40%)]" /><span className="pointer-events-none absolute inset-0 opacity-[0.07] bg-[linear-gradient(rgba(255,255,255,.5)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.5)_1px,transparent_1px)] [background-size:38px_38px]" />
          <Link to="/login" className="relative flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-3 py-2.5 backdrop-blur-md"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white shadow-lg shadow-purple-950/40"><img src={logoImage} alt="Rewards Portal" className="h-7 w-7 object-contain" /></span><span><strong className="block text-sm text-white">Rewards Portal</strong><span className="text-[10px] uppercase tracking-[.18em] text-purple-200">Your workspace</span></span></Link>
          <div className="relative mt-12"><p className="text-[11px] font-bold uppercase tracking-[.18em] text-purple-200">Getting started</p><h1 className="rp-display mt-3 text-2xl font-semibold tracking-tight text-white">Set up your organization</h1><p className="mt-2 text-sm leading-6 text-white/55">A few details are all we need to create your secure workspace.</p></div>
          <nav className="relative mt-9 space-y-1">{steps.map((item, index) => { const available = index <= highestStep && (index <= 2 || representativeVerificationComplete) && (index <= 3 || legalStepComplete); const completed = index < highestStep && (index < 2 || representativeVerificationComplete) && (index < 3 || legalStepComplete); const current = index === step; const Icon = item.icon; return <button key={item.title} type="button" disabled={!available} onClick={() => { setStep(index); setError(""); }} className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition disabled:opacity-40 ${current ? "bg-white/10 text-white" : "text-white/55 hover:translate-x-1 hover:bg-white/5 hover:text-white"}`}><span className={`grid h-9 w-9 place-items-center rounded-xl border text-lg transition ${current ? "rp-active-step border-pink-300/30 bg-gradient-to-br from-[#8b3ab5] to-[#fc3f78] text-white" : completed ? "border-pink-300/20 bg-pink-300/10 text-pink-200" : "border-white/10 bg-white/[.04] text-white/45 group-hover:text-white/80"}`}><Icon /></span><span className="rp-display flex-1 text-sm font-semibold">{item.title}</span>{completed && !current && <Check className="text-base text-pink-200" />}{current && <MdArrowForward className="text-base text-pink-200" />}</button>; })}</nav>
          <div className="relative mt-auto rounded-2xl border border-white/10 bg-white/[.04] p-4 backdrop-blur"><div className="flex items-center justify-between text-xs"><span className="text-white/50">Overall progress</span><strong className="text-white">{progress}%</strong></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><span className="rp-progress-fill block h-full rounded-full bg-gradient-to-r from-purple-400 to-pink-400 transition-all duration-700" style={{ width: `${progress}%` }} /></div><p className="mt-3 flex items-center gap-2 text-[11px] text-white/40"><MdSecurity className="text-pink-200" /> Draft saved automatically</p></div>
        </aside>
        <section className={`flex min-w-0 flex-1 flex-col overflow-hidden rounded-[2rem] border shadow-[0_30px_90px_rgba(50,25,80,0.16)] lg:rounded-l-none ${darkMode ? "border-white/10 bg-[#111624]" : "border-white/80 bg-white"}`}>
          <header className={`flex items-center justify-between border-b px-5 py-4 sm:px-8 ${darkMode ? "border-white/10" : "border-slate-100"}`}><div className="flex items-center gap-3 lg:hidden"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#180d26] shadow-lg"><img src={logoImage} alt="Rewards Portal" className="h-7 w-7 object-contain brightness-0 invert" /></span><div><strong className="rp-display block text-sm">Organization onboarding</strong><span className={`text-[11px] ${darkMode ? "text-slate-400" : "text-slate-500"}`}>{steps[step].title}</span></div></div><div className="hidden lg:block"><p className="text-xs font-bold uppercase tracking-[.2em] text-[#a54dcc]">Organization onboarding</p><p className={`mt-1 text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Secure company registration</p></div><div className="flex items-center gap-2"><button type="button" onClick={() => setDarkMode((value) => !value)} className={`grid h-9 w-9 place-items-center rounded-full border text-lg transition ${darkMode ? "border-white/10 bg-white/5 text-amber-300 hover:bg-white/10" : "border-slate-200 bg-slate-50 text-purple-700 hover:bg-purple-50"}`} aria-label={darkMode ? "Use light mode" : "Use dark mode"} title={darkMode ? "Light mode" : "Dark mode"}>{darkMode ? <MdLightMode /> : <MdDarkMode />}</button><Link to="/login" className={`grid h-9 w-9 place-items-center rounded-full text-xl transition ${darkMode ? "text-slate-400 hover:bg-white/5" : "text-slate-500 hover:bg-slate-100"}`} aria-label="Close onboarding"><MdClose /></Link></div></header>
          <div className={`border-b px-5 py-4 lg:hidden ${darkMode ? "border-white/10" : "border-slate-100"}`}><div className="flex items-center gap-2">{steps.map((item, index) => <span key={item.title} className={`h-1.5 flex-1 rounded-full transition ${index <= step ? "bg-gradient-to-r from-violet-600 to-fuchsia-500" : darkMode ? "bg-white/10" : "bg-slate-200"}`} />)}</div><div className="mt-3 flex items-center justify-between"><span className="text-sm font-bold">{steps[step].title}</span><span className={`text-xs ${darkMode ? "text-slate-500" : "text-slate-500"}`}>{progress}% complete</span></div></div>
          <main className={`flex-1 px-4 py-5 sm:px-7 sm:py-7 lg:px-9 xl:px-12 ${darkMode ? "bg-[#0b101b]" : "bg-[#eceeef]"}`}><div className="mx-auto max-w-4xl">
            <article className={`overflow-hidden rounded-2xl border shadow-[0_8px_28px_rgba(15,23,42,0.06)] ${darkMode ? "border-white/10 bg-[#111624]" : "border-white bg-white"}`}>
              <header className={`flex items-center justify-between gap-4 border-b px-5 py-4 sm:px-7 ${darkMode ? "border-white/10" : "border-slate-100"}`}><div className="flex items-center gap-3">{step > 0 && <button type="button" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={sendingAdminWelcome} className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border text-base transition hover:-translate-x-0.5 ${darkMode ? "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10" : "border-slate-200 bg-white text-slate-500 hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700"}`} aria-label="Previous section"><MdArrowBack /></button>}<h2 className={`rp-display text-lg font-extrabold ${darkMode ? "text-white" : "text-slate-950"}`}>{steps[step].title}</h2></div><span className={`text-xs font-bold ${darkMode ? "text-purple-200" : "text-[#1d102b]"}`}>{progress}% complete</span></header>
              <div className="p-5 sm:p-7"><div className="mb-6"><h3 className={`rp-display text-sm font-extrabold ${darkMode ? "text-slate-100" : "text-slate-900"}`}>{prompts[step]}</h3><p className={`mt-1 text-xs leading-5 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>{descriptions[step]}</p></div><section key={step} className="rp-step-panel">{content()}</section>{error && <div role="alert" className={`mt-5 rounded-xl border px-4 py-3 text-sm font-semibold ${darkMode ? "border-red-500/30 bg-red-950/30 text-red-300" : "border-red-200 bg-red-50 text-red-700"}`}>{error}</div>}</div>
              {step < steps.length - 1 && <footer className={`flex items-center justify-between border-t px-5 py-4 sm:px-7 ${darkMode ? "border-white/10 bg-white/[.02]" : "border-slate-100 bg-slate-50/50"}`}><p className={`hidden items-center gap-2 text-xs sm:flex ${darkMode ? "text-slate-500" : "text-slate-400"}`}><MdSecurity className="text-pink-400" /> Encrypted and saved automatically</p><button type="button" onClick={() => void next()} disabled={(step === 2 && !representativeVerificationComplete) || (step === 3 && !legalStepComplete) || sendingAdminWelcome} title={step === 2 && !representativeVerificationComplete ? "Verify contact details to continue" : step === 3 && !legalStepComplete ? "Complete legal requirements to continue" : undefined} className={`group ml-auto inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-extrabold shadow-lg transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55 ${darkMode ? "bg-white text-[#1d102b] hover:bg-purple-100" : "bg-[#1d102b] text-white shadow-[0_8px_20px_rgba(29,16,43,0.2)] hover:bg-[#852baf]"}`}>{sendingAdminWelcome ? <><MdAutorenew className="animate-spin text-base" /> Sending...</> : step === 2 && !representativeVerificationComplete ? "Complete verification" : step === 3 && !legalStepComplete ? "Complete requirements" : step === 4 ? "Complete onboarding" : "Next and save"}{!sendingAdminWelcome && <MdArrowForward className="text-base transition group-hover:translate-x-1" />}</button></footer>}
            </article>
          </div></main>
        </section>
      </div>
    </div>
  );
}
