import { getIronSession, SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export type SessionData = {
  userId?: string;
};

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET!,
  cookieName: "wr_session",
  ttl: 60 * 60 * 8, // 8時間
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    // HTTPS運用時は COOKIE_SECURE=1 を設定する
    secure: process.env.COOKIE_SECURE === "1",
  },
};

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}
