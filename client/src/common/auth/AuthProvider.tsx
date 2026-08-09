import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { AxiosError } from "axios";

import { api } from "../api/api";
import { AuthContext } from "./AuthContext";
import type { User } from "./AuthTypes";

const authErrorMessage = (error: unknown, fallback: string) =>
  error instanceof AxiosError
    ? String(error.response?.data?.message || fallback)
    : error instanceof Error ? error.message : fallback;

// Static, local-only credentials for the Services module so that team can
// build against the UI before the backend has a service_manager auth
// endpoint. No Axios call is made for this role — see login() below.

// Static login for Service Partner

// Static local login for Warehouse Manager so the new warehouse_manager
// module/dashboard can be checked without a real backend user row.

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const navigate = useNavigate();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    // One-time cleanup for sessions created by the previous localStorage flow.
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    const restoreSession = async () => {
      try {
        const { data } = await api.get("/auth/me");
        if (active && data?.success) setUser(data.data);
      } catch {
        if (active) setUser(null);
      } finally {
        if (active) setInitializing(false);
      }
    };

    if (import.meta.env.DEV && import.meta.env.VITE_DEV_FAKE_MANAGER === "true") {
      // DEV-ONLY bypass (never active in a production build): fakes a logged-in
      // manager so ManagerLayout/ProtectedRoute render without a real backend
      // session. Set via client/.env.local (gitignored). Screens that call the
      // real API (Vendors, Products, etc.) will still 401 against production
      // since there's no real token — this only unlocks the static/mock
      // Service Partners screens for local UI testing. Remove once real
      // manager credentials are available.
      setUser({
        name: "Dev Manager",
        user_id: 0,
        email: "dev-manager@local.test",
        role: "vendor_manager",
      });
      setInitializing(false);
    } else void restoreSession();

    const expireSession = () => { setUser(null); navigate("/login", { replace: true }); };
    window.addEventListener("auth:session-expired", expireSession);
    return () => { active = false; window.removeEventListener("auth:session-expired", expireSession); };
  }, [navigate]);

  const resolveRoute = (role: User["role"]) => {
  switch (role) {
    case "vendor":
      return "vendor";

    case "vendor_manager":
      return "manager";

    case "warehouse_manager":
      return "warehouse_manager";

    case "hr":
      return "hr";

    case "admin":
      return "admin";

    case "service_manager":
      return "service";

    case "service_partner":
      return "service-partner";

    case "flea_market_manager":
      return "flea_market_manager";

    default:
      return "admin";
  }
};

  const resolveDashboard = (role: User["role"]) => {
  switch (role) {
    case "vendor":
      return "/vendor/dashboard";

    case "vendor_manager":
      return "/manager/dashboard";

    case "warehouse_manager":
      return "/warehouse/dashboard";

    case "hr":
      return "/hr/dashboard";

    case "admin":
      return "/admin/dashboard";

    case "service_manager":
      return "/service/dashboard";

    case "service_partner":
      return "/service-partner/dashboard";

    case "flea_market_manager":
      return "/flea-market/dashboard";

    default:
      return "/";
  }
};
  const login = async (email: string, password: string) => {
    setError(null);

    try {
      setLoading(true);

      // Role is no longer chosen on the login form — the backend looks the
      // user up by email and returns whichever role is on their account, and
      // we route to that role's dashboard below.
      const { data } = await api.post(`/auth/login`, {
        email,
        password,
      });

      if (!data?.success) {
        throw new Error(data?.message || "Login failed");
      }

      const { user } = data.data;
      setUser(user);

      navigate(resolveDashboard(user.role), { replace: true });
    } catch (err: unknown) {
      if (err instanceof AxiosError) {
        const code = err.response?.data?.code;

        if (code === "USER_NOT_VERIFIED") {
          const email = err.response?.data?.data?.email;
          const role = err.response?.data?.data?.role;

          sessionStorage.setItem("otp_email", email);
          sessionStorage.setItem("otp_role", role);

          navigate("/verify-otp", { replace: true });
          return;
        }
        setError(err.response?.data?.message ?? "Login failed");
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Login failed");
      }
    } finally {
      setLoading(false);
    }
  };

  const register = async (
    name: string,
    email: string,
    password: string,
    role: User["role"],
    phone?: string,
  ) => {
    try {
      setLoading(true);
      setError(null);

      const route = resolveRoute(role);

      const { data } = await api.post(`/auth/${route}/register`, {
        name,
        email,
        password,
        phone,
      });

      if (!data?.success) {
        throw new Error(data?.message || "Registration failed");
      }

      sessionStorage.setItem("otp_email", email);
      sessionStorage.setItem("otp_role", role);

      navigate("/verify-otp", {
        replace: true,
        state: { email },
      });
    } catch (err: unknown) {
      setError(authErrorMessage(err, "Registration failed"));
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async (email: string, otp: string) => {
    try {
      setLoading(true);
      setError(null);

      // const role = sessionStorage.getItem("otp_role") as User["role"];
      // if (!role) throw new Error("Role not found for OTP verification");

      const { data } = await api.post(`/auth/verify-otp`, {
        email,
        otp,
      });

      if (!data?.success) {
        throw new Error(data?.message || "OTP verification failed");
      }

      sessionStorage.removeItem("otp_email");
      sessionStorage.removeItem("otp_role");

      setError(null);

      // navigate(resolveDashboard(user.role));
      navigate("/login", {
        replace: true,
        state: {
          message: "Account verified successfully. Please login.",
        },
      });
    } catch (err: unknown) {
      setError(authErrorMessage(err, "Invalid OTP"));
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async (email: string) => {
    try {
      setLoading(true);
      setError(null);

      // const role = sessionStorage.getItem("otp_role") as User["role"];
      // if (!role) throw new Error("Role not found for OTP resend");

      const { data } = await api.post(`/auth/resend-otp`, { email });

      if (!data?.success) {
        throw new Error(data?.message || "Failed to resend OTP");
      }
    } catch (err: unknown) {
      setError(authErrorMessage(err, "Failed to resend OTP"));
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch { /* Clear local UI state even if the server is unavailable. */ }
    setUser(null);
    navigate("/login");
  };

  const updateUser = (partial: Partial<User>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...partial };
      return next;
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        initializing,
        error,
        login,
        register,
        verifyOtp,
        resendOtp,
        logout,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
