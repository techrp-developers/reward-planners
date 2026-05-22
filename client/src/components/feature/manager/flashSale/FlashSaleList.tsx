import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./css//flashsalelist.css";
import { api } from "../../../../api/api";

const API_BASEIMAGE_URL = "https://rewardplanners.com/api/crm";

interface FlashSale {
  flash_id: number;
  title: string;
  banner_image: string;
  start_at: string;
  end_at: string;
  display_status: string;
}

const FlashSaleList: React.FC = () => {
  const navigate = useNavigate();
  const [sales, setSales] = useState<FlashSale[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFlashSales = async () => {
    try {
      setLoading(true);
      const res = await api.get("/flash/flash-sale");
      setSales(res.data.data);
    } catch (err) {
      console.error("Failed to fetch flash sales", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFlashSales();
  }, []);

  return (
    <div className="fs-page">
      <div className="fs-card wide">
        {/* Header */}
        <div className="fs-header">
  <div className="flex items-start gap-4">
    {/*  Left Icon */}
    <div
      className="w-12 h-12 rounded-full flex items-center justify-center
                bg-gradient-to-r from-[#852BAF] to-[#FC3F78]
                shadow-lg shadow-purple-300/40
                transition  hover:shadow-xl"
    >
      <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
        <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" />
      </svg>
    </div>

    {/*  Title + Paragraph */}
    <div>
      <h2>Flash Sale Campaign</h2>
      <p className="text-sm text-gray-500 mt-1">
        Create and manage flash sale campaigns with banners, timing, and pricing.
      </p>
    </div>
  </div>

  {/*  Button Right */}
  <button
    className="bg-[#852BAF] text-white rounded-md px-4 py-2
           hover:bg-gradient-to-r hover:from-[#FC3F78] hover:to-[#852BAF]
           hover:shadow-xl active:scale-95
           disabled:opacity-60 disabled:cursor-not-allowed
           cursor-pointer"
    onClick={() => navigate("/manager/flash-sale")}
  >
    + Create Flash Sale
  </button>
</div>

        {/* Table */}
        {loading ? (
          <div className="fs-loading">Loading flash sales...</div>
        ) : (
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
  <table className="w-full border-collapse">
    <thead className="bg-gray-50 border-b">
      <tr>
        <th className="text-left px-6 py-4 text-sm font-semibold text-gray-700">
          Banner
        </th>
        <th className="text-left px-6 py-4 text-sm font-semibold text-gray-700">
          Title
        </th>
        <th className="text-left px-6 py-4 text-sm font-semibold text-gray-700">
          Start
        </th>
        <th className="text-left px-6 py-4 text-sm font-semibold text-gray-700">
          End
        </th>
        <th className="text-left px-6 py-4 text-sm font-semibold text-gray-700">
          Status
        </th>
        <th className="text-right px-6 py-4 text-sm font-semibold text-gray-700">
          Actions
        </th>
      </tr>
    </thead>

    <tbody>
      {sales.length === 0 ? (
        <tr>
          <td
            colSpan={6}
            className="text-center py-10 text-gray-400 text-sm"
          >
            No flash sales found
          </td>
        </tr>
      ) : (
        sales.map((sale) => (
          <tr
            key={sale.flash_id}
            className="border-b last:border-b-0 hover:bg-gray-50 transition duration-200"
          >
            <td className="px-6 py-4">
              <img
                src={`${API_BASEIMAGE_URL}/uploads/flash-banners/${sale.banner_image}`}
                alt="banner"
                className="w-16 h-12 object-cover rounded-lg shadow-sm border"
              />
            </td>

            <td className="px-6 py-4 text-sm font-medium text-gray-800">
              {sale.title}
            </td>

            <td className="px-6 py-4 text-sm text-gray-600">
              {new Date(sale.start_at).toLocaleString("en-IN", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </td>

            <td className="px-6 py-4 text-sm text-gray-600">
              {new Date(sale.end_at).toLocaleString("en-IN", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </td>

            <td className="px-6 py-4">
              <span
                className={`px-3 py-1 text-xs font-semibold rounded-full 
                ${
                  sale.display_status === "Active"
                    ? "bg-green-100 text-green-700"
                    : sale.display_status === "Upcoming"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-red-100 text-red-700"
                }`}
              >
                {sale.display_status}
              </span>
            </td>

            <td className="px-6 py-4 text-right space-x-2">
              <button
                className="bg-[#F3E8FF] text-[#852BAF] rounded-md px-[12px] py-[7px]
                border border-[#852BAF]/30
                hover:bg-[#E9D5FF] hover:shadow-md active:scale-95
                transition duration-200 cursor-pointer"
                onClick={() =>
                  navigate(`/manager/flash-sale/${sale.flash_id}`)
                }
              >
                Edit
              </button>

              <button
                className="bg-[#852BAF] text-white rounded-md px-[12px] py-[7px]
                hover:bg-gradient-to-r hover:from-[#FC3F78] hover:to-[#852BAF]
                hover:shadow-lg active:scale-95
                disabled:opacity-60 disabled:cursor-not-allowed
                transition duration-200 cursor-pointer"
                onClick={() =>
                  navigate(`/manager/flash-variants/${sale.flash_id}`)
                }
              >
                Variants
              </button>
            </td>
          </tr>
        ))
      )}
    </tbody>
  </table>
</div>

        )}
      </div>
    </div>
  );
};

export default FlashSaleList;
