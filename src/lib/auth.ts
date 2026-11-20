import type { NextRequest } from "next/server";

/** Optional password protection, driven by the `DIARY_PASSWORD` env var. */

export const SESSION_COOKIE = "diary_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const encoder = new TextEncoder();

export function authRequired(): boolean {
  const password = process.env.DIARY_PASSWORD;
  return !!password && password.trim().length > 0;
}

function sessionSecret(): string {
  const password = (process.env.DIARY_PASSWORD ?? "").trim();
  const extra = (process.env.DIARY_SESSION_SECRET ?? "").trim();
  return extra ? `${extra}::${password}` : `my-diary::${password}`;
}

async function sign(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(sessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sessionValue(): Promise<string> {
  const issued = "diary-session-v1";
  return `${issued}.${await sign(issued)}`;
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function checkPassword(password: string): Promise<boolean> {
  const expected = (process.env.DIARY_PASSWORD ?? "").trim();
  if (!expected) return true;
  return safeEqual(password, expected);
}

export async function isValidSession(value: string | undefined | null): Promise<boolean> {
  if (!authRequired()) return true;
  if (!value) return false;
  const expected = await sessionValue();
  return safeEqual(value, expected);
}

export async function isAuthorized(request: NextRequest): Promise<boolean> {
  if (!authRequired()) return true;
  return isValidSession(request.cookies.get(SESSION_COOKIE)?.value);
}
