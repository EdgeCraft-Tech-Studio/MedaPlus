import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

const PUBLIC_PATHS = ["/auth/login/", "/auth/register/", "/auth/refresh/"];

api.interceptors.request.use((config) => {
  const url = config.url ?? "";

  // Don’t attach token for public auth endpoints
  if (PUBLIC_PATHS.some((p) => url.includes(p))) return config;

  const token = localStorage.getItem("access");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
