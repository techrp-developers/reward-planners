import { useNavigate } from "react-router-dom";
import errorImage from "../assets/Error.png";
import { useAuth } from "../auth/useAuth";

export default function NotFoundPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const resolveDashboard = (role?: string) => {
    switch (role) {
      case "vendor":
        return "/vendor/dashboard";
      case "vendor_manager":
        return "/manager/dashboard";
      case "warehouse_manager":
        return "/warehouse/dashboard";
      case "admin":
        return "/admin/dashboard";
      default:
        return "/login";
    }
  };

  const handleGoHome = () => {
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }

    navigate(resolveDashboard(user.role), { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FD] px-4">
      <div className="max-w-5xl w-full bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-2">
          {/* LEFT CONTENT */}
          <div className="p-10 flex flex-col justify-center">
            <h1 className="text-6xl font-extrabold tracking-tight text-gray-900">
              404
            </h1>

            <h2 className="mt-2 text-2xl font-bold text-gray-800">
              Page not found
            </h2>

            <p className="mt-4 text-gray-500 leading-relaxed">
              The page you are looking for doesn't exist or may have been moved.
              Please check the URL or return to your dashboard.
            </p>

            <div className="mt-8 flex gap-4">
              <button
                onClick={handleGoHome}
                className="
                  px-6 py-3 rounded-xl font-semibold text-white
                  bg-gradient-to-r from-[#852BAF] to-[#FC3F78]
                  hover:bg-gradient-to-r hover:from-[#FC3F78] hover:to-[#852BAF]
                           hover:shadow-xl active:scale-95
                           disabled:opacity-60 disabled:cursor-not-allowed
                           inline-flex items-center justify-center cursor-pointer"
                
              >
                Go to Home
              </button>

              <button
                onClick={() => navigate(-1)}
                className="
                  px-6 py-3 rounded-xl font-semibold
                  border border-gray-300 text-gray-700
                  hover:bg-gray-100 transition-all cursor-pointer
                "
              >
                Go Back
              </button>
            </div>
          </div>

          {/* RIGHT IMAGE */}
          <div className="relative flex items-center justify-center bg-gradient-to-br from-[#852BAF] to-[#FC3F78]">
            <img
              src={errorImage}
              alt="Page not found"
              className="max-w-[90%] drop-shadow-2xl"
            />

            {/* Decorative blur */}
            <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white opacity-10 rounded-full"></div>
          </div>
        </div>
      </div>
    </div>
  );
}
