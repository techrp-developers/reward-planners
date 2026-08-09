import axios from "axios";
import { SERVER_CONFIG } from "../config/serverConfig";

const HR_API_BASE_URL = SERVER_CONFIG.apiBaseUrl;

export const hrApi = axios.create({
  baseURL: HR_API_BASE_URL,
});

hrApi.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");

  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});
