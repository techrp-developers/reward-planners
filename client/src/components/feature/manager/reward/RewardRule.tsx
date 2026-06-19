import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../../api/api";
import { FiGift, FiPlus } from "react-icons/fi";

interface RewardRule {
  reward_rule_id: number;
  name: string;

  reward_type: "fixed" | "percentage";
  reward_value: number;
  max_reward: number | null;

  min_order_amount: number;
  max_order_amount?: number | null;

  source_type: string;
  is_active: number;

  description?: string;
  start_date?: string;
  end_date?: string;
  priority?: number;
  is_stackable?: number;
  expiry_days?: number;

  redemption_type?: "fixed" | "percentage" | null;
  redemption_value?: number | null;
  max_redemption_amount?: number | null;
}

const RewardRule: React.FC = () => {
  const navigate = useNavigate();

  const [rules, setRules] = useState<RewardRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRules = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await api.get("/reward/get-rule");

      if (!res.data.success) {
        throw new Error("Failed to fetch rules");
      }

      setRules(res.data?.data);
    } catch (err) {
      console.error(err);
      setError("Failed to load reward rules");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const handleDelete = async (id: number) => {
    if (!window.confirm("Deactivate this rule?")) return;

    try {
      const res = await api.delete(`/reward/delete-rule/${id}`);

      if (!res.data.success) {
        throw new Error("Delete failed");
      }

      fetchRules();
    } catch (err) {
      console.error(err);
      alert("Failed to delete rule");
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const getStatus = (rule: any) => {
    const now = new Date();

    if (!rule.is_active) return { label: "Inactive", color: "red" };

    if (rule.start_date && new Date(rule.start_date) > now) {
      return { label: "Scheduled", color: "yellow" };
    }

    if (rule.end_date && new Date(rule.end_date) < now) {
      return { label: "Expired", color: "gray" };
    }

    return { label: "Active", color: "green" };
  };

  return (
    <div className="w-full min-h-screen">
      <div className="p-6 bg-white border border-gray-200 shadow-lg rounded-2xl">
        {/* HEADER */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-gradient-to-r from-[#852BAF] to-[#FC3F78] rounded-full flex items-center justify-center shrink-0 shadow-md">
              <FiGift className="text-xl text-white" />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-gray-900">Reward Rules</h2>
              <p className="mt-1 text-sm text-gray-500">
                Manage reward configurations
              </p>
            </div>
          </div>

          <button
            onClick={() => navigate(`/manager/reward-create`)}
            className="flex items-center gap-2 bg-gradient-to-r from-[#852BAF] to-[#FC3F78] text-white px-5 py-2.5 rounded-xl shadow-md hover:opacity-90 active:scale-95 transition-all cursor-pointer font-semibold text-sm"
          >
            <FiPlus />
            Create Rule
          </button>
        </div>

        {/* LOADER */}
        {loading && (
          <div className="flex justify-center py-12">
            <div className="w-10 h-10 border-4 border-gray-200 border-t-[#852BAF] rounded-full animate-spin" />
          </div>
        )}

        {/* ERROR */}
        {error && (
          <p className="px-4 py-3 mb-4 text-center text-red-600 border border-red-200 bg-red-50 rounded-xl">
            {error}
          </p>
        )}

        {/* TABLE */}
        {!loading && !error && (
          <div className="overflow-x-auto border border-gray-100 rounded-2xl">
            <table className="w-full text-sm text-left">
              <thead
                style={{
                  background:
                    "linear-gradient(135deg, #fdf8ff 0%, #fff5f8 100%)",
                }}
              >
                <tr>
                  {[
                    "Name",
                    "Reward",
                    "Redemption",
                    "Min Order",
                    "Max Order",
                    "Priority",
                    "Stackable",
                    "Expiry",
                    "Validity",
                    "Source",
                    "Status",
                    "Action",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-4 text-xs font-bold tracking-wider text-gray-500 uppercase whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-50">
                {rules.length === 0 ? (
                  <tr>
                    <td
                      colSpan={12}
                      className="py-16 text-sm text-center text-gray-400"
                    >
                      No reward rules found
                    </td>
                  </tr>
                ) : (
                  rules.map((rule) => (
                    <tr
                      key={rule.reward_rule_id}
                      className="transition-colors bg-white hover:bg-purple-50/30"
                    >
                      <td className="px-4 py-3 font-semibold text-gray-800">
                        {rule.name}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-medium text-gray-700">
                            {rule.reward_type === "percentage"
                              ? `${rule.reward_value}%`
                              : `₹${rule.reward_value}`}
                          </span>

                          {rule.max_reward !== null && (
                            <span className="text-xs text-gray-500">
                              Max: ₹{rule.max_reward}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        {rule.redemption_type ? (
                          <div className="flex flex-col">
                            <span className="font-medium text-blue-700">
                              {rule.redemption_type === "percentage"
                                ? `${rule.redemption_value}%`
                                : `₹${rule.redemption_value}`}
                            </span>

                            {rule.max_redemption_amount !== null && (
                              <span className="text-xs text-gray-500">
                                Max: ₹{rule.max_redemption_amount}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">Not Allowed</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-gray-600">
                        ₹{rule.min_order_amount}
                      </td>

                      <td className="px-4 py-3 text-gray-600">
                        {rule.max_order_amount
                          ? `₹${rule.max_order_amount}`
                          : "-"}
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            Number(rule.priority) <= 10
                              ? "bg-green-100 text-green-700"
                              : Number(rule.priority) <= 50
                                ? "bg-yellow-100 text-yellow-700"
                                : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {rule.priority}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-gray-600">
                        {rule.is_stackable ? "Yes" : "No"}
                      </td>

                      <td className="px-4 py-3 text-gray-600">
                        {rule.expiry_days
                          ? `${rule.expiry_days} days`
                          : "No expiry"}
                      </td>

                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        {!rule.start_date && !rule.end_date && (
                          <span className="text-gray-400">Always Active</span>
                        )}
                        {rule.start_date && !rule.end_date && (
                          <span className="text-[#852BAF]">
                            Starts: {formatDate(rule.start_date)}
                          </span>
                        )}
                        {!rule.start_date && rule.end_date && (
                          <span className="text-orange-600">
                            Until: {formatDate(rule.end_date)}
                          </span>
                        )}
                        {rule.start_date && rule.end_date && (
                          <span className="text-[#852BAF]">
                            {formatDate(rule.start_date)} →{" "}
                            {formatDate(rule.end_date)}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-purple-50 text-[#852BAF]">
                          {rule.source_type}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        {(() => {
                          const status = getStatus(rule);
                          const colorMap: Record<string, string> = {
                            green:
                              "bg-green-100 text-green-700 border-green-200",
                            yellow:
                              "bg-yellow-100 text-yellow-700 border-yellow-200",
                            gray: "bg-gray-100 text-gray-600 border-gray-200",
                            red: "bg-red-100 text-red-600 border-red-200",
                          };
                          return (
                            <span
                              className={`inline-flex px-2.5 py-0.5 rounded-full border text-[11px] font-semibold uppercase tracking-wide ${colorMap[status.color] ?? colorMap.gray}`}
                            >
                              {status.label}
                            </span>
                          );
                        })()}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() =>
                              navigate(
                                `/manager/reward-edit/${rule.reward_rule_id}`,
                              )
                            }
                            className="px-3 py-1.5 text-xs font-semibold bg-purple-50 text-[#852BAF] border border-purple-200 rounded-lg hover:bg-[#852BAF] hover:text-white transition-all cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(rule.reward_rule_id)}
                            className="px-3 py-1.5 text-xs font-semibold bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-600 hover:text-white transition-all cursor-pointer"
                          >
                            Delete
                          </button>
                        </div>
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

export default RewardRule;
