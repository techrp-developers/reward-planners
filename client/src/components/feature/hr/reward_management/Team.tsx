import React, { useState } from "react";
import { FiUsers, FiLayers, FiChevronDown } from "react-icons/fi";

const TeamForm: React.FC = () => {
  const [splitType, setSplitType] = useState<"equal" | "custom">("equal");

  return (
    <div className="space-y-8 duration-500 animate-in fade-in slide-in-from-bottom-2">
      {/* SECTION 1: TEAM SELECTION */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
            Target Team / Department
          </label>
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
              <FiLayers className="text-gray-400 transition-colors group-focus-within:text-blue-500" />
            </div>
            <select className="w-full py-3 pr-10 font-medium text-gray-900 transition-all border border-gray-100 outline-none appearance-none cursor-pointer pl-11 bg-gray-50 rounded-2xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
              <option value="">Select a Department</option>
              <option value="eng">Engineering</option>
              <option value="mkt">Marketing</option>
              <option value="sales">Sales & Growth</option>
              <option value="hr">Human Resources</option>
            </select>
            <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
              <FiChevronDown className="text-gray-400" />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-bold text-gray-700">Team Budget</label>
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
              <span className="font-semibold text-gray-400 transition-colors group-focus-within:text-blue-600">
                ₹
              </span>
            </div>
            <input
              type="number"
              placeholder="Total amount for team"
              className="w-full py-3 pl-10 pr-4 font-medium text-gray-900 transition-all border border-gray-100 outline-none bg-gray-50 rounded-2xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* SECTION 2: SPLIT LOGIC */}
      <div className="space-y-4">
        <label className="text-sm font-bold text-gray-700">
          Distribution Strategy
        </label>
        <div className="flex p-1.5 bg-gray-100/50 rounded-2xl w-full sm:w-fit">
          <button
            onClick={() => setSplitType("equal")}
            className={`flex-1 sm:flex-none px-6 py-2 rounded-xl text-sm font-bold transition-all ${
              splitType === "equal"
                ? "bg-white text-blue-600 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Equal Split
          </button>
          <button
            onClick={() => setSplitType("custom")}
            className={`flex-1 sm:flex-none px-6 py-2 rounded-xl text-sm font-bold transition-all ${
              splitType === "custom"
                ? "bg-white text-blue-600 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Manager's Discretion
          </button>
        </div>
      </div>

      {/* SECTION 3: TEAM PREVIEW (Aesthetic List) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-bold text-gray-700">
            Members to Reward
          </label>
          <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full uppercase tracking-tighter">
            8 Members Detected
          </span>
        </div>
        <div className="overflow-hidden border border-gray-100 divide-y rounded-2xl divide-gray-50">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex items-center justify-between p-4 transition-colors bg-white hover:bg-gray-50/50"
            >
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 text-xs font-bold text-blue-600 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100">
                  JD
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">
                    Team Member {i}
                  </p>
                  <p className="text-[10px] text-gray-400">Software Engineer</p>
                </div>
              </div>
              <div className="font-mono text-sm font-bold text-gray-600">
                {splitType === "equal" ? "₹ 2,500.00" : "—"}
              </div>
            </div>
          ))}
          <div className="p-3 text-center bg-gray-50/50">
            <button className="text-[11px] font-bold text-blue-600 hover:underline">
              View All Members
            </button>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <div className="flex items-center justify-end gap-4 pt-6 border-t border-gray-50">
        <button className="px-6 py-2.5 text-sm font-semibold text-gray-500 hover:text-gray-700 transition-colors">
          Discard
        </button>
        <button className="px-8 py-3 bg-blue-600 text-white text-sm font-bold rounded-2xl shadow-lg shadow-blue-200 hover:bg-blue-700 hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-2">
          <FiUsers className="w-4 h-4" />
          Distribute to Team
        </button>
      </div>
    </div>
  );
};

export default TeamForm;
