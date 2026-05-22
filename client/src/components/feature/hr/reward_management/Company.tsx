import React, { useState } from 'react';
import { FiPieChart, FiInfo, FiTrendingUp, FiCalendar } from 'react-icons/fi';

const CompanyForm: React.FC = () => {
  const [distributionMode, setDistributionMode] = useState<'equal' | 'performance'>('equal');

  return (
    <div className="space-y-8 duration-500 animate-in fade-in slide-in-from-bottom-2">
      
      {/* SECTION 1: BUDGET INFO */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
            Total Reward Budget
            <FiInfo className="w-3 h-3 text-gray-400" />
          </label>
          <div className="relative group">
            {/* RUPEE SYMBOL REPLACED HERE */}
            <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
              <span className="font-semibold text-gray-400 transition-colors group-focus-within:text-purple-500">
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

        <div className="space-y-2">
          <label className="text-sm font-bold text-gray-700">Distribution Date</label>
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
              <FiCalendar className="text-gray-400 transition-colors group-focus-within:text-purple-500" />
            </div>
            <input
              type="date"
              className="w-full py-3 pl-10 pr-4 font-medium text-gray-900 transition-all border border-gray-100 outline-none bg-gray-50 rounded-2xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
            />
          </div>
        </div>
      </div>

      {/* SECTION 2: DISTRIBUTION LOGIC */}
      <div className="space-y-4">
        <label className="text-sm font-bold text-gray-700">Reward Logic</label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <button
            onClick={() => setDistributionMode('equal')}
            className={`p-5 rounded-3xl border-2 text-left transition-all duration-300 ${
              distributionMode === 'equal'
                ? 'border-purple-600 bg-purple-50/50 shadow-md translate-y-[-2px]'
                : 'border-gray-50 bg-gray-50/30 hover:border-gray-200'
            }`}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 transition-colors ${
              distributionMode === 'equal' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-400'
            }`}>
              <FiPieChart className="w-5 h-5" />
            </div>
            <div className="text-sm font-bold text-gray-900">Equal Distribution</div>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">
              Every employee receives the same amount.
            </p>
          </button>

          <button
            onClick={() => setDistributionMode('performance')}
            className={`p-5 rounded-3xl border-2 text-left transition-all duration-300 ${
              distributionMode === 'performance'
                ? 'border-purple-600 bg-purple-50/50 shadow-md translate-y-[-2px]'
                : 'border-gray-50 bg-gray-50/30 hover:border-gray-200'
            }`}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 transition-colors ${
              distributionMode === 'performance' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-400'
            }`}>
              <FiTrendingUp className="w-5 h-5" />
            </div>
            <div className="text-sm font-bold text-gray-900">Performance Based</div>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">
              Distributed based on CTC and appraisal score.
            </p>
          </button>
        </div>
      </div>

      {/* SECTION 3: POLICY NOTE */}
      <div className="p-6 space-y-3 border bg-amber-50/40 border-amber-100 rounded-3xl">
        <div className="flex items-center gap-2 text-amber-700">
          <FiInfo className="w-4 h-4" />
          <span className="text-[10px] font-black tracking-widest uppercase">Company Policy Note</span>
        </div>
        <p className="text-xs leading-relaxed text-amber-800/80">
          Company-wide rewards will be distributed to all active employees currently on payroll. 
          New hires in their probation period (less than 90 days) will be excluded by default.
        </p>
      </div>

      {/* FOOTER ACTIONS */}
      <div className="flex items-center justify-end gap-4 pt-6 border-t border-gray-100">
        <button className="px-6 py-2.5 text-sm font-semibold text-gray-400 hover:text-gray-600 transition-colors">
          Discard
        </button>
        <button className="px-10 py-3 bg-gray-900 text-white text-sm font-bold rounded-2xl shadow-xl shadow-gray-200 hover:bg-black hover:scale-[1.02] active:scale-95 transition-all">
          Confirm Allocation
        </button>
      </div>
    </div>
  );
};

export default CompanyForm;