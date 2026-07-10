import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  FaBuilding,
  FaAddressBook,
  FaCreditCard,
  FaShippingFast,
  FaUniversity,
  FaPhoneAlt,
  FaFileContract,
  FaCheckCircle,
  FaTimesCircle,
  FaDownload,
  FaCommentAlt,
  FaEye,
  FaFilePdf,
} from "react-icons/fa";
import { FiChevronLeft, FiShield } from "react-icons/fi";
import Swal from "sweetalert2";
import { api } from "../../../common/api/api";

const API_BASEIMAGE_URL = "https://rewardplanners.com/api/crm";

const resolveImageUrl = (path: string) =>
  path?.startsWith("http") ? path : `${API_BASEIMAGE_URL}/uploads/${path}`;

const downloadFile = (url: string, filename?: string) => {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || url.split("/").pop() || "file";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

interface VendorOnboardingData {
  companyName: string;
  fullName: string;
  vendorType: string;
  gstin: string;
  panNumber: string;
  ipaddress: string;
  gstinFileUrl: string;
  panFileUrl: string;
  bankCancelledChequeFileUrl: string;
  authorizedSignatoryIdFileUrl: string;
  businessProfileFileUrl: string;
  brandLogoFileUrl: string;
  nocFileUrl: string;
  electricityBillFileUrl: string;
  advisoryDisclaimerFileUrl: string;
  signedAgreementFileUrl: string;
  addressLine1: string;
  addressLine2: string;
  addressLine3: string;
  city: string;
  state: string;
  pincode: string;
  billingAddressLine1: string;
  billingAddressLine2: string;
  billingCity: string;
  billingState: string;
  billingPincode: string;
  shippingAddressLine1: string;
  shippingAddressLine2: string;
  shippingCity: string;
  shippingState: string;
  shippingPincode: string;
  bankName: string;
  accountNumber: string;
  branch: string;
  ifscCode: string;
  email: string;
  primaryContactNumber: string;
  alternateContactNumber: string;
  paymentTerms: string;
  comments: string;
}

interface BackendVendorData {
  vendor: Record<string, string>;
  addresses: Array<Record<string, string>>;
  bank: Record<string, string>;
  contacts: Record<string, string>;
  documents: Array<Record<string, string>>;
}

const DOCUMENT_CONFIG = {
  gstinFile: { label: "GST Document" },
  panFile: { label: "PAN Card" },
  nocFile: { label: "NOC" },
  rightsAdvisoryFile: { label: "Trademark" },
  signatoryIdFile: { label: "Authorized Signatory ID Proof" },
  businessProfileFile: { label: "Business Profile" },
  brandLogoFile: { label: "Brand Logo" },
  bankProofFile: { label: "Bank Cancelled Cheque" },
  electricityBillFile: { label: "Electricity Bill" },
  signedAgreementFile: { label: "Signed Agreement (Optional)" },
};

const restructureData = (backendData: BackendVendorData): VendorOnboardingData => {
  const { vendor, addresses, bank, contacts, documents } = backendData;
  const getAddress = (type: string, key: string) =>
    addresses.find((a) => a.type === type)?.[key] || "";
  const getDocUrl = (type: string) =>
    documents.find((d) => d.document_type === type)?.file_path || "";
  return {
    companyName: vendor.company_name || "",
    fullName: vendor.full_name || "",
    vendorType: vendor.vendor_type || "",
    gstin: vendor.gstin || "",
    panNumber: vendor.pan_number || "",
    ipaddress: vendor.ipaddress || "N/A",
    gstinFileUrl: getDocUrl("gst_document"),
    panFileUrl: getDocUrl("pan_card"),
    bankCancelledChequeFileUrl: getDocUrl("cancelled_cheque"),
    authorizedSignatoryIdFileUrl: getDocUrl("authorized_signatory_id"),
    businessProfileFileUrl: getDocUrl("business_profile"),
    brandLogoFileUrl: getDocUrl("brand_logo"),
    nocFileUrl: getDocUrl("noc"),
    electricityBillFileUrl: getDocUrl("electricity_bill"),
    advisoryDisclaimerFileUrl: getDocUrl("advisory_disclaimer"),
    signedAgreementFileUrl: getDocUrl("signed_agreement"),
    addressLine1: getAddress("business", "line1"),
    addressLine2: getAddress("business", "line2"),
    addressLine3: getAddress("business", "line3"),
    city: getAddress("business", "city"),
    state: getAddress("business", "state"),
    pincode: getAddress("business", "pincode"),
    billingAddressLine1: getAddress("billing", "line1"),
    billingAddressLine2: getAddress("billing", "line2"),
    billingCity: getAddress("billing", "city"),
    billingState: getAddress("billing", "state"),
    billingPincode: getAddress("billing", "pincode"),
    shippingAddressLine1: getAddress("shipping", "line1"),
    shippingAddressLine2: getAddress("shipping", "line2"),
    shippingCity: getAddress("shipping", "city"),
    shippingState: getAddress("shipping", "state"),
    shippingPincode: getAddress("shipping", "pincode"),
    bankName: bank?.bank_name || "",
    accountNumber: bank?.account_number || "",
    branch: bank?.branch || "",
    ifscCode: bank?.ifsc_code || "",
    email: contacts?.email || vendor.email || "",
    primaryContactNumber: contacts?.primary_contact || "",
    alternateContactNumber: contacts?.alternate_contact || "",
    paymentTerms: contacts?.payment_terms || "",
    comments: contacts?.comments || "",
  };
};

const mapDocumentsByKey = (documents: Array<Record<string, string>>) => {
  const map: Record<string, Record<string, string>> = {};
  documents.forEach((doc) => { map[doc.document_key] = doc; });
  return map;
};

/* ── Sub-components ── */

const DocumentPreviewCard = ({
  label,
  doc,
}: {
  label: string;
  doc: Record<string, string> | undefined;
}) => {
  if (!doc) {
    return (
      <div
        className="p-4 rounded-xl text-sm text-gray-400 flex items-center gap-2"
        style={{ background: "rgba(133,43,175,0.03)", border: "1px dashed rgba(133,43,175,0.15)" }}
      >
        <FaFilePdf className="shrink-0 text-gray-300" />
        <span>{label}: Not uploaded</span>
      </div>
    );
  }

  const fileUrl = resolveImageUrl(doc.file_path);
  const isImage = doc.mime_type?.startsWith("image/");

  return (
    <div
      className="p-4 rounded-xl bg-white"
      style={{ border: "1px solid rgba(133,43,175,0.1)", boxShadow: "0 2px 12px rgba(133,43,175,0.05)" }}
    >
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">{label}</p>
      <div className="flex items-center gap-3">
        {isImage ? (
          <a href={fileUrl} target="_blank" rel="noopener noreferrer">
            <img
              src={fileUrl}
              alt={label}
              className="w-14 h-14 object-cover rounded-xl border cursor-pointer hover:opacity-90 transition-opacity"
              style={{ borderColor: "rgba(133,43,175,0.15)" }}
            />
          </a>
        ) : (
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.12)" }}
          >
            <FaFilePdf className="text-red-400" size={22} />
          </div>
        )}
        <div className="flex gap-2">
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2.5 rounded-xl border border-gray-200 hover:border-[#852BAF] hover:text-[#852BAF] text-gray-400 transition-all"
            title="View"
          >
            <FaEye size={13} />
          </a>
          <button
            onClick={() => downloadFile(fileUrl, fileUrl.split("/").pop())}
            className="p-2.5 rounded-xl border border-gray-200 hover:border-[#852BAF] hover:text-[#852BAF] text-gray-400 transition-all cursor-pointer"
            title="Download"
          >
            <FaDownload size={13} />
          </button>
        </div>
      </div>
    </div>
  );
};

const ReviewField = ({ label, value }: { label: string; value: string | number }) => (
  <div
    className="p-4 rounded-xl bg-white"
    style={{ border: "1px solid rgba(133,43,175,0.08)", boxShadow: "0 2px 8px rgba(133,43,175,0.04)" }}
  >
    <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
    <p className="text-sm font-semibold text-gray-800 break-words">
      {value?.toString() || <span className="text-gray-400 italic">N/A</span>}
    </p>
  </div>
);

const SectionHeader = ({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) => (
  <div className="flex items-center gap-3 mb-5 pb-3" style={{ borderBottom: "1px solid rgba(133,43,175,0.1)" }}>
    <div
      className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0"
      style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)" }}
    >
      <Icon size={16} />
    </div>
    <div>
      <h2 className="text-base font-extrabold text-gray-900">{title}</h2>
      <p className="text-xs text-gray-400 font-medium">{description}</p>
    </div>
  </div>
);

export default function VendorApprovalForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const vendorId = id;

  const [vendorStatus, setVendorStatus] = useState<
    "pending" | "sent_for_approval" | "approved" | "rejected" | null
  >(null);
  const [documentMap, setDocumentMap] = useState<Record<string, Record<string, string>>>({});
  const [formData, setFormData] = useState<VendorOnboardingData | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  useEffect(() => {
    async function fetchVendorData() {
      if (!vendorId) {
        setLoading(false);
        setError("Missing Vendor ID in URL.");
        return;
      }

      try {
        const res = await api.get(`/vendor/${vendorId}`);
        const data = res.data.data;
        setFormData(restructureData(data));
        setDocumentMap(mapDocumentsByKey(data.documents));
        setVendorStatus(data.vendor.status);
        setError(null);
      } catch (err: unknown) {
        const e = err as { response?: { data?: { message?: string } }; message?: string };
        setError(e?.response?.data?.message || e?.message || "Failed to fetch vendor data");
      } finally {
        setLoading(false);
      }
    }

    fetchVendorData();
  }, [vendorId]);

  const handleFinalDecision = async (status: "approved" | "rejected") => {
    if (status === "rejected" && rejectionReason.trim() === "") {
      await Swal.fire({
        title: "Reason Required",
        text: "Please provide a rejection reason before rejecting the vendor.",
        icon: "warning",
        customClass: { popup: "rounded-2xl" },
      });
      return;
    }

    const confirm = await Swal.fire({
      title: status === "approved" ? "Approve Vendor?" : "Reject Vendor?",
      text: status === "approved"
        ? "This vendor will be approved and can start selling on the platform."
        : "This vendor will be rejected with the provided reason.",
      icon: status === "approved" ? "success" : "warning",
      showCancelButton: true,
      confirmButtonText: status === "approved" ? "Yes, Approve" : "Yes, Reject",
      cancelButtonText: "Cancel",
      confirmButtonColor: status === "approved" ? "#852BAF" : "#DC2626",
      cancelButtonColor: "#9CA3AF",
      reverseButtons: true,
      customClass: { popup: "rounded-2xl" },
    });

    if (!confirm.isConfirmed) return;

    const payload = {
      status,
      rejectionReason: status === "rejected" ? rejectionReason : null,
    };

    setIsSubmitting(true);
    try {
      const res = await api.put(`/vendor/status/${vendorId}`, payload);
      if (!res.data.success) throw new Error(res.data.message || "Failed to update vendor status");

      await Swal.fire({
        title: status === "approved" ? "Approved!" : "Rejected!",
        text: `Vendor status updated to ${status}.`,
        icon: "success",
        timer: 1500,
        showConfirmButton: false,
        customClass: { popup: "rounded-2xl" },
      });

      navigate("/manager/vendors");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      await Swal.fire({
        title: "Error",
        text: e?.response?.data?.message || e?.message || "Failed to update vendor status",
        icon: "error",
        customClass: { popup: "rounded-2xl" },
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-[3px] border-transparent border-t-[#852BAF] border-r-[#FC3F78] rounded-full animate-spin" />
        <span className="ml-4 text-gray-500 font-medium">Loading vendor details…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-xl mx-auto p-6">
        <div
          className="p-5 rounded-2xl text-red-700"
          style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.18)" }}
        >
          <p className="font-bold mb-1">Error</p>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!formData) {
    return (
      <div className="max-w-xl mx-auto p-6">
        <div className="p-5 rounded-2xl bg-amber-50 text-amber-700 border border-amber-200">
          Vendor ID {vendorId} not found.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">

      {/* ── PAGE HEADER ── */}
      <div
        className="flex items-center justify-between p-5 rounded-2xl"
        style={{
          background: "linear-gradient(135deg, rgba(133,43,175,0.06) 0%, rgba(252,63,120,0.04) 100%)",
          border: "1px solid rgba(133,43,175,0.1)",
        }}
      >
        <div className="flex items-center gap-4">
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shrink-0"
            style={{
              background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)",
              boxShadow: "0 6px 20px rgba(133,43,175,0.25)",
            }}
          >
            <FiShield size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">
              Vendor Review:{" "}
              <span className="gradient-text-brand">{formData.companyName}</span>
            </h1>
            <p className="text-xs text-gray-500 font-medium mt-0.5">
              Vendor ID: {vendorId} · Review all submitted data before making a decision
            </p>
          </div>
        </div>

        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-gray-600 bg-white border border-gray-200 rounded-xl hover:border-[#852BAF] hover:text-[#852BAF] transition-all cursor-pointer"
        >
          <FiChevronLeft size={15} /> Back
        </button>
      </div>

      {/* ── DECISION CARD ── */}
      <div
        className="bg-white rounded-2xl p-6 vendor-section-card"
        style={{ border: "1px solid rgba(133,43,175,0.08)", boxShadow: "0 4px 24px rgba(133,43,175,0.06)" }}
      >
        <div className="flex items-center gap-2 mb-3">
          <FaCommentAlt className="text-[#852BAF] shrink-0" size={13} />
          <p className="text-sm font-bold text-gray-700">Manager Decision & Comments</p>
        </div>
        <textarea
          rows={3}
          value={rejectionReason}
          onChange={(e) => {
            setRejectionReason(e.target.value);
            if (e.target.value.trim()) setIsRejecting(true);
          }}
          onFocus={() => setIsRejecting(true)}
          onBlur={() => { if (!rejectionReason.trim()) setIsRejecting(false); }}
          placeholder={
            isRejecting
              ? "REQUIRED: Provide a detailed reason for rejecting this vendor."
              : "Optional internal comments (if approving) or draft rejection reason…"
          }
          className={`w-full px-4 py-3 text-sm rounded-xl resize-none outline-none transition-all ${
            isRejecting
              ? "border border-red-300 bg-red-50/50 focus:ring-4 focus:ring-red-200/40"
              : "border border-gray-200 bg-gray-50/60 focus:ring-4 focus:ring-[#852BAF]/15 focus:border-[#852BAF] focus:bg-white"
          }`}
        />

        {vendorStatus !== "approved" && vendorStatus !== "rejected" && (
          <div className="flex flex-col sm:flex-row justify-end gap-3 mt-4 pt-4" style={{ borderTop: "1px solid rgba(133,43,175,0.08)" }}>
            <button
              type="button"
              onClick={() => handleFinalDecision("rejected")}
              disabled={isSubmitting}
              className="flex items-center justify-center gap-2 px-6 py-3 text-sm font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-2xl transition-all cursor-pointer disabled:opacity-50 active:scale-95"
            >
              <FaTimesCircle size={14} />
              {isSubmitting ? "Rejecting…" : "Final Reject"}
            </button>

            <button
              type="button"
              onClick={() => handleFinalDecision("approved")}
              disabled={isSubmitting}
              className="flex items-center justify-center gap-2 px-6 py-3 text-sm font-bold text-white rounded-2xl transition-all cursor-pointer disabled:opacity-50 active:scale-95 hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)", boxShadow: "0 6px 20px rgba(133,43,175,0.3)" }}
            >
              <FaCheckCircle size={14} />
              {isSubmitting ? "Approving…" : "Final Approve"}
            </button>
          </div>
        )}

        {(vendorStatus === "approved" || vendorStatus === "rejected") && (
          <div
            className={`mt-4 px-4 py-3 rounded-xl text-sm font-bold ${
              vendorStatus === "approved"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            {vendorStatus === "approved" ? "✓ This vendor has been approved." : "✗ This vendor has been rejected."}
          </div>
        )}
      </div>

      {/* ── MAIN REVIEW CARD ── */}
      <div
        className="bg-white rounded-2xl p-6 sm:p-8 vendor-section-card space-y-8"
        style={{ border: "1px solid rgba(133,43,175,0.08)", boxShadow: "0 4px 24px rgba(133,43,175,0.06)" }}
      >
        {/* Business Info & Documents */}
        <section>
          <SectionHeader icon={FaBuilding} title="Business Information & Documents" description="Core business details and mandatory documents" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
            <ReviewField label="Company Name" value={formData.companyName} />
            <ReviewField label="Full Name" value={formData.fullName} />
            <ReviewField label="Vendor Type" value={formData.vendorType} />
            <ReviewField label="GSTIN" value={formData.gstin} />
            <ReviewField label="PAN Number" value={formData.panNumber} />
            <ReviewField label="IP Address" value={formData.ipaddress} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
            {Object.entries(DOCUMENT_CONFIG).map(([key, cfg]) => (
              <DocumentPreviewCard key={key} label={cfg.label} doc={documentMap[key]} />
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ReviewField label="Company Email" value={formData.email} />
            <ReviewField label="Company Phone" value={formData.primaryContactNumber} />
          </div>
        </section>

        {/* Registered Address */}
        <section>
          <SectionHeader icon={FaAddressBook} title="Registered Address" description="Official business address" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <ReviewField label="Line 1" value={formData.addressLine1} />
            <ReviewField label="Line 2" value={formData.addressLine2} />
            <ReviewField label="Line 3" value={formData.addressLine3} />
            <ReviewField label="City" value={formData.city} />
            <ReviewField label="State" value={formData.state} />
            <ReviewField label="Pincode" value={formData.pincode} />
          </div>
        </section>

        {/* Billing Address */}
        <section>
          <SectionHeader icon={FaCreditCard} title="Billing Address" description="Billing address for invoices" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <ReviewField label="Line 1" value={formData.billingAddressLine1} />
            <ReviewField label="Line 2" value={formData.billingAddressLine2} />
            <ReviewField label="City" value={formData.billingCity} />
            <ReviewField label="State" value={formData.billingState} />
            <ReviewField label="Pincode" value={formData.billingPincode} />
          </div>
        </section>

        {/* Shipping Address */}
        <section>
          <SectionHeader icon={FaShippingFast} title="Shipping Address" description="Shipping address" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <ReviewField label="Line 1" value={formData.shippingAddressLine1} />
            <ReviewField label="Line 2" value={formData.shippingAddressLine2} />
            <ReviewField label="City" value={formData.shippingCity} />
            <ReviewField label="State" value={formData.shippingState} />
            <ReviewField label="Pincode" value={formData.shippingPincode} />
          </div>
        </section>

        {/* Bank Details */}
        <section>
          <SectionHeader icon={FaUniversity} title="Bank Details" description="Bank info for payments" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <ReviewField label="Bank Name" value={formData.bankName} />
            <ReviewField label="Account Number" value={formData.accountNumber} />
            <ReviewField label="Branch" value={formData.branch} />
            <ReviewField label="IFSC Code" value={formData.ifscCode} />
          </div>
        </section>

        {/* Contact Details */}
        <section>
          <SectionHeader icon={FaPhoneAlt} title="Contact Details" description="Primary and alternate contacts" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ReviewField label="Primary Contact" value={formData.primaryContactNumber} />
            <ReviewField label="Alternate Contact" value={formData.alternateContactNumber} />
            <ReviewField label="Email" value={formData.email} />
          </div>
        </section>

        {/* Payment Terms & Comments */}
        <section>
          <SectionHeader icon={FaFileContract} title="Payment Terms & Comments" description="Vendor terms & notes" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ReviewField label="Payment Terms" value={formData.paymentTerms} />
            <ReviewField label="Comments" value={formData.comments} />
          </div>
        </section>
      </div>
    </div>
  );
}
