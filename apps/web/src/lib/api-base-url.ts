const PROD_API_BASE_URL = "https://api-production-0a5d.up.railway.app";
const LOCAL_API_BASE_URL = "http://127.0.0.1:8000";

type ApiBaseEnv = {
  NEXT_PUBLIC_API_BASE_URL?: string;
  NODE_ENV?: string;
};

export const resolveApiBaseUrl = (
  env: ApiBaseEnv = process.env,
  runtimeHost?: string | null,
): string => {
  const configured = env.NEXT_PUBLIC_API_BASE_URL?.trim() ?? "";
  if (configured) return configured;

  const host =
    runtimeHost ??
    (typeof window !== "undefined" ? window.location.hostname : null);
  if (host && host !== "localhost" && host !== "127.0.0.1") {
    return PROD_API_BASE_URL;
  }

  return env.NODE_ENV === "production" ? PROD_API_BASE_URL : LOCAL_API_BASE_URL;
};

export const API_BASE_URL = resolveApiBaseUrl();
