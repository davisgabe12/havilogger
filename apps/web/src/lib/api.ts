import { supabase } from "@/lib/supabase/client";

type ApiFetchOptions = RequestInit & {
  familyId?: string | null;
  childId?: string | null;
};

let cachedFamilyId: string | null | undefined;
let familyIdPromise: Promise<string | null> | null = null;
const sessionRetryDelayMs = 250;

const wait = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const resolveActiveFamilyId = async (): Promise<string | null> => {
  if (cachedFamilyId !== undefined && cachedFamilyId !== null) {
    return cachedFamilyId;
  }
  if (familyIdPromise) return familyIdPromise;
  familyIdPromise = fetch("/api/active-family", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  })
    .then(async (res) => {
      const data = (await res.json().catch(() => null)) as
        | { familyId?: string | null }
        | null;
      cachedFamilyId =
        typeof data?.familyId === "string" && data.familyId.length > 0
          ? data.familyId
          : null;
      return cachedFamilyId;
    })
    .finally(() => {
      familyIdPromise = null;
    });
  return familyIdPromise;
};

export const apiFetch = async (
  input: RequestInfo | URL,
  options: ApiFetchOptions = {},
): Promise<Response> => {
  const { data: sessionData } = await supabase.auth.getSession();
  let session = sessionData?.session ?? null;
  if (!session) {
    await wait(sessionRetryDelayMs);
    const retry = await supabase.auth.getSession();
    session = retry.data?.session ?? null;
  }
  let token = session?.access_token ?? null;

  const headers = new Headers(options.headers ?? {});
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const familyId =
    typeof options.familyId === "string" ? options.familyId : await resolveActiveFamilyId();
  if (familyId) {
    headers.set("X-Havi-Family-Id", familyId);
  }
  if (typeof options.childId === "string" && options.childId.length > 0) {
    headers.set("X-Havi-Child-Id", options.childId);
  }

  const urlString = typeof input === "string" ? input : input.toString();
  let path = urlString;
  if (urlString.startsWith("http")) {
    const parsed = new URL(urlString);
    path = `${parsed.pathname}${parsed.search}`;
  }
  const needsAuth =
    (path.includes("/api/v1/") && !path.includes("/api/v1/share/")) ||
    path.startsWith("/events?");
  if (!token && needsAuth) {
    if (process.env.NEXT_PUBLIC_DEBUG_AUTH === "1") {
      // eslint-disable-next-line no-console
      console.info("[apiFetch] auth", {
        tokenPresent: false,
        path,
        status: 401,
      });
    }
    return new Response(
      JSON.stringify({ detail: "Missing auth session." }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  let response = await fetch(input, { ...options, headers });

  if (response.status === 401 && token) {
    const { data: refreshed, error } = await supabase.auth.refreshSession();
    const nextToken = refreshed?.session?.access_token ?? null;
    if (!error && nextToken && nextToken !== token) {
      token = nextToken;
      const retryHeaders = new Headers(options.headers ?? {});
      retryHeaders.set("Authorization", `Bearer ${token}`);
      if (familyId) {
        retryHeaders.set("X-Havi-Family-Id", familyId);
      }
      if (typeof options.childId === "string" && options.childId.length > 0) {
        retryHeaders.set("X-Havi-Child-Id", options.childId);
      }
      response = await fetch(input, { ...options, headers: retryHeaders });
    }
  }

  if (!response.ok && process.env.NODE_ENV !== "production") {
    const bodyText = await response.clone().text();
    // eslint-disable-next-line no-console
    console.error("[apiFetch] request failed", {
      status: response.status,
      url: typeof input === "string" ? input : input.toString(),
      body: bodyText,
    });
  }

  if (process.env.NEXT_PUBLIC_DEBUG_AUTH === "1") {
    // eslint-disable-next-line no-console
    console.info("[apiFetch] auth", {
      tokenPresent: Boolean(token),
      path,
      status: response.status,
    });
  }

  return response;
};
