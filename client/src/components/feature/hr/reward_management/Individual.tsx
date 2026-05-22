import React from "react";
import { FiSearch, FiAlertCircle } from "react-icons/fi";

const IndividualForm: React.FC = () => {
  return (
    <div className="space-y-8 duration-500 animate-in fade-in slide-in-from-bottom-2">
      {/* SECTION 1: SEARCH EMPLOYEE */}
      <div className="space-y-4">
        <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
          Select Employee
        </label>
        <div className="relative group">
          <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
            <FiSearch className="text-gray-400 transition-colors group-focus-within:text-purple-500" />
          </div>
          <input
            type="text"
            placeholder="Search by name, email or employee ID..."
            className="w-full py-3 pr-4 font-medium text-gray-900 transition-all border border-gray-100 outline-none pl-11 bg-gray-50 rounded-2xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 placeholder:text-gray-400"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* SECTION 2: AMOUNT WITH RUPEE LOGO */}
        <div className="space-y-2">
          <label className="text-sm font-bold text-gray-700">
            Reward Amount
          </label>
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
              <span className="font-semibold text-gray-400 transition-colors group-focus-within:text-purple-600">
                ₹
              </span>
            </div>
            <input
              type="number"
              placeholder="0.00"
              className="w-full py-3 pl-10 pr-4 font-medium text-gray-900 transition-all border border-gray-100 outline-none bg-gray-50 rounded-2xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
            />
          </div>
        </div>

        {/* SECTION 3: REASON/CATEGORY */}
        <div className="space-y-2">
          <label className="text-sm font-bold text-gray-700">
            Incentive Category
          </label>
          <select className="w-full px-4 py-3 font-medium text-gray-900 transition-all border border-gray-100 outline-none appearance-none cursor-pointer bg-gray-50 rounded-2xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500">
            <option value="spot">Spot Award</option>
            <option value="performance">Performance Bonus</option>
            <option value="referral">Referral Bonus</option>
            <option value="retention">Retention Incentive</option>
          </select>
        </div>
      </div>

      {/* SECTION 4: REMARKS */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
          Appreciation Note{" "}
          <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
            (Optional)
          </span>
        </label>
        <textarea
          rows={3}
          placeholder="Write a small note for the employee..."
          className="w-full px-4 py-3 font-medium text-gray-900 transition-all border border-gray-100 outline-none resize-none bg-gray-50 rounded-2xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
        />
      </div>

      {/* NOTIFICATION TOGGLE */}
      <div className="flex items-center gap-3 p-4 border border-purple-100 bg-purple-50/50 rounded-2xl">
        <FiAlertCircle className="w-5 h-5 text-purple-600 shrink-0" />
        <p className="text-xs leading-tight text-purple-800">
          The employee will receive an automated email notification and a
          dashboard alert once this reward is approved.
        </p>
      </div>

      {/* ACTION BUTTONS */}
      <div className="flex items-center justify-end gap-4 pt-6 border-t border-gray-50">
        <button className="px-6 py-2.5 text-sm font-semibold text-gray-500 hover:text-gray-700 transition-colors">
          Discard
        </button>
        <button className="px-8 py-3 bg-gray-900 text-white text-sm font-bold rounded-2xl shadow-lg shadow-gray-200 hover:bg-black hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-2">
          Assign Reward
        </button>
      </div>
    </div>
  );
};

export default IndividualForm;
