import { useState, useEffect } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type { ComponentType } from "react";
// import { useNavigate, useParams } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import {
  FaBuilding,
  FaAddressBook,
  FaCreditCard,
  FaShippingFast,
  FaUniversity,
  FaFileContract,
  FaFileUpload,
} from "react-icons/fa";
import { api } from "../../../../api/api";

// const BASE_UPLOAD_URL = "https://rewardplanners.com/api/crm/uploads";

/* ================= TYPES ================= */

interface VendorOnboardingData {
  companyName: string;
  fullName: string;
  vendorType:
    | "Manufacturer"
    | "Trader"
    | "Distributor"
    | "Service Provider"
    | "";
  gstin: string;
  panNumber: string;
  // ip_address: string;

  gstinFile: File | null;
  panFile: File | null;
  bankProofFile: File | null;
  signatoryIdFile: File | null;
  businessProfileFile: File | null;
  vendorAgreementFile: File | null;
  brandLogoFile: File | null;
  authorizationLetterFile: File | null;
  electricityBillFile: File | null;
  rightsAdvisoryFile: File | null;
  nocFile: File | null;

  agreementAccepted: boolean;
  addressLine1: string;
  addressLine2: string;
  addressLine3: string;
  city: string;
  state: number | "";
  pincode: string;

  billingAddressLine1: string;
  billingAddressLine2: string;
  billingCity: string;
  billingState: number | "";
  billingPincode: string;

  shippingAddressLine1: string;
  shippingAddressLine2: string;
  shippingCity: string;
  shippingState: number | "";
  shippingPincode: string;

  bankName: string;
  accountNumber: string;
  branch: string;
  ifscCode: string;

  primaryContactNumber: string;
  email: string;
  alternateContactNumber: string;

  paymentTerms: string;
  comments: string;
}

interface State {
  state_id: number;
  state_name: string;
}

/* ================= INITIAL STATE ================= */

const initialFormData: VendorOnboardingData = {
  companyName: "",
  fullName: "",
  vendorType: "",
  gstin: "",
  panNumber: "",
  // ip_address: "",

  gstinFile: null,
  panFile: null,
  bankProofFile: null,
  signatoryIdFile: null,
  businessProfileFile: null,
  vendorAgreementFile: null,
  brandLogoFile: null,
  authorizationLetterFile: null,
  electricityBillFile: null,
  rightsAdvisoryFile: null,
  nocFile: null,

  agreementAccepted: false,
  addressLine1: "",
  addressLine2: "",
  addressLine3: "",
  city: "",
  state: "",
  pincode: "",

  billingAddressLine1: "",
  billingAddressLine2: "",
  billingCity: "",
  billingState: "",
  billingPincode: "",

  shippingAddressLine1: "",
  shippingAddressLine2: "",
  shippingCity: "",
  shippingState: "",
  shippingPincode: "",

  bankName: "",
  accountNumber: "",
  branch: "",
  ifscCode: "",

  primaryContactNumber: "",
  email: "",
  alternateContactNumber: "",

  paymentTerms: "",
  comments: "",
};

/* ================= SMALL UI HELPERS (added) ================= */

type IconComp = ComponentType<any>;

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: IconComp;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex items-center space-x-4 pb-4 border-b border-gray-100 mb-6">
      <div className="p-4 text-white rounded-2xl" style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)", boxShadow: "0 6px 20px rgba(133,43,175,0.25)" }}>
        <Icon className="text-2xl sm:text-3xl" />
      </div>
      <div>
        <h3 className="text-xl font-bold text-gray-800">{title}</h3>
        {description && (
          <p className="text-sm text-gray-500 font-medium">{description}</p>
        )}
      </div>
    </div>
  );
}

