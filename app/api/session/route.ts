import { NextResponse } from "next/server";
export async function DELETE() {
  const response = NextResponse.json({ data: { message: "Signed out." } });
  response.cookies.set("fgbmfi_connect_token", "", {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "lax", path: "/", maxAge: 0,
  });
  return response;
}
