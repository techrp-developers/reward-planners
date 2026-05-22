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
  FaSpinner,
  FaCommentAlt,
  FaEye,
  FaFilePdf,
} from "react-icons/fa";

import { api } from "../../../../api/api";
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
  vendor: any;
  addresses: Array<any>;
  bank: any;
  contacts: any;
  documents: Array<any>;
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

const restructureData = (
  backendData: BackendVendorData
): VendorOnboardingData => {
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

const mapDocumentsByKey = (documents: any[]) => {
  const map: Record<string, any> = {};
  documents.forEach((doc) => {
    map[doc.document_key] = doc;
  });
  return map;
};

// --------------------
// COMPONENTS
// --------------------
const DocumentPreviewCard = ({ label, doc }: { label: string; doc: any }) => {
  if (!doc) {
    return (
      <div className="p-4 border rounded-xl bg-gray-50 text-sm text-gray-400">
        {label}: Not uploaded
      </div>
    );
  }

  const fileUrl = resolveImageUrl(doc.file_path);
  const isImage = doc.mime_type?.startsWith("image/");

  return (
    <div className="p-4 border rounded-xl bg-white shadow-sm">
      <div className="text-sm font-medium text-gray-700 mb-2">{label}</div>
      <div className="flex items-center gap-3">
        {isImage ? (
          <a href={fileUrl} target="_blank" rel="noopener noreferrer">
            <img
              src={fileUrl}
              alt={label}
              className="w-16 h-16 object-cover rounded border cursor-pointer"
            />
          </a>
        ) : (
          <FaFilePdf className="text-3xl text-red-500" />
        )}
        <div className="flex gap-2">
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 border rounded hover:bg-gray-100"
            title="View"
          >
            <FaEye />
          </a>
          <button
            onClick={() => downloadFile(fileUrl, fileUrl.split("/").pop())}
            className="p-2 border rounded hover:bg-gray-100"
            title="Download"
          >
            <FaDownload />
          </button>
        </div>
      </div>
    </div>
  );
};

const ReviewField = ({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) => (
  <div className="p-4 border border-gray-200 rounded-xl bg-white shadow-sm hover:shadow-md transition duration-200">
    <label className="text-sm font-medium text-gray-500 block mb-1">
      {label}
    </label>
    <div className="text-gray-800 font-semibold break-words">
      {value.toString() || "N/A"}
    </div>
  </div>
);

const SectionHeader = ({
  icon: Icon,
  title,
  description,
}: {
  icon: any;
  title: string;
  description: string;
}) => (
  <div className="flex items-center space-x-3 mb-6 border-b-2 pb-3">
    <Icon className="text-3xl" style={{ color: "#852BAF" }} />
    <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
    <p className="text-sm text-gray-500 hidden md:block">{description}</p>
  </div>
);

export default function VendorApprovalForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const vendorId = id; // <-- get vendor ID

  const [vendorStatus, setVendorStatus] = useState<
    "pending" | "sent_for_approval" | "approved" | "rejected" | null
  >(null);
  const [documentMap, setDocumentMap] = useState<Record<string, any>>({});
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
      } catch (err: any) {
        console.error(err);
        setError(
          err?.response?.data?.message ||
            err.message ||
            "Failed to fetch vendor data"
        );
      } finally {
        setLoading(false);
      }
    }

    fetchVendorData();
  }, [vendorId]);

  // const handleFinalDecision = async (status: "approved" | "rejected") => {
  //   if (status === "rejected" && rejectionReason.trim() === "") {
  //     alert("Rejection reason is required to reject the vendor.");
  //     return;
  //   }

  //   const token = localStorage.getItem("token");
  //   if (!token) {
  //     alert("Authentication missing. Please refresh and log in.");
  //     return;
  //   }

  //   const payload = {
  //     status,
  //     rejectionReason: status === "rejected" ? rejectionReason : null,
  //   };

  //   setIsSubmitting(true);
  //   try {
  //     const res = await fetch(`${API_BASE}/vendor/status/${vendorId}`, {
  //       method: "PUT",
  //       headers: {
  //         Authorization: `Bearer ${token}`,
  //         "Content-Type": "application/json",
  //       },
  //       body: JSON.stringify(payload),
  //     });

  //     const json = await res.json();
  //     if (!res.ok) throw new Error(json.message);

  //     alert(`Vendor status updated to ${status}`);
  //     navigate("/manager/dashboard/vendorlist");
  //   } catch (err: any) {
  //     alert(err.message);
  //   } finally {
  //     setIsSubmitting(false);
  //   }
  // };

  const handleFinalDecision = async (status: "approved" | "rejected") => {
    if (status === "rejected" && rejectionReason.trim() === "") {
      alert("Rejection reason is required to reject the vendor.");
      return;
    }

    const payload = {
      status,
      rejectionReason: status === "rejected" ? rejectionReason : null,
    };

    setIsSubmitting(true);

    try {
      const res = await api.put(`/vendor/status/${vendorId}`, payload);

      if (!res.data.success) {
        throw new Error(res.data.message || "Failed to update vendor status");
      }

      alert(`Vendor status updated to ${status}`);
      navigate("/manager/vendors");
    } catch (err: any) {
      alert(
        err?.response?.data?.message ||
          err.message ||
          "Failed to update vendor status"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-10 text-center text-gray-600 flex items-center justify-center space-x-2">
        <FaSpinner className="animate-spin" />
        <span>Loading vendor details...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-10 text-center text-red-600 bg-red-50 border border-red-200 rounded-lg max-w-xl mx-auto">
        <p className="font-bold mb-2">Error</p>
        <p>{error}</p>
      </div>
    );
  }

  if (!formData) {
    return (
      <p className="p-10 text-center text-red-600">
        Vendor ID {vendorId} not found.
      </p>
    );
  }

  return (
    <div className="p-8 min-h-screen" style={{ backgroundColor: "#F9F9FB" }}>
      <div className="bg-white rounded-3xl p-8 shadow-2xl border border-gray-100 max-w-7xl mx-auto">
        <h1 className="text-3xl font-extrabold text-gray-900 mb-2">
          Vendor Review: {formData.companyName}
        </h1>
        <p className="text-gray-900 font-bold mb-6 border-b pb-4">
          Vendor ID: {vendorId}. Review all submitted data.
        </p>

        {/* Comments Section */}
        <div
          className="mb-8 p-6 border-2 rounded-xl"
          style={{ borderColor: isRejecting ? "#EF4444" : "#E5E7EB" }}
        >
          <p className="text-sm font-bold text-gray-700 flex items-center mb-3">
            <FaCommentAlt className="mr-2 text-red-500" /> Overall Manager
            Decision & Comments
          </p>
          <textarea
            rows={3}
            value={rejectionReason}
            onChange={(e) => {
              setRejectionReason(e.target.value);
              if (e.target.value.trim()) setIsRejecting(true);
            }}
            placeholder={
              isRejecting
                ? "REQUIRED: Please provide a detailed reason for rejecting the entire vendor application."
                : "Optional internal comments (if approved) or draft rejection reasons..."
            }
            className={`w-full p-3 text-sm border rounded-lg focus:ring-1 transition ${
              isRejecting
                ? "border-red-400 bg-red-50 focus:ring-red-500"
                : "border-gray-300"
            }`}
            onFocus={() => setIsRejecting(true)}
            onBlur={() => {
              if (!rejectionReason.trim()) setIsRejecting(false);
            }}
          />
        </div>

        {/* Render all sections */}
        <div className="space-y-10">
          {/* Business Info & Documents */}
          <section className="space-y-6">
            <SectionHeader
              icon={FaBuilding}
              title="Business Information & Documents"
              description="Core business details and mandatory documents"
            />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <ReviewField label="Company Name" value={formData.companyName} />
              <ReviewField label="Full Name" value={formData.fullName} />
              <ReviewField label="Vendor Type" value={formData.vendorType} />
              <ReviewField label="GSTIN" value={formData.gstin} />
              <ReviewField label="PAN Number" value={formData.panNumber} />
              <ReviewField label="IP Address" value={formData.ipaddress} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Object.entries(DOCUMENT_CONFIG).map(([key, cfg]) => (
                <DocumentPreviewCard
                  key={key}
                  label={cfg.label}
                  doc={documentMap[key]}
                />
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ReviewField label="Company Email" value={formData.email} />
              <ReviewField
                label="Company Phone"
                value={formData.primaryContactNumber}
              />
            </div>
          </section>

          {/* B. Registered Address */}
          <SectionHeader
            icon={FaAddressBook}
            title="Registered Address"
            description="Official business address"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <ReviewField label="Line 1" value={formData.addressLine1} />
            <ReviewField label="Line 2" value={formData.addressLine2} />
            <ReviewField label="Line 3" value={formData.addressLine3} />
            <ReviewField label="City" value={formData.city} />
            <ReviewField label="State" value={formData.state} />
            <ReviewField label="Pincode" value={formData.pincode} />
          </div>

          {/* C. Billing Address */}
          <SectionHeader
            icon={FaCreditCard}
            title="Billing Address"
            description="Billing address for invoices"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <ReviewField label="Line 1" value={formData.billingAddressLine1} />
            <ReviewField label="Line 2" value={formData.billingAddressLine2} />
            <ReviewField label="City" value={formData.billingCity} />
            <ReviewField label="State" value={formData.billingState} />
            <ReviewField label="Pincode" value={formData.billingPincode} />
          </div>

          {/* D. Shipping Address */}
          <SectionHeader
            icon={FaShippingFast}
            title="Shipping Address"
            description="Shipping address"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <ReviewField label="Line 1" value={formData.shippingAddressLine1} />
            <ReviewField label="Line 2" value={formData.shippingAddressLine2} />
            <ReviewField label="City" value={formData.shippingCity} />
            <ReviewField label="State" value={formData.shippingState} />
            <ReviewField label="Pincode" value={formData.shippingPincode} />
          </div>

          {/* E. Bank Details */}
          <SectionHeader
            icon={FaUniversity}
            title="Bank Details"
            description="Bank info for payments"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <ReviewField label="Bank Name" value={formData.bankName} />
            <ReviewField
              label="Account Number"
              value={formData.accountNumber}
            />
            <ReviewField label="Branch" value={formData.branch} />
            <ReviewField label="IFSC Code" value={formData.ifscCode} />
          </div>

          {/* F. Contact Details */}
          <SectionHeader
            icon={FaPhoneAlt}
            title="Contact Details"
            description="Primary and alternate contacts"
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <ReviewField
              label="Primary Contact"
              value={formData.primaryContactNumber}
            />
            <ReviewField
              label="Alternate Contact"
              value={formData.alternateContactNumber}
            />
            <ReviewField label="Email" value={formData.email} />
          </div>

          {/* G. Payment Terms & Comments */}
          {/* G. Payment Terms & Comments */}
          <SectionHeader
            icon={FaFileContract}
            title="Payment Terms & Comments"
            description="Vendor terms & notes"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ReviewField label="Payment Terms" value={formData.paymentTerms} />
            <ReviewField label="Comments" value={formData.comments} />
          </div>

          {/* Additional sections (Address, Bank, Contact, Payment) can be copied similarly */}
        </div>

        {/* Submission Buttons */}
        {vendorStatus !== "approved" && vendorStatus !== "rejected" && (
          <div className="pt-6 border-t border-gray-200 flex flex-col md:flex-row justify-end space-y-4 md:space-y-0 md:space-x-4">
            <button
              type="button"
              onClick={() => handleFinalDecision("rejected")}
              disabled={isSubmitting}
              className="px-8 py-3 text-lg font-semibold rounded-full transition duration-300 border border-red-500 text-red-600 bg-white hover:bg-red-100 shadow-md disabled:opacity-50 cursor-pointer"
            >
              <FaTimesCircle className="inline mr-2" />
              {isSubmitting ? "Rejecting..." : "Final Reject"}
            </button>

            <button
              type="button"
              onClick={() => handleFinalDecision("approved")}
              disabled={isSubmitting}
              className="px-8 py-3 text-lg font-semibold text-white rounded-full transition duration-300 hover:shadow-xl disabled:opacity-50 cursor-pointer"
              style={{
                background: "linear-gradient(to right, #2ECC71, #27AE60)",
              }}
            >
              <FaCheckCircle className="inline mr-2" />
              {isSubmitting ? "Approving..." : "Final Approve"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