function FormInput(props: {
  id: string;
  label: string;
  value?: string | number;
  onChange: (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
  error?: string;
}) {
  const {
    id,
    label,
    value = "",
    onChange,
    type = "text",
    required,
    placeholder,
    error,
  } = props;
  return (
    <div className="flex flex-col space-y-1.5">
      <label
        htmlFor={id}
        className="text-xs font-bold uppercase tracking-wider text-gray-600 ml-1"
      >
        {label} {required && <span className="text-[#FC3F78]">*</span>}
      </label>
      <input
        id={id}
        name={id}
        value={value}
        onChange={onChange}
        type={type}
        placeholder={placeholder}
        required={required}
        className="px-4 py-3 bg-gray-50/50 border border-gray-200 rounded-xl focus:ring-4 focus:ring-[#852BAF]/20 focus:border-[#852BAF] focus:bg-white transition-all outline-none text-sm text-gray-800 placeholder:text-gray-400"
      />
      {error && (
        <p className="text-[10px] font-bold text-[#FC3F78] mt-1 ml-1 uppercase">
          {error}
        </p>
      )}
    </div>
  );
}

function FileUploadInput(props: {
  id: string;
  label: string;
  file: File | null;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  accept?: string;
  required?: boolean;
  description?: string;
}) {
  const { id, label, file, onChange, accept, required, description } = props;
  return (
    <div className="flex flex-col space-y-1.5">
      <label className="text-xs font-bold uppercase tracking-wider text-gray-600 ml-1">
        {label} {required && <span className="text-[#FC3F78]">*</span>}
      </label>
      <div className="relative group">
        <input
          id={id}
          name={id}
          type="file"
          accept={accept}
          onChange={onChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        />
        <div
          className={`p-3 border-2 border-dashed rounded-xl transition-all flex flex-col items-center justify-center bg-gray-50/50 
          ${
            file
              ? "border-emerald-200 bg-emerald-50/30"
              : "border-gray-200 group-hover:border-[#852BAF]/40 group-hover:bg-gray-50"
          }`}
        >
          <FaFileUpload
            className={`text-xl mb-1 ${
              file ? "text-emerald-500" : "text-gray-400"
            }`}
          />
          <span
            className="text-[11px] font-bold text-gray-500 text-center 
                 truncate w-full px-2 block max-w-full"
          >
            {file ? file.name : "Click to upload document"}
          </span>
        </div>
      </div>
      {description && (
        <p className="text-[10px] text-gray-400 italic leading-tight">
          {description}
        </p>
      )}
    </div>
  );
}

function DocumentUploadRow({
  label,
  docKey,
  existingDoc,
  file,
  onChange,
  required = false,
  accept = "image/*,application/pdf",
}: DocumentUploadRowProps) {
  // const fileUrl = existingDoc
  //   ? `${BASE_UPLOAD_URL}/${existingDoc.file_path}`
  //   : null;
  const fileUrl = existingDoc?.url || null;

  const isImage = existingDoc?.mime_type?.startsWith("image/");

  return (
    <div className="space-y-2">
      {/* Label */}
      <label className="block text-sm font-semibold text-gray-800">
        {label} {required && <span className="text-red-500">*</span>}
      </label>

      {/* Bordered container for preview + upload */}
      <div className="flex items-start gap-4 border border-gray-200 rounded-xl p-4 bg-white min-w-0">
        {/* Existing preview */}
        <div
          className="flex-shrink-0 w-28 h-28 bg-gray-50 rounded-lg 
                flex items-center justify-center 
                overflow-hidden"
        >
          {existingDoc ? (
            isImage ? (
              <a href={fileUrl!} target="_blank" rel="noreferrer">
                <img
                  src={fileUrl!}
                  alt={label}
                  className="w-full h-full object-contain rounded-lg"
                />
              </a>
            ) : (
              <a
                href={fileUrl!}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 text-sm underline text-center"
              >
                View document
              </a>
            )
          ) : (
            <span className="text-xs text-gray-400 text-center">
              No document
            </span>
          )}
        </div>

        {/* Upload button */}
        <div className="flex-1 min-w-0">
          <FileUploadInput
            id={docKey}
            label={`Upload new ${label}`}
            file={file}
            onChange={onChange}
            accept={accept}
            required={required}
          />
        </div>
      </div>

      {/* Helper text */}
      {existingDoc && (
        <p className="text-xs text-gray-500">
          Uploading a new file will replace the existing document
        </p>
      )}
    </div>
  );
}

const mapBackendToForm = (data: any): VendorOnboardingData => {
  const { vendor, addresses, bank, contacts } = data;

  const getAddress = (type: string, key: string) =>
    addresses?.find((a: any) => a.type === type)?.[key] || "";

  return {
    companyName: vendor.company_name || "",
    fullName: vendor.full_name || "",
    vendorType: vendor.vendor_type || "",
    gstin: vendor.gstin || "",
    panNumber: vendor.pan_number || "",
    // ip_address: vendor.ipaddress || "",

    // FILES MUST BE NULL
    gstinFile: null,
    panFile: null,
    bankProofFile: null,
    signatoryIdFile: null,
    businessProfileFile: null,
    vendorAgreementFile: null,
    brandLogoFile: null,
    authorizationLetterFile: null,
    electricityBillFile: null,
    rightsAdvisoryFile: null,
    nocFile: null,

    agreementAccepted: Boolean(
      data.documents?.some(
        (doc: any) => doc.document_key === "vendorAgreementFile",
      ),
    ),

    addressLine1: getAddress("business", "line1"),
    addressLine2: getAddress("business", "line2"),
    addressLine3: getAddress("business", "line3"),
    city: getAddress("business", "city"),
    state: getAddress("business", "state_id") || "",
    pincode: getAddress("business", "pincode"),

    billingAddressLine1: getAddress("billing", "line1"),
    billingAddressLine2: getAddress("billing", "line2"),
    billingCity: getAddress("billing", "city"),
    billingState: getAddress("billing", "state_id") || "",
    billingPincode: getAddress("billing", "pincode"),

    shippingAddressLine1: getAddress("shipping", "line1"),
    shippingAddressLine2: getAddress("shipping", "line2"),
    shippingCity: getAddress("shipping", "city"),
    shippingState: getAddress("shipping", "state_id") || "",
    shippingPincode: getAddress("shipping", "pincode"),

    bankName: bank?.bank_name || "",
    accountNumber: bank?.account_number || "",
    branch: bank?.branch || "",
    ifscCode: bank?.ifsc_code || "",

    primaryContactNumber: contacts?.primary_contact || "",
    email: contacts?.email || "",
    alternateContactNumber: contacts?.alternate_contact || "",

    paymentTerms: contacts?.payment_terms || "",
    comments: contacts?.comments || "",
  };
};

type ExistingDocument = {
  document_key: string;
  file_path: string;
  mime_type: string;
  url?: string;
};

type DocumentUploadRowProps = {
  label: string;
  docKey: string;
  existingDoc?: ExistingDocument;
  file: File | null;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  accept?: string;
};

/* ================= MAIN COMPONENT ================= */

export default function Onboarding() {
  const navigate = useNavigate();

  const [existingDocs, setExistingDocs] = useState<
    Record<string, ExistingDocument>
  >({});
  const [formData, setFormData] =
    useState<VendorOnboardingData>(initialFormData);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [states, setStates] = useState<State[]>([]);

  const [vendorStatus, setVendorStatus] = useState<
    "pending" | "sent_for_approval" | "approved" | "rejected" | null
  >(null);

  const [rejectionReason, setRejectionReason] = useState("");
  const [loadingStatus, setLoadingStatus] = useState(true);

  // NEW local UI checkbox states & handlers
  const [isSameAsAddress, setIsSameAsAddress] = useState(false);
  const [isSameAsBilling, setIsSameAsBilling] = useState(false);

  /* ================= VALIDATORS ================= */

  const allowOnlyAlphabets = (value: string) => /^[A-Za-z ]*$/.test(value);

  const allowOnlyNumbers = (value: string) => /^[0-9]*$/.test(value);

  const allowAddressChars = (value: string) =>
    /^[A-Za-z0-9\s,./-]*$/.test(value);

  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

  const validators = {
    // fullName: (value: string) => /^[A-Za-z ]+$/.test(value),
    panNumber: (value: string) => /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(value),
    pincode: (value: string) => /^[0-9]{6}$/.test(value),
    phone: (value: string) => /^[0-9]{10}$/.test(value),
    // state: (value: string) => /^[A-Za-z ]+$/.test(value),
    email: (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value),
  };

  /* ================= FIELD VALIDATION ================= */

  const validateField = (
    name: string,
    value: any,
    // @ts-expect-error
    formData: VendorOnboardingData,
    flags: {
      isSameAsAddress: boolean;
      isSameAsBilling: boolean;
    },
  ): string => {
    switch (name) {
      // case "companyName":
      //   return value.trim() ? "" : "Company Name is required";

      // case "fullName":
      //   if (!value.trim()) return "Full Name is required";
      //   if (!validators.fullName(value)) return "Only alphabets allowed";
      //   return "";

      case "companyName":
        if (!value.trim()) return "Company Name is required";
        return "";

      case "fullName":
        if (!value.trim()) return "Full Name is required";
        return "";

      case "vendorType":
        return value ? "" : "Select user type";

      case "gstin":
        return value.trim() ? "" : "GSTIN is required";

      case "panNumber":
        if (!value.trim()) return "PAN Number is required";
        if (!validators.panNumber(value.toUpperCase()))
          return "PAN must be in format ABCDE1234F";
        return "";

      case "email":
        if (!value.trim()) return "Email is required";
        if (!validators.email(value)) return "Enter a valid email";
        return "";

      case "primaryContactNumber":
        if (!value.trim()) return "Primary contact is required";
        if (!validators.phone(value)) return "Contact number must be 10 digits";
        return "";

      case "pincode":
      case "billingPincode":
      case "shippingPincode":
        if (!value.trim()) return "Pincode is required";
        if (!validators.pincode(value)) return "Pincode must be 6 digits";
        return "";

      case "state":
        return value ? "" : "State is required";

      case "billingAddressLine1":
      case "billingCity":
      case "billingState":
        if (!flags.isSameAsAddress && !value)
          return "Billing state is required";
        return "";

      case "shippingAddressLine1":
      case "shippingCity":
      case "shippingState":
        if (!flags.isSameAsBilling && !value)
          return "Shipping state is required";
        return "";

      case "bankName":
        return value.trim() ? "" : "Bank name is required";

      case "accountNumber":
        return value.trim() ? "" : "Account number is required";

      case "branch":
        return value.trim() ? "" : "Branch is required";

      case "ifscCode":
        return value.trim() ? "" : "IFSC code is required";

      default:
        return "";
    }
  };

  /* ================= FORM VALIDATION ================= */

  const validateForm = (formData: VendorOnboardingData) => {
    const newErrors: Record<string, string> = {};

    Object.entries(formData).forEach(([key, value]) => {
      const error = validateField(key, value, formData, {
        isSameAsAddress,
        isSameAsBilling,
      });

      if (error) newErrors[key] = error;
    });

    if (
      formData.agreementAccepted &&
      !formData.vendorAgreementFile &&
      !existingDocs.vendorAgreementFile
    ) {
      newErrors.vendorAgreementFile = "Please upload the signed agreement";
    }

    if (!formData.agreementAccepted && formData.vendorAgreementFile) {
      newErrors.agreementAccepted =
        "Please accept the agreement to upload the signed document";
    }

    setErrors(newErrors);
    return newErrors;
  };

  /* ================= FETCH STATES ================= */
  useEffect(() => {
    const fetchStates = async () => {
      try {
        const res = await api.get("/auth/all-states");
        if (res.data.success) {
          setStates(res.data.data);
        }
      } catch (err) {
        console.error("Failed to load states", err);
      }
    };

    fetchStates();
  }, []);

  /* ================= FETCH STATUS ================= */
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const statusRes = await api.get("/vendor/my-details");

        if (statusRes.data?.success) {
          const status = statusRes.data.vendor.status;
          setVendorStatus(status);
          setRejectionReason(statusRes.data.vendor.rejection_reason || "");

          //  THIS IS THE IMPORTANT PART
          if (status === "rejected" || status === "sent_for_approval") {
            const detailRes = await api.get("/vendor/onboarding-data");

            if (detailRes.data?.success) {
              const apiData = detailRes.data.data;

              const mapped = mapBackendToForm(apiData);
              setFormData(mapped);

              const docsMap: Record<string, ExistingDocument> = {};
              apiData.documents?.forEach((doc: ExistingDocument) => {
                docsMap[doc.document_key] = doc;
              });

              setExistingDocs(docsMap);
            }
          }
        }
      } catch (err) {
        console.error("Failed to load onboarding data", err);
      } finally {
        setLoadingStatus(false);
      }
    };

    fetchInitialData();
  }, []);

  /* ================= HANDLERS ================= */

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value, type, checked, files } = e.target as HTMLInputElement;

    /* FILE */
    if (type === "file") {
      if (name === "vendorAgreementFile" && !formData.agreementAccepted) {
        Swal.fire({
          icon: "warning",
          title: "Agreement not accepted",
          text: "Please accept the user Agreement before uploading the signed document.",
          confirmButtonText: "OK",
        });
        return;
      }

      setFormData((p) => ({ ...p, [name]: files?.[0] || null }));
      return;
    }

    /* CHECKBOX */
    if (type === "checkbox") {
      setFormData((p) => ({ ...p, [name]: checked }));
      return;
    }

    /* ================= HARD BLOCK RULES ================= */

    // Alphabet-only fields
    const alphabetOnlyFields = [
      // "fullName",
      // "companyName",
      // "state",
      // "billingState",
      // "shippingState",
      "city",
      "billingCity",
      "shippingCity",
      "bankName",
      "branch",
    ];

    if (alphabetOnlyFields.includes(name)) {
      if (!allowOnlyAlphabets(value)) return;
    }

    // Address fields (allow text + numbers, no special chars)
    const addressFields = [
      "addressLine1",
      "addressLine2",
      "addressLine3",
      "billingAddressLine1",
      "billingAddressLine2",
      "shippingAddressLine1",
      "shippingAddressLine2",
    ];

    if (addressFields.includes(name)) {
      if (!allowAddressChars(value)) return;
    }

    /*  HANDLE STATE DROPDOWNS PROPERLY */
    const stateFields = ["state", "billingState", "shippingState"];

    if (stateFields.includes(name)) {
      setFormData((prev) => ({
        ...prev,
        [name]: value === "" ? "" : Number(value),
      }));
      return;
    }

    // Numbers-only fields
    const numberOnlyFields = [
      "pincode",
      "billingPincode",
      "shippingPincode",
      "accountNumber",
      "primaryContactNumber",
      "alternateContactNumber",
    ];

    if (numberOnlyFields.includes(name)) {
      if (!allowOnlyNumbers(value)) return;

      // length limits
      if (
        ["primaryContactNumber", "alternateContactNumber"].includes(name) &&
        value.length > 10
      )
        return;

      if (
        ["pincode", "billingPincode", "shippingPincode"].includes(name) &&
        value.length > 6
      )
        return;
    }

    // PAN – uppercase + length control
    if (name === "panNumber") {
      if (!/^[A-Za-z0-9]*$/.test(value)) return;
      if (value.length > 10) return;
    }

    /* ================= SOFT VALIDATION ================= */

    let error = "";

    // if (name === "fullName" && value && !allowOnlyAlphabets(value)) {
    //   error = "Only alphabets allowed";
    // }

    if (name === "panNumber" && value && !panRegex.test(value.toUpperCase())) {
      error = "PAN must be in format ABCDE1234F";
    }

    if (
      ["pincode", "billingPincode", "shippingPincode"].includes(name) &&
      value.length === 6 &&
      !/^[0-9]{6}$/.test(value)
    ) {
      error = "Pincode must be 6 digits";
    }

    if (
      ["primaryContactNumber", "alternateContactNumber"].includes(name) &&
      value.length === 10 &&
      !/^[0-9]{10}$/.test(value)
    ) {
      error = "Contact number must be 10 digits";
    }

    setErrors((prev) => ({ ...prev, [name]: error }));

    setFormData((prev) => ({
      ...prev,
      [name]: name === "panNumber" ? value.toUpperCase() : value,
    }));
  };

  const handleVendorTypeChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value as VendorOnboardingData["vendorType"];
    setFormData((p) => ({ ...p, vendorType: v }));
  };

  const handleCheckboxChange = (which: "billing" | "shipping") => {
    if (which === "billing") {
      const next = !isSameAsAddress;
      setIsSameAsAddress(next);
      if (next) {
        setFormData((p) => ({
          ...p,
          billingAddressLine1: p.addressLine1,
          billingAddressLine2: p.addressLine2,
          billingCity: p.city,
          billingState: p.state,
          billingPincode: p.pincode,
        }));
      } else {
        setFormData((p) => ({
          ...p,
          billingAddressLine1: "",
          billingAddressLine2: "",
          billingCity: "",
          billingState: "",
          billingPincode: "",
        }));
      }
    } else {
      const next = !isSameAsBilling;
      setIsSameAsBilling(next);
      if (next) {
        setFormData((p) => ({
          ...p,
          shippingAddressLine1: p.billingAddressLine1,
          shippingAddressLine2: p.billingAddressLine2,
          shippingCity: p.billingCity,
          shippingState: p.billingState,
          shippingPincode: p.billingPincode,
        }));
      } else {
        setFormData((p) => ({
          ...p,
          shippingAddressLine1: "",
          shippingAddressLine2: "",
          shippingCity: "",
          shippingState: "",
          shippingPincode: "",
        }));
      }
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const validationErrors = validateForm(formData);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      await Swal.fire({
        icon: "error",
        title: "Please fix the errors",
        text: "Some required fields are missing or invalid.",
        confirmButtonText: "OK",
        buttonsStyling: false,
        customClass: {
          popup: "rounded-full",
          confirmButton:
            "px-6 py-2 rounded-full font-bold text-white bg-[#852BAF] hover:bg-linear-to-r hover:from-[#852BAF] hover:to-[#FC3F78] transition-all duration-300 cursor-pointer active:scale-95",
        },
      });
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      await Swal.fire({
        icon: "warning",
        title: "Not logged in",
        text: "Please login first and try again.",
        confirmButtonText: "OK",
        buttonsStyling: false,
        customClass: {
          popup: "rounded-full",
          confirmButton:
            "px-6 py-2 rounded-full font-bold text-white bg-[#852BAF] hover:bg-linear-to-r hover:from-[#852BAF] hover:to-[#FC3F78] transition-all duration-300 cursor-pointer active:scale-95",
        },
      });
      return;
    }

    try {
      const form = new FormData();
      Object.entries(formData).forEach(([k, v]) => {
        if (v instanceof File) form.append(k, v);
        else if (v !== null) form.append(k, String(v));
      });

      const res = await api.post("/vendor/onboard", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (!res.data.success) {
        await Swal.fire({
          icon: "error",
          title: "Submission Failed",
          text: res.data.message || "Something went wrong.",
          confirmButtonText: "OK",
          buttonsStyling: false,
          customClass: {
            popup: "rounded-full",
            confirmButton:
              "px-6 py-2 rounded-full font-bold text-white bg-[#852BAF] hover:bg-linear-to-r hover:from-[#852BAF] hover:to-[#FC3F78] transition-all duration-300 cursor-pointer active:scale-95",
          },
        });
        return;
      }

      await Swal.fire({
        icon: "success",
        title: "Submitted Successfully!",
        text: "Onboarding submitted successfully.",
        timer: 1200,
        showConfirmButton: false,
        customClass: { popup: "rounded-full" },
      });

      navigate("/vendor/dashboard");
    } catch (err: any) {
      await Swal.fire({
        icon: "error",
        title: "Server Error",
        text:
          err?.response?.data?.message ||
          err?.message ||
          "Something went wrong.",
        confirmButtonText: "OK",
        buttonsStyling: false,
        customClass: {
          popup: "rounded-full",
          confirmButton:
            "px-6 py-2 rounded-full font-bold text-white bg-[#852BAF] hover:bg-linear-to-r hover:from-[#852BAF] hover:to-[#FC3F78] transition-all duration-300 cursor-pointer active:scale-95",
        },
      });
    }
  };

  const isReadOnly = vendorStatus === "sent_for_approval";

  /* ================= UI ================= */
  return (
    <div className="max-w-6xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      {/* Header Section */}
      <div className="mb-8 text-left">
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
          Complete Your{" "}
          <span className="gradient-text-brand">Onboarding</span>
        </h1>
        {/* <p className="text-gray-500 mt-2 font-medium">
          Verify your business details to start selling.
        </p> */}
      </div>

      {/* alerts */}
      {loadingStatus && (
        <div className="p-4 mb-6 text-sm text-blue-800 bg-blue-100 rounded-lg">
          Checking onboarding status...
        </div>
      )}

      {vendorStatus === "sent_for_approval" && (
        <div className="p-6 mb-6 text-yellow-800 bg-yellow-100 border border-yellow-300 rounded-xl">
          <h3 className="text-lg font-semibold">Application Under Review</h3>
          <p className="mt-2">
            Your onboarding application has been submitted and is currently
            being reviewed by the manager.
          </p>
        </div>
      )}

      {vendorStatus === "approved" && (
        <div className="p-6 mb-6 text-green-800 bg-green-100 border border-green-300 rounded-xl">
          <h3 className="text-lg font-semibold">Onboarding Completed</h3>
          <p className="mt-2">
            Your onboarding details  has already been approved successfully.
          </p>
        </div>
      )}

      {vendorStatus === "rejected" && (
        <div className="p-6 mb-6 text-red-800 bg-red-100 border border-red-300 rounded-xl">
          <h3 className="text-lg font-semibold">Application Rejected</h3>
          <p className="mt-2">
            Your onboarding request was rejected.
            {rejectionReason && (
              <>
                <br />
                <span className="font-medium">Reason:</span> {rejectionReason}
              </>
            )}
          </p>
          <p className="mt-2">Please fix the issue and resubmit the form.</p>
        </div>
      )}

      {!loadingStatus && vendorStatus === null && (
        <div className="p-4 mb-6 text-red-800 bg-red-100 border border-red-300 rounded-lg">
          Unable to fetch onboarding status. Please refresh or contact support.
        </div>
      )}

      {!loadingStatus && vendorStatus !== "approved" && (
        <form
          onSubmit={handleSubmit}
          className="space-y-8"
          style={isReadOnly ? { pointerEvents: "none", opacity: 0.8 } : {}}
        >
          {/* A. Business Information */}
          <section className="space-y-4 bg-white/95 backdrop-blur-xl rounded-2xl p-6 sm:p-8 shadow-lg hover:shadow-2xl transition-shadow duration-300">
            <SectionHeader
              icon={FaBuilding}
              title="Business Information & Documents"
              description="Upload supporting business documents if available."
            />
            <div className="grid grid-cols-1 gap-7 md:grid-cols-2 lg:grid-cols-3">
              <FormInput
                id="companyName"
                label="Company Name"
                value={formData.companyName}
                onChange={handleChange}
                required
              />
              <FormInput
                id="fullName"
                label="Full Name (as per PAN Card)"
                value={formData.fullName}
                onChange={handleChange}
                required
                error={errors.fullName}
              />
              {/* Vendor Type Dropdown */}
              {/* <div className="flex flex-col space-y-1">
                <label
                  htmlFor="vendorType"
                  className="text-sm font-medium text-gray-700 cursor-pointer"
                >
                  Vendor Type <span className="text-red-500">*</span>
                </label>
                <select
                  id="vendorType"
                  name="vendorType"
                  value={formData.vendorType}
                  onChange={handleVendorTypeChange}
                  required
                  className="w-full px-4 py-3 bg-gray-50/50 border border-gray-200 rounded-xl focus:ring-4 focus:ring-[#852BAF]/20 focus:border-[#852BAF] focus:bg-white transition-all outline-none text-sm text-gray-800"
                >
                  <option value="">Select vendor type</option>
                  <option value="Manufacturer">Manufacturer</option>
                  <option value="Trader">Trader</option>
                  <option value="Distributor">Distributor</option>
                  <option value="Service Provider">Service Provider</option>
                </select>
              </div> */}
              <FormInput
                id="gstin"
                label="GSTIN"
                value={formData.gstin}
                onChange={handleChange}
                required
              />
              <FormInput
                id="panNumber"
                label="PAN Number"
                value={formData.panNumber}
                onChange={handleChange}
                required
                error={errors.panNumber}
              />
              {/* <FormInput
                id="ip_address"
                label="IP Address"
                value={formData.ip_address}
                onChange={handleChange}
              /> */}
              {/* File uploads: only the common docs */}
              {/* GST */}
              <div className="col-span-1 md:col-span-2 lg:col-span-3">
                <div className="grid grid-cols-1 gap-7 md:grid-cols-2 lg:grid-cols-3">
                  <DocumentUploadRow
                    label="GST Certificate"
                    docKey="gstinFile"
                    existingDoc={existingDocs["gstinFile"]}
                    file={formData.gstinFile}
                    onChange={handleChange}
                    required={false}
                  />
                  {/* Pan */}
                  <DocumentUploadRow
                    label="PAN Card"
                    docKey="panFile"
                    existingDoc={existingDocs["panFile"]}
                    file={formData.panFile}
                    onChange={handleChange}
                    required={false}
                  />
                  {/* Noc */}
                  <DocumentUploadRow
                    label="NOC"
                    docKey="nocFile"
                    existingDoc={existingDocs["nocFile"]}
                    file={formData.nocFile}
                    onChange={handleChange}
                    required={false}
                  />
                  {/* Trademark File */}
                  <DocumentUploadRow
                    label="Trademark Certificate"
                    docKey="rightsAdvisoryFile"
                    existingDoc={existingDocs["rightsAdvisoryFile"]}
                    file={formData.rightsAdvisoryFile}
                    onChange={handleChange}
                    required={false}
                  />
                  {/* Signatory ID */}
                  <DocumentUploadRow
                    label="Authorized Signatory ID Proof"
                    docKey="signatoryIdFile"
                    existingDoc={existingDocs["signatoryIdFile"]}
                    file={formData.signatoryIdFile}
                    onChange={handleChange}
                  />
                  {/* Business profile */}
                  <DocumentUploadRow
                    label="Business Profile"
                    docKey="businessProfileFile"
                    existingDoc={existingDocs["businessProfileFile"]}
                    file={formData.businessProfileFile}
                    onChange={handleChange}
                  />
                  {/* Brand logo - required for Manufacturer and Trader */}
                  <DocumentUploadRow
                    label="Brand Logo"
                    docKey="brandLogoFile"
                    existingDoc={existingDocs["brandLogoFile"]}
                    file={formData.brandLogoFile}
                    onChange={handleChange}
                  />
                  {/* Bank proof - cancelled cheque or passbook image */}
                  <DocumentUploadRow
                    label="Bank Cancelled Cheque"
                    docKey="bankProofFile"
                    existingDoc={existingDocs["bankProofFile"]}
                    file={formData.bankProofFile}
                    onChange={handleChange}
                  />
                  {/* Electricity */}
                  <DocumentUploadRow
                    label="Electricity bill"
                    docKey="electricityBillFile"
                    existingDoc={existingDocs["electricityBillFile"]}
                    file={formData.electricityBillFile}
                    onChange={handleChange}
                  />
                  {/* Vendor agreement - checkbox + optional upload */}
                  <div className="col-span-1 md:col-span-2 lg:col-span-3">
                    {/* <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={formData.agreementAccepted}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            agreementAccepted: e.target.checked,
                          }))
                        }
                      />
                      <label className="text-sm mb-4">
                        I have read and agree to the Vendor Agreement
                      </label>
                    </div> */}

                    {errors.agreementAccepted && (
                      <p className="text-xs text-red-500 mt-1">
                        {errors.agreementAccepted}
                      </p>
                    )}

                    <DocumentUploadRow
                      label="Signed Agreement"
                      docKey="vendorAgreementFile"
                      existingDoc={existingDocs["vendorAgreementFile"]}
                      file={formData.vendorAgreementFile}
                      onChange={handleChange}
                      required={false}
                    />

                    {errors.vendorAgreementFile && (
                      <p className="text-xs text-red-500 mt-1">
                        {errors.vendorAgreementFile}
                      </p>
                    )}
                  </div>

                  {/* Conditional: Authorization letter (Trader only) */}
                  {formData.vendorType === "Trader" && (
                    <DocumentUploadRow
                      label="Authorization / Dealership Letter"
                      docKey="authorizationLetterFile"
                      existingDoc={existingDocs["authorizationLetterFile"]}
                      file={formData.authorizationLetterFile}
                      onChange={handleChange}
                      required={false}
                    />
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Address Sections */}
          <section className="space-y-4 bg-white/95 backdrop-blur-xl rounded-2xl p-6 sm:p-8 shadow-lg hover:shadow-2xl transition-shadow duration-300">
            <SectionHeader
              icon={FaAddressBook}
              title="Registered Address"
              description="The official registered address of your business."
            />
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              <FormInput
                id="addressLine1"
                label="Address Line 1"
                value={formData.addressLine1}
                onChange={handleChange}
                required
              />
              <FormInput
                id="addressLine2"
                label="Address Line 2"
                value={formData.addressLine2}
                onChange={handleChange}
              />
              <FormInput
                id="addressLine3"
                label="Address Line 3"
                value={formData.addressLine3}
                onChange={handleChange}
              />

              <FormInput
                id="city"
                label="City"
                value={formData.city}
                onChange={handleChange}
                required
              />
              {/* <FormInput
                id="state"
                label="State"
                value={formData.state}
                onChange={handleChange}
                required
              /> */}
              <div className="flex flex-col space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-600 ml-1">
                  State <span className="text-[#FC3F78]">*</span>
                </label>
                <select
                  name="state"
                  id="state"
                  value={formData.state}
                  onChange={handleChange}
                  required
                  className="px-4 py-3 bg-gray-50/50 border border-gray-200 rounded-xl focus:ring-4 focus:ring-[#852BAF]/20 focus:border-[#852BAF] focus:bg-white transition-all outline-none text-sm"
                >
                  <option value="">Select State</option>
                  {states.map((s) => (
                    <option key={s.state_id} value={s.state_id}>
                      {s.state_name}
                    </option>
                  ))}
                </select>
              </div>
              <FormInput
                id="pincode"
                label="Pincode"
                value={formData.pincode}
                onChange={handleChange}
                required
                error={errors.pincode}
              />
            </div>
          </section>

          {/* Billing Address */}
          <section className="space-y-4 bg-white/95 backdrop-blur-xl rounded-2xl p-6 sm:p-8 shadow-lg hover:shadow-2xl transition-shadow duration-300">
            <SectionHeader
              icon={FaCreditCard}
              title="Billing Address"
              description="Address for invoices and official correspondence."
            />

            <div className="flex items-center mb-4">
              <input
                type="checkbox"
                id="sameAsAddress"
                checked={isSameAsAddress}
                onChange={() => handleCheckboxChange("billing")}
                className="w-4 h-4 border-gray-300 rounded focus:ring-2 focus:ring-[#852BAF]/30"
                style={{ accentColor: "#852BAF" }}
              />
              <label
                htmlFor="sameAsAddress"
                className="ml-2 text-sm font-medium text-gray-700"
              >
                Same as Registered Address
              </label>
            </div>

            <div
              className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 ${
                isSameAsAddress ? "opacity-50 pointer-events-none" : ""
              }`}
            >
              <FormInput
                id="billingAddressLine1"
                label="Billing Address Line 1"
                value={formData.billingAddressLine1}
                onChange={handleChange}
                required={!isSameAsAddress}
              />
              <FormInput
                id="billingAddressLine2"
                label="Billing Address Line 2"
                value={formData.billingAddressLine2}
                onChange={handleChange}
              />

              <FormInput
                id="billingCity"
                label="Billing City"
                value={formData.billingCity}
                onChange={handleChange}
                required={!isSameAsAddress}
              />
              {/* <FormInput
                id="billingState"
                label="Billing State"
                value={formData.billingState}
                onChange={handleChange}
                required={!isSameAsAddress}
              /> */}

              <div className="flex flex-col space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-600 ml-1">
                  Billing State <span className="text-[#FC3F78]">*</span>
                </label>
                <select
                  name="billingState"
                  id="billingState"
                  value={formData.billingState}
                  onChange={handleChange}
                  required
                  className="px-4 py-3 bg-gray-50/50 border border-gray-200 rounded-xl focus:ring-4 focus:ring-[#852BAF]/20 focus:border-[#852BAF] focus:bg-white transition-all outline-none text-sm"
                >
                  <option value="">Select Billing State</option>
                  {states.map((s) => (
                    <option key={s.state_id} value={s.state_id}>
                      {s.state_name}
                    </option>
                  ))}
                </select>
              </div>
              <FormInput
                id="billingPincode"
                label="Billing Pincode"
                value={formData.billingPincode}
                onChange={handleChange}
                required={!isSameAsAddress}
                error={errors.billingPincode}
              />
            </div>
          </section>

          {/* Shipping Address */}
          {/* <section className="space-y-4 bg-white/95 backdrop-blur-xl rounded-2xl p-6 sm:p-8 shadow-lg hover:shadow-2xl transition-shadow duration-300">
            <SectionHeader
              icon={FaShippingFast}
              title="Shipping Address"
              description="Where products will be picked up from."
            />

            <div className="flex items-center mb-4">
              <input
                type="checkbox"
                id="sameAsBilling"
                checked={isSameAsBilling}
                onChange={() => handleCheckboxChange("shipping")}
                className="w-4 h-4 border-gray-300 rounded text-brand-pink focus:ring-brand-pink"
                style={{ accentColor: "#FC3F78" }}
              />
              <label
                htmlFor="sameAsBilling"
                className="ml-2 text-sm font-medium text-gray-700"
              >
                Same as Billing Address
              </label>
            </div>

            <div
              className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 ${
                isSameAsBilling ? "opacity-50 pointer-events-none" : ""
              }`}
            >
              <FormInput
                id="shippingAddressLine1"
                label="Shipping Address Line 1"
                value={formData.shippingAddressLine1}
                onChange={handleChange}
                required={!isSameAsBilling}
              />
              <FormInput
                id="shippingAddressLine2"
                label="Shipping Address Line 2"
                value={formData.shippingAddressLine2}
                onChange={handleChange}
              />

              <FormInput
                id="shippingCity"
                label="Shipping City"
                value={formData.shippingCity}
                onChange={handleChange}
                required={!isSameAsBilling}
              />
              <div className="flex flex-col space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-600 ml-1">
                  Shipping State <span className="text-[#FC3F78]">*</span>
                </label>
                <select
                  name="shippingState"
                  id="shippingState"
                  value={formData.shippingState}
                  onChange={handleChange}
                  required
                  className="px-4 py-3 bg-gray-50/50 border border-gray-200 rounded-xl focus:ring-4 focus:ring-[#852BAF]/20 focus:border-[#852BAF] focus:bg-white transition-all outline-none text-sm"
                >
                  <option value="">Select Shipping State</option>
                  {states.map((s) => (
                    <option key={s.state_id} value={s.state_id}>
                      {s.state_name}
                    </option>
                  ))}
                </select>
              </div>
              <FormInput
                id="shippingPincode"
                label="Shipping Pincode"
                value={formData.shippingPincode}
                onChange={handleChange}
                required={!isSameAsBilling}
                error={errors.shippingPincode}
              />
            </div>
          </section> */}

          {/* Bank Details */}
          <section className="space-y-4 bg-white/95 backdrop-blur-xl rounded-2xl p-6 sm:p-8 shadow-lg hover:shadow-2xl transition-shadow duration-300">
            <SectionHeader
              icon={FaUniversity}
              title="Bank Details & Proof"
              description="Account details for receiving payments and required proof."
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <FormInput
                id="bankName"
                label="Bank Name"
                value={formData.bankName}
                onChange={handleChange}
                required
              />
              <FormInput
                id="accountNumber"
                label="Account Number"
                value={formData.accountNumber}
                onChange={handleChange}
                type="text"
                required
              />
              <FormInput
                id="branch"
                label="Branch"
                value={formData.branch}
                onChange={handleChange}
                required
              />
              <FormInput
                id="ifscCode"
                label="IFSC Code"
                value={formData.ifscCode}
                onChange={handleChange}
                required
              />
            </div>
          </section>

          {/* Contact Details */}
          <section className="space-y-4 bg-white/95 backdrop-blur-xl rounded-2xl p-6 sm:p-8 shadow-lg hover:shadow-2xl transition-shadow duration-300">
            <SectionHeader
              icon={FaAddressBook}
              title="Contact Details"
              description="Primary contact information"
            />
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              <FormInput
                id="primaryContactNumber"
                label="Primary Contact Number"
                value={formData.primaryContactNumber}
                onChange={handleChange}
                type="tel"
                required
                error={errors.primaryContactNumber}
              />
              <FormInput
                id="alternateContactNumber"
                label="Alternate Contact Number"
                value={formData.alternateContactNumber}
                onChange={handleChange}
                type="tel"
                error={errors.alternateContactNumber}
              />
              <FormInput
                id="email"
                label="Email"
                value={formData.email}
                onChange={handleChange}
                type="email"
                required
                error={errors.email}
              />
            </div>
          </section>

          {/* Payment Terms */}
          {/* <section className="space-y-4 bg-white/95 backdrop-blur-xl rounded-2xl p-6 sm:p-8 shadow-lg hover:shadow-2xl transition-shadow duration-300">
            <SectionHeader
              icon={FaFileContract}
              title="Payment & Comments"
              description="Custom terms and vendor notes."
            />

            <div className="flex flex-col space-y-1">
              <label
                htmlFor="paymentTerms"
                className="text-sm font-medium text-gray-700"
              >
                Payment Terms
              </label>

              <select
                id="paymentTerms"
                name="paymentTerms"
                value={formData.paymentTerms}
                onChange={handleChange}
                className="w-full px-4 py-3 bg-gray-50/50 border border-gray-200 rounded-xl focus:ring-4 focus:ring-[#852BAF]/20 focus:border-[#852BAF] focus:bg-white transition-all outline-none text-sm text-gray-800"
              >
                <option value="">Select payment terms</option>
                <option value="NET 15">NET 15</option>
                <option value="NET 30">NET 30</option>
                <option value="NET 45">NET 45</option>
              </select>
            </div>

            <div className="flex flex-col space-y-1">
              <label
                htmlFor="comments"
                className="text-sm font-medium text-gray-700"
              >
                Comments (Vendor notes)
              </label>
              <textarea
                id="comments"
                name="comments"
                rows={3}
                value={formData.comments}
                onChange={
                  handleChange as (e: ChangeEvent<HTMLTextAreaElement>) => void
                }
                placeholder="Add any specific notes or requirements here..."
                className="w-full px-4 py-3 bg-gray-50/50 border border-gray-200 rounded-xl focus:ring-4 focus:ring-[#852BAF]/20 focus:border-[#852BAF] focus:bg-white transition-all outline-none text-sm text-gray-800 resize-none"
              />
            </div>
          </section> */}

          {/* Submit Button */}
          {!isReadOnly && (
            <div className="flex justify-center pt-6">
              <button
                type="submit"
                className="flex items-center justify-center w-full px-6 py-3 text-lg font-bold text-white rounded-full transition-all duration-300 cursor-pointer hover:opacity-90 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)", boxShadow: "0 8px 24px rgba(133,43,175,0.3)" }}
              >
                Submit Application
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
