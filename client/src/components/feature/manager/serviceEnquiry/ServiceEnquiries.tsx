import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../../api/api";
import {
  FiInbox,
} from "react-icons/fi";
import {
  FaSearch,
  FaEye,
} from "react-icons/fa";

interface ServiceEnquiry {
  id: number;
  enquiry_ref: string;

  bundle_id: number | null;

  name: string;
  city: string;
  mobile: string;
  email: string;

  status:
    | "new"
    | "contacted"
    | "converted"
    | "closed";

  enquiry_data: Record<string, any>;

  created_at: string;

  service_name: string | null;

  variant_name: string | null;

  variant_title: string | null;

  bundle_name: string | null;
  bundle_description: string | null;
  bundle_banner_image: string | null;
}

const ServiceEnquiries = () => {
  const navigate = useNavigate();

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [enquiries, setEnquiries] =
    useState<ServiceEnquiry[]>([]);

  const [search, setSearch] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState("all");

  const fetchEnquiries = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await api.get(
        "/v1/service-enquiry"
      );

      if (!res.data.success) {
        throw new Error(
          "Failed to load enquiries"
        );
      }

      setEnquiries(res.data.data || []);
    } catch (err) {
      console.error(err);
      setError(
        "Failed to load enquiries"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEnquiries();
  }, []);

  const filteredEnquiries =
    enquiries.filter((item) => {
      const matchesSearch =
        item.name
          .toLowerCase()
          .includes(search.toLowerCase()) ||
        item.mobile.includes(search) ||
        item.enquiry_ref
          .toLowerCase()
          .includes(search.toLowerCase());

      const matchesStatus =
        statusFilter === "all"
          ? true
          : item.status === statusFilter;

      return (
        matchesSearch &&
        matchesStatus
      );
    });

  const getStatusClass = (
    status: string
  ) => {
    switch (status) {
      case "new":
        return "bg-yellow-100 text-yellow-700 border-yellow-200";

      case "contacted":
        return "bg-blue-100 text-blue-700 border-blue-200";

      case "converted":
        return "bg-green-100 text-green-700 border-green-200";

      case "closed":
        return "bg-red-100 text-red-700 border-red-200";

      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  const formatDate = (
    date: string
  ) => {
    return new Date(date).toLocaleDateString(
      "en-IN",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }
    );
  };

  return (
    <div className="w-full min-h-screen">
      <div className="p-6 bg-white border border-gray-200 shadow-lg rounded-2xl">

        {/* HEADER */}

        <div className="flex items-start gap-4 mb-8">
          <div className="w-12 h-12 bg-gradient-to-r from-[#852BAF] to-[#FC3F78] rounded-full flex items-center justify-center shrink-0 shadow-md">
            <FiInbox className="text-xl text-white" />
          </div>

          <div>
            <h2 className="text-3xl font-bold text-gray-900">
              Service Enquiries
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Manage customer service
              enquiries and track
              conversions.
            </p>
          </div>
        </div>

        {/* FILTERS */}

        <div className="flex flex-col gap-4 mb-6 md:flex-row">

          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Search by ref no, name, mobile..."
              value={search}
              onChange={(e) =>
                setSearch(
                  e.target.value
                )
              }
              className="w-full py-3 pl-10 pr-4 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#852BAF]"
            />

            <FaSearch className="absolute text-gray-400 left-3 top-4" />
          </div>

          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(
                e.target.value
              )
            }
            className="px-4 py-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#852BAF]"
          >
            <option value="all">
              All Status
            </option>

            <option value="new">
              New
            </option>

            <option value="contacted">
              Contacted
            </option>

            <option value="converted">
              Converted
            </option>

            <option value="closed">
              Closed
            </option>
          </select>
        </div>

        {/* LOADER */}

        {loading && (
          <div className="flex justify-center py-12">
            <div className="w-10 h-10 border-4 border-gray-200 border-t-[#852BAF] rounded-full animate-spin" />
          </div>
        )}

        {/* ERROR */}

        {error && (
          <div className="px-4 py-3 mb-4 text-center text-red-600 border border-red-200 bg-red-50 rounded-xl">
            {error}
          </div>
        )}

        {/* TABLE */}

        {!loading && !error && (
          <div className="overflow-x-auto border border-gray-100 rounded-2xl">

            <table className="w-full text-sm text-left">

              <thead
                style={{
                  background:
                    "linear-gradient(135deg,#fdf8ff 0%,#fff5f8 100%)",
                }}
              >
                <tr>

                  <th className="px-4 py-4 text-xs font-bold uppercase">
                    Ref No
                  </th>

                  <th className="px-4 py-4 text-xs font-bold uppercase">
                    Customer
                  </th>

                  <th className="px-4 py-4 text-xs font-bold uppercase">
                    Mobile
                  </th>

                  <th className="px-4 py-4 text-xs font-bold uppercase">
                    Service
                  </th>

                  <th className="px-4 py-4 text-xs font-bold uppercase">
                    Requirement
                  </th>

                  <th className="px-4 py-4 text-xs font-bold uppercase">
                    City
                  </th>

                  <th className="px-4 py-4 text-xs font-bold uppercase">
                    Status
                  </th>

                  <th className="px-4 py-4 text-xs font-bold uppercase">
                    Date
                  </th>

                  <th className="px-4 py-4 text-xs font-bold uppercase">
                    Action
                  </th>

                </tr>
              </thead>

              <tbody className="divide-y divide-gray-50">

                {filteredEnquiries.length ===
                0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="py-16 text-center text-gray-400"
                    >
                      No enquiries found
                    </td>
                  </tr>
                ) : (
                  filteredEnquiries.map(
                    (enquiry) => (
                      <tr
                        key={enquiry.id}
                        className="transition-colors bg-white hover:bg-purple-50/30"
                      >
                        <td className="px-4 py-4">

                          <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-purple-50 text-[#852BAF]">
                            {
                              enquiry.enquiry_ref
                            }
                          </span>

                        </td>

                        <td className="px-4 py-4">

                          <div className="font-semibold text-gray-800">
                            {
                              enquiry.name
                            }
                          </div>

                          <div className="text-xs text-gray-500">
                            {
                              enquiry.email
                            }
                          </div>

                        </td>

                        <td className="px-4 py-4 text-gray-600">
                          {
                            enquiry.mobile
                          }
                        </td>

                        <td className="px-4 py-4">

                          <div className="flex flex-col">

                            <span className="font-medium text-gray-800">
                              {enquiry.bundle_name ||
                                enquiry.service_name}
                            </span>

                            {enquiry.variant_name && (
                              <span className="text-xs text-gray-500">
                                {
                                  enquiry.variant_name
                                }
                              </span>
                            )}

                          </div>

                        </td>

                        <td className="px-4 py-4 text-gray-600">

                          {enquiry
                            .enquiry_data
                            ?.requirement ||
                            "-"}

                        </td>

                        <td className="px-4 py-4 text-gray-600">
                          {enquiry.city}
                        </td>

                        <td className="px-4 py-4">

                          <span
                            className={`inline-flex px-2.5 py-0.5 rounded-full border text-[11px] font-semibold uppercase tracking-wide ${getStatusClass(
                              enquiry.status
                            )}`}
                          >
                            {
                              enquiry.status
                            }
                          </span>

                        </td>

                        <td className="px-4 py-4 text-gray-600 whitespace-nowrap">
                          {formatDate(
                            enquiry.created_at
                          )}
                        </td>

                        <td className="px-4 py-4">

                          <button
                            onClick={() =>
                              navigate(
                                `/manager/service-enquiry/${enquiry.id}`
                              )
                            }
                            className="px-3 py-1.5 text-xs font-semibold bg-purple-50 text-[#852BAF] border border-purple-200 rounded-lg hover:bg-[#852BAF] hover:text-white transition-all cursor-pointer"
                          >
                            <FaEye className="inline mr-1" />
                            View
                          </button>

                        </td>
                      </tr>
                    )
                  )
                )}

              </tbody>

            </table>

          </div>
        )}
      </div>
    </div>
  );
};

export default ServiceEnquiries;