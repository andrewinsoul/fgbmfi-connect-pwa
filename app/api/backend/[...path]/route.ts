import { NextRequest, NextResponse } from "next/server";

const API_ORIGIN = (process.env.PHOENIX_API_URL || "http://localhost:4000").replace(/\/+$/, "");
const TOKEN_COOKIE = "fgbmfi_connect_token";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const pathname = path.join("/");
  const incomingUrl = new URL(request.url);
  const target = `${API_ORIGIN}/api/v1/${pathname}${incomingUrl.search}`;
  const token = request.cookies.get(TOKEN_COOKIE)?.value;
  const headers = new Headers({ Accept: "application/json" });
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  if (token) headers.set("authorization", `Bearer ${token}`);

  let body: string | undefined;
  if (!["GET", "HEAD"].includes(request.method)) body = await request.text();

  try {
    const upstream = await fetch(target, { method: request.method, headers, body, cache: "no-store" });
    const raw = await upstream.text();
    let data: any;
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { error: { message: "The API returned an unreadable response." } }; }

    const response = NextResponse.json(data, { status: upstream.status });
    const authRoute = pathname === "auth/login" || pathname === "auth/register";
    if (authRoute && upstream.ok && data?.data?.token) {
      response.cookies.set(TOKEN_COOKIE, data.data.token, {
        httpOnly: true, secure: process.env.NODE_ENV === "production",
        sameSite: "lax", path: "/", maxAge: COOKIE_MAX_AGE,
      });
      // The browser doesn't need direct access to the bearer token.
      delete data.data.token;
      response.headers.set("content-type", "application/json");
      return NextResponse.json(data, {
        status: upstream.status,
        headers: response.headers,
      });
    }
    if (pathname === "auth/logout") {
      response.cookies.set(TOKEN_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
    }
    return response;
  } catch {
    return NextResponse.json({ error: { code: "api_unavailable", message: "Can't reach the fellowship server. Check that the Phoenix API is running." } }, { status: 502 });
  }
}
export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
