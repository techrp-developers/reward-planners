import { FiList } from "react-icons/fi";
import ComingSoon from "../../shared/components/ComingSoon";

export default function ServiceListingsPage() {
  return (
    <ComingSoon
      title="Service Listings"
      description="Per-partner service catalogs and rate card management are on the roadmap."
      Icon={FiList}
    />
  );
}
