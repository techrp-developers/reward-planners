import { useEffect, useState } from "react";
import { hrApi } from "../../../common/api/hrApi";
import { Card, PageHeader } from "../components/ui";

import IndividualForm from "./reward_management/Individual";
import TeamForm from "./reward_management/Team";
import CompanyForm from "./reward_management/Company";

type DistributionType = "employee" | "team" | "all";

const options: { value: DistributionType; title: string; description: string }[] = [
  { value: "employee", title: "One person", description: "Recognise someone for something specific" },
  { value: "team", title: "A department", description: "Same points for everyone in a team" },
  { value: "all", title: "Everyone", description: "A thank-you to the whole company" },
];

export default function ManageRewards() {
  const [selectedType, setSelectedType] = useState<DistributionType>("employee");
  const [walletBalance, setWalletBalance] = useState(0);
  const [walletLoading, setWalletLoading] = useState(true);

  useEffect(() => {
    hrApi
      .get("/company-wallet")
      .then((response) => setWalletBalance(Number(response.data?.data?.balance || 0)))
      .catch((error) => console.error("Unable to load company wallet:", error))
      .finally(() => setWalletLoading(false));
  }, []);

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Rewards"
        description="Send points to your people. They can spend them in the Reward Planners app."
        actions={
          <div className="rounded-lg border border-purple-100 bg-purple-50/60 px-4 py-2 text-right">
            <p className="text-xs text-slate-500">Available to give</p>
            <p className="text-lg font-semibold tabular-nums text-[#6E2391]">
              {walletLoading ? "—" : `${walletBalance.toLocaleString()} pts`}
            </p>
          </div>
        }
      />

      <fieldset className="mb-4">
        <legend className="mb-2 text-sm font-medium text-slate-700">Who is this reward for?</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {options.map((option) => {
            const checked = selectedType === option.value;
            return (
              <label
                key={option.value}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border bg-white px-4 py-3 transition-colors ${
                  checked ? "border-[#852BAF] bg-purple-50/50 ring-1 ring-[#852BAF]" : "border-purple-100 hover:border-purple-200"
                }`}
              >
                <input
                  type="radio"
                  name="reward-type"
                  value={option.value}
                  checked={checked}
                  onChange={() => setSelectedType(option.value)}
                  className="mt-0.5 h-4 w-4 accent-[#852BAF]"
                />
                <span>
                  <span className="block text-sm font-medium text-slate-900">{option.title}</span>
                  <span className="text-xs text-slate-500">{option.description}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <Card>
        <div key={selectedType} className="p-5 sm:p-6">
          {selectedType === "employee" && <IndividualForm onAwardComplete={setWalletBalance} />}
          {selectedType === "team" && <TeamForm onAwardComplete={setWalletBalance} />}
          {selectedType === "all" && <CompanyForm onAwardComplete={setWalletBalance} />}
        </div>
      </Card>
    </div>
  );
}
