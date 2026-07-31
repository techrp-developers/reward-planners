import { useContext } from "react";
import { AuthContext } from "./AuthContext";
import type { AuthContextType } from "./AuthTypes";

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    throw new Error("useAuth must be inside AuthProvider");
  }

  return ctx;
};
