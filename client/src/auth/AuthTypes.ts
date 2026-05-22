export interface User {
  name: string;
  user_id: number;
  email: string;
  role: "vendor" | "vendor_manager" | "admin" | "warehouse_manager" | "hr";
  phone?: string;
}

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  initializing: boolean;
  error: string | null;
  login: (email: string, password: string, role: User["role"]) => Promise<void>;
  register: (
    name: string,
    email: string,
    password: string,
    role: User["role"],
    phone?: string
  ) => Promise<void>;
  verifyOtp: (email: string, otp: string) => Promise<void>;
  resendOtp: (email: string) => Promise<void>;
  logout: () => void;
}
      