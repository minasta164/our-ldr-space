export const AUTH_TOKEN = (import.meta as any).env?.VITE_AUTH_TOKEN || "secret-token";

const SESSION_KEY = "acaya_session_token";

export function getSessionToken(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch (e) {
    return null;
  }
}

export function setSessionToken(token: string): void {
  try {
    localStorage.setItem(SESSION_KEY, token);
  } catch (e) {}
}

export function clearSessionToken(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch (e) {}
}

export async function safeParseJson<T = any>(response: Response): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      const json = await response.json();
      const isSuccess = response.ok && (json.success !== false);
      return { success: isSuccess, data: json, error: json?.error };
    }
    const text = await response.text();
    try {
      const json = JSON.parse(text);
      const isSuccess = response.ok && (json.success !== false);
      return { success: isSuccess, data: json, error: json?.error };
    } catch {
      return {
        success: false,
        error: response.ok
          ? "Respon server tidak valid."
          : `Server mengembalikan status ${response.status}. Silakan coba lagi dalam beberapa detik.`,
      };
    }
  } catch (err: any) {
    return {
      success: false,
      error: "Gagal memproses data server. Silakan coba lagi.",
    };
  }
}

export async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const token = getSessionToken();
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
    "x-auth-token": AUTH_TOKEN,
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
    headers["x-session-token"] = token;
  }

  const response = await fetch(url, { ...options, headers });
  
  // If unauthorized, notify application to show login
  if (response.status === 401 && !url.includes("/api/auth/login") && !url.includes("/api/auth/recovery")) {
    window.dispatchEvent(new CustomEvent("acaya_unauthorized"));
  }

  return response;
}
