import { Outlet } from "react-router-dom";

export default function AuthLayout() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#852BAF] to-[#FC3F78]">
      <Outlet />
    </div>
  );
}
