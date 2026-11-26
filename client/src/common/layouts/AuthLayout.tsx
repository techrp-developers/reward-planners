import { Outlet } from "react-router-dom";

export default function AuthLayout() {
  return (
    <div className="min-h-screen bg-[#f8f6fb]">
      <Outlet />
    </div>
  );
}
