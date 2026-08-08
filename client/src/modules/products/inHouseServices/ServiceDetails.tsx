import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../../common/api/api";

interface ServiceEnquiry {
  id: number;
  enquiry_ref: string;
  bundle_id: number | null;

  name: string;
  city: string;
  mobile: string;
  email: string;

  status: "new" | "contacted" | "converted" | "closed";

  enquiry_data: Record<string, any>;

  created_at: string;

  service_name: string | null;
  variant_name: string | null;
  variant_title: string | null;

  bundle_name: string | null;
  bundle_description: string | null;
  bundle_banner_image: string | null;
}

interface ApiResponse {
  success: boolean;
  data: ServiceEnquiry;
}

const ServiceDetails: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState<ServiceEnquiry | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDetails = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await api.get<ApiResponse>(
        `/v1/service-enquiry/${id}`,
      );

      if (!res.data.success) {
        throw new Error("Failed to load enquiry");
      }

      setData(res.data.data);
    } catch (err) {
      console.error("Failed to fetch enquiry", err);
      setError("Unable to load enquiry details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchDetails();
    }
  }, [id]);

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      new: "bg-yellow-100 text-yellow-800 border-yellow-200",
      contacted: "bg-blue-100 text-blue-800 border-blue-200",
      converted: "bg-green-100 text-green-800 border-green-200",
      closed: "bg-red-100 text-red-800 border-red-200",
    };

    const cls =
      map[status?.toLowerCase()] ??
      "bg-gray-100 text-gray-700 border-gray-200";

    return `inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-semibold capitalize ${cls}`;
  };

  if (loading) {
    return (
      <div className="p-10 text-center">
        Loading enquiry details...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-10 text-center text-red-600">
        {error}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div
      className="min-h-screen p-6 md:p-10"
      style={{
        background:
          "linear-gradient(160deg, #fdf8ff 0%, #fff5f8 50%, #f8f9ff 100%)",
      }}
    >
      {/* HEADER */}

      <div className="flex items-center justify-between mb-8">
        <button
          className="
            inline-flex items-center gap-2
            text-sm font-semibold
            bg-gradient-to-r
            from-[#852BAF]
            to-[#FC3F78]
            text-white
            px-5 py-2.5
            rounded-xl
            shadow-lg
            hover:scale-[1.03]
            active:scale-95
            transition
            cursor-pointer
          "
          onClick={() => navigate(-1)}
        >
          ← Back
        </button>

        <h2 className="text-2xl font-bold text-gray-900 md:text-3xl">
          Enquiry #{data.enquiry_ref}
        </h2>
      </div>

      {/* ENQUIRY SUMMARY */}

      <div className="p-6 mb-5 bg-white border border-gray-100 shadow-sm rounded-2xl">
        <h3 className="mb-4 text-sm font-bold tracking-widest text-gray-400 uppercase">
          Enquiry Summary
        </h3>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div>
            <span className="text-xs font-medium tracking-wide text-gray-400 uppercase">
              Status
            </span>

            <div className="mt-2">
              <span className={getStatusBadge(data.status)}>
                {data.status}
              </span>
            </div>
          </div>

          <div>
            <span className="text-xs font-medium tracking-wide text-gray-400 uppercase">
              Enquiry Reference
            </span>

            <p className="mt-2 font-semibold text-gray-800">
              {data.enquiry_ref}
            </p>
          </div>

          <div>
            <span className="text-xs font-medium tracking-wide text-gray-400 uppercase">
              Created On
            </span>

            <p className="mt-2 font-semibold text-gray-800">
              {new Date(data.created_at).toLocaleDateString(
                "en-IN",
              )}
            </p>
          </div>
        </div>
      </div>

      {/* CUSTOMER DETAILS */}

      <div className="p-6 mb-5 bg-white border border-gray-100 shadow-sm rounded-2xl">
        <h3 className="mb-4 text-sm font-bold tracking-widest text-gray-400 uppercase">
          Customer Details
        </h3>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
          <div>
            <span className="text-xs font-medium text-gray-400">
              Name
            </span>

            <p className="mt-1 font-semibold text-gray-800">
              {data.name}
            </p>
          </div>

          <div>
            <span className="text-xs font-medium text-gray-400">
              Mobile
            </span>

            <p className="mt-1 font-semibold text-gray-800">
              {data.mobile}
            </p>
          </div>

          <div>
            <span className="text-xs font-medium text-gray-400">
              Email
            </span>

            <p className="mt-1 font-semibold text-gray-800">
              {data.email}
            </p>
          </div>

          <div>
            <span className="text-xs font-medium text-gray-400">
              City
            </span>

            <p className="mt-1 font-semibold text-gray-800">
              {data.city}
            </p>
          </div>
        </div>
      </div>

      {/* SERVICE DETAILS */}

      <div className="p-6 mb-5 bg-white border border-gray-100 shadow-sm rounded-2xl">
        <h3 className="mb-4 text-sm font-bold tracking-widest text-gray-400 uppercase">
          Service Details
        </h3>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <span className="text-xs font-medium text-gray-400">
              Service Name
            </span>

            <p className="mt-1 font-semibold text-gray-800">
              {data.service_name || "-"}
            </p>
          </div>

          <div>
            <span className="text-xs font-medium text-gray-400">
              Variant Name
            </span>

            <p className="mt-1 font-semibold text-gray-800">
              {data.variant_name || "-"}
            </p>
          </div>

          <div>
            <span className="text-xs font-medium text-gray-400">
              Variant Title
            </span>

            <p className="mt-1 font-semibold text-gray-800">
              {data.variant_title || "-"}
            </p>
          </div>

          <div>
            <span className="text-xs font-medium text-gray-400">
              Bundle Name
            </span>

            <p className="mt-1 font-semibold text-gray-800">
              {data.bundle_name || "Not Applicable"}
            </p>
          </div>
        </div>

        {data.bundle_description && (
          <div className="mt-6">
            <span className="text-xs font-medium text-gray-400 uppercase">
              Bundle Description
            </span>

            <p className="mt-2 leading-relaxed text-gray-700">
              {data.bundle_description}
            </p>
          </div>
        )}

        {data.bundle_banner_image && (
          <div className="mt-6">
            <span className="text-xs font-medium text-gray-400 uppercase">
              Bundle Banner
            </span>

            <div className="mt-3">
              <img
                src={data.bundle_banner_image}
                alt="Bundle Banner"
                className="max-w-md border border-gray-200 rounded-xl"
              />
            </div>
          </div>
        )}
      </div>

      {/* REQUIREMENT DETAILS */}

      <div className="p-6 bg-white border border-gray-100 shadow-sm rounded-2xl">
        <h3 className="mb-5 text-sm font-bold tracking-widest text-gray-400 uppercase">
          Requirement Details
        </h3>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {Object.entries(data.enquiry_data || {}).map(
            ([key, value]) => (
              <div key={key}>
                <span className="text-xs font-medium tracking-wide text-gray-400 uppercase">
                  {key.replaceAll("_", " ")}
                </span>

                <p className="mt-1 font-semibold text-gray-800">
                  {String(value)}
                </p>
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  );
};

export default ServiceDetails;
