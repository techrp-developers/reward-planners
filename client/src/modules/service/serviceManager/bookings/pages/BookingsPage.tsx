import { FiCalendar } from "react-icons/fi";
import ComingSoon from "../../shared/components/ComingSoon";

export default function BookingsPage() {
  return (
    <ComingSoon
      title="Bookings"
      description="Employee booking history and status tracking are on the roadmap."
      Icon={FiCalendar}
    />
  );
}
