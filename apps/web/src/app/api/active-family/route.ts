import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const COOKIE_NAME = "havi_active_family_id";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export async function GET() {
  const cookieStore = await cookies();
  const value = cookieStore.get(COOKIE_NAME)?.value ?? null;
  return NextResponse.json({ familyId: value });
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const body = (await request.json().catch(() => null)) as
    | { familyId?: string }
    | null;
  const familyId = typeof body?.familyId === "string" ? body.familyId.trim() : "";

  if (!familyId) {
    return NextResponse.json({ error: "familyId is required" }, { status: 400 });
  }

  cookieStore.set(COOKIE_NAME, familyId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });

  return NextResponse.json({ ok: true, familyId });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return NextResponse.json({ ok: true });
}
