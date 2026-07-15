import { api } from "./api";

export async function login(username: string, password: string) {
  const res = await api.post("/auth/login/", { username, password });
  localStorage.setItem("access", res.data.access);
  localStorage.setItem("refresh", res.data.refresh);
  return res.data;
}

export async function me() {
  const res = await api.get("/auth/me/");
  return res.data as { id: string; username: string; role: "ADMIN" | "OWNER" | "PLAYER" };
}

export async function register(payload: {
  username: string;
  email?: string;
  password: string;
  role: "OWNER" | "PLAYER";
}) {
  const res = await api.post("/auth/register/", payload);
  return res.data as { id: string; username: string; role: "OWNER" | "PLAYER" };
}

// export function logout() {
//   localStorage.removeItem("access");
//   localStorage.removeItem("refresh");
// }



export async function logout() {
  try {
    await api.post("/auth/logout/");
  } finally {
    localStorage.removeItem("access");
    localStorage.removeItem("refresh");
  }
}
