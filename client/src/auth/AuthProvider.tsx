import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { AxiosError } from "axios";

import { api } from "../api/api";
import { AuthContext } from "./AuthContext";
import type { User } from "./AuthTypes";

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

    default:
      return "/";
  }
};
  const login = async (email: string, password: string, role: User["role"]) => {
    try {
      setLoading(true);
      setError(null);

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
