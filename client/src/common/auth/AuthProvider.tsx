import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { AxiosError } from "axios";

import { api } from "../api/api";
import { AuthContext } from "./AuthContext";
import type { User } from "./AuthTypes";

// Static, local-only credentials for the Services module so that team can
// build against the UI before the backend has a service_manager auth
// endpoint. No Axios call is made for this role — see login() below.
const STATIC_SERVICE_MANAGER = {
  email: "service@rewardsplanners.com",
  password: "Service@123",
  token: "service-static-token",
  user: {
    user_id: 9999,
    name: "Service Manager",
    email: "service@rewardsplanners.com",
    role: "service_manager" as const,
  },
};

// Static login for Service Partner
const STATIC_SERVICE_PARTNER = {
  email: "partner@service.com",
  password: "Partner@123",
  token: "service-partner-static-token",
  user: {
    user_id: 10001,
    name: "Service Partner",
    email: "partner@service.com",
    role: "service_partner" as const,
  },
};

// Static local login for Warehouse Manager so the new warehouse_manager
// module/dashboard can be checked without a real backend user row.
const STATIC_WAREHOUSE_MANAGER = {
  email: "warehouse@rewardsplanners.com",
  password: "Warehouse@123",
  token: "warehouse-manager-static-token",
  user: {
    user_id: 10002,
    name: "Warehouse Manager",
    email: "warehouse@rewardsplanners.com",
    role: "warehouse_manager" as const,
  },
};

// Static local login for Flea Market so the new flea_market module/dashboard
// can be checked without a real backend user row.
const STATIC_FLEA_MARKET_MANAGER = {
  email: "fleamarket@rewardsplanners.com",
  password: "FleaMarket@123",
  token: "flea-market-manager-static-token",
  user: {
    user_id: 10003,
    name: "Flea Market Manager",
    email: "fleamarket@rewardsplanners.com",
    role: "flea_market_manager" as const,
  },
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const navigate = useNavigate();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const u = localStorage.getItem("user");
    const t = localStorage.getItem("token");

    if (u && t) {
      try {
        setUser(JSON.parse(u));
      } catch {
        localStorage.clear();
      }
    } else if (import.meta.env.DEV && import.meta.env.VITE_DEV_FAKE_MANAGER === "true") {
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
    }

    setInitializing(false);
  }, []);

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
  const login = async (email: string, password: string, role: User["role"]) => {
    setError(null);

    // Services module: static local auth, no backend call. Kept isolated
    // from the API-backed flow below so Vendor/Manager/Admin/HR/Warehouse
    // logins are completely untouched.
    if (
      email.trim().toLowerCase() === STATIC_SERVICE_MANAGER.email &&
      password === STATIC_SERVICE_MANAGER.password
    ) {
      setLoading(true);
      localStorage.setItem("token", STATIC_SERVICE_MANAGER.token);
      localStorage.setItem("user", JSON.stringify(STATIC_SERVICE_MANAGER.user));
      setUser(STATIC_SERVICE_MANAGER.user);
      setLoading(false);
      navigate(resolveDashboard("service_manager"), { replace: true });
      return;
    }

    if (
      email.trim().toLowerCase() === STATIC_SERVICE_PARTNER.email &&
      password === STATIC_SERVICE_PARTNER.password
    ) {
      setLoading(true);
      localStorage.setItem("token", STATIC_SERVICE_PARTNER.token);
      localStorage.setItem("user", JSON.stringify(STATIC_SERVICE_PARTNER.user));
      setUser(STATIC_SERVICE_PARTNER.user);
      setLoading(false);
      navigate(resolveDashboard("service_partner"), { replace: true });
      return;
    }

    if (
      email.trim().toLowerCase() === STATIC_WAREHOUSE_MANAGER.email &&
      password === STATIC_WAREHOUSE_MANAGER.password
    ) {
      setLoading(true);
      localStorage.setItem("token", STATIC_WAREHOUSE_MANAGER.token);
      localStorage.setItem("user", JSON.stringify(STATIC_WAREHOUSE_MANAGER.user));
      setUser(STATIC_WAREHOUSE_MANAGER.user);
      setLoading(false);
      navigate(resolveDashboard("warehouse_manager"), { replace: true });
      return;
    }

    if (
      email.trim().toLowerCase() === STATIC_FLEA_MARKET_MANAGER.email &&
      password === STATIC_FLEA_MARKET_MANAGER.password
    ) {
      setLoading(true);
      localStorage.setItem("token", STATIC_FLEA_MARKET_MANAGER.token);
      localStorage.setItem("user", JSON.stringify(STATIC_FLEA_MARKET_MANAGER.user));
      setUser(STATIC_FLEA_MARKET_MANAGER.user);
      setLoading(false);
      navigate(resolveDashboard("flea_market_manager"), { replace: true });
      return;
    }

    try {
      setLoading(true);

      const { data } = await api.post(`/auth/${resolveRoute(role)}/login`, {
        email,
        password,
      });

      if (!data?.success) {
        throw new Error(data?.message || "Login failed");
      }

      const { token, user } = data.data;

      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(user));
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
    } catch (err: any) {
      setError(
        err?.response?.data?.message || err.message || "Registration failed",
      );
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

      // const { token, user } = data.data;

      // localStorage.setItem("token", token);
      // localStorage.setItem("user", JSON.stringify(user));
      // setUser(user);

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
    } catch (err: any) {
      setError(err?.response?.data?.message || "Invalid OTP");
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
    } catch (err: any) {
      setError(
        err?.response?.data?.message || err.message || "Failed to resend OTP",
      );
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
    navigate("/login");
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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
