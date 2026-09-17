import { useEffect, useRef, useState } from "react";
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
  // Any explicit auth action invalidates older /auth/me requests. Without
  // this guard a slow response for the previous account can arrive after a
  // successful login and replace the newly authenticated user in React state.
  const authGeneration = useRef(0);

  useEffect(() => {
    let active = true;
    // One-time cleanup for sessions created by the previous localStorage flow.
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    const restoreSession = async () => {
      const generation = authGeneration.current;
      try {
        const { data } = await api.get("/auth/me", {
          headers: { "Cache-Control": "no-cache" },
          params: { _session: Date.now() },
        });
        if (active && generation === authGeneration.current && data?.success) {
          setUser(data.data);
        }
      } catch {
        if (active && generation === authGeneration.current) setUser(null);
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

    return () => { active = false; };
  }, []);

  useEffect(() => {
    const expireSession = () => {
      authGeneration.current += 1;
      setUser(null);
      const path = window.location.pathname.replace(/^\/crm(?=\/|$)/, "") || "/";
      const publicAuthPaths = new Set([
        "/login",
        "/register",
        "/forgot-password",
        "/reset-password",
        "/verify-otp",
      ]);
      if (!publicAuthPaths.has(path)) navigate("/login", { replace: true });
    };
    window.addEventListener("auth:session-expired", expireSession);
    return () => { window.removeEventListener("auth:session-expired", expireSession); };
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

    case "rm":
      return "rm";

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

    case "rm":
      return "/rm/dashboard";

    default:
      return "/";
  }
};
  const login = async (email: string, password: string) => {
    setError(null);
    authGeneration.current += 1;
    // Never allow a previous account's role to influence a new login attempt.
    setUser(null);

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

      const rawLoginUser = data.data?.user as User | undefined;
      const normalizedRole = String(rawLoginUser?.role || "").trim().toLowerCase() as User["role"];
      const loginUser = rawLoginUser ? { ...rawLoginUser, role: normalizedRole } : undefined;
      if (!loginUser) throw new Error("The server did not return the signed-in user.");

      const dashboard = resolveDashboard(loginUser.role);
      if (dashboard === "/") {
        throw new Error(`No portal is configured for the account role: ${loginUser.role || "unknown"}.`);
      }

      // The login response is authoritative. Session restoration through
      // /auth/me remains responsible for refreshes and future page loads.
      setUser(loginUser);

      navigate(dashboard, { replace: true });
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
      throw err;
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
    authGeneration.current += 1;
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
