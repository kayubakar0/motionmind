import { eq } from "drizzle-orm";
import { db } from "../../db";
import { stravaConnections, type User } from "../../db/schema";
import { env } from "../../lib/env";
import { decrypt, encrypt } from "../../lib/encrypt";
import { ApiError } from "../../http/helpers";

const STRAVA_API = "https://www.strava.com/api/v3";
const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";

export function buildAuthorizeUrl(): string {
  if (!env.STRAVA_CLIENT_ID || !env.STRAVA_CLIENT_SECRET) {
    throw new ApiError(
      400,
      "Integrasi Strava belum dikonfigurasi: isi STRAVA_CLIENT_ID & STRAVA_CLIENT_SECRET di server/.env lalu restart server."
    );
  }
  const params = new URLSearchParams({
    client_id: env.STRAVA_CLIENT_ID,
    redirect_uri: `${env.CLIENT_URL}/strava/callback`,
    response_type: "code",
    approval_prompt: "auto",
    scope: "read,profile:read_all,activity:read_all,activity:write",
  });
  return `https://www.strava.com/oauth/authorize?${params.toString()}`;
}

export interface StravaTokenResponse {
  token_type: string;
  expires_at: number;
  expires_in: number;
  refresh_token: string;
  access_token: string;
  athlete: { id: number };
}

export async function exchangeCode(code: string): Promise<StravaTokenResponse> {
  if (!env.STRAVA_CLIENT_ID || !env.STRAVA_CLIENT_SECRET)
    throw new ApiError(400, "Kredensial Strava belum diatur di server .env");
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.STRAVA_CLIENT_ID,
      client_secret: env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new ApiError(400, `Gagal exchange token Strava: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as StravaTokenResponse;
}

export async function saveConnection(userId: string, tokenRes: StravaTokenResponse) {
  await db
    .insert(stravaConnections)
    .values({
      userId,
      athleteId: String(tokenRes.athlete.id),
      accessTokenEnc: encrypt(tokenRes.access_token),
      refreshTokenEnc: encrypt(tokenRes.refresh_token),
      expiresAt: new Date(tokenRes.expires_at * 1000),
      scope: "read,profile:read_all,activity:read_all,activity:write",
    })
    .onConflictDoUpdate({
      target: stravaConnections.userId,
      set: {
        athleteId: String(tokenRes.athlete.id),
        accessTokenEnc: encrypt(tokenRes.access_token),
        refreshTokenEnc: encrypt(tokenRes.refresh_token),
        expiresAt: new Date(tokenRes.expires_at * 1000),
      },
    });
}

export async function getConnection(userId: string) {
  const rows = await db.select().from(stravaConnections).where(eq(stravaConnections.userId, userId)).limit(1);
  return rows[0] ?? null;
}

export async function getValidAccessToken(userId: string): Promise<string> {
  const conn = await getConnection(userId);
  if (!conn) throw new ApiError(400, "Akun Strava belum terhubung");
  let accessToken: string;
  try {
    accessToken = decrypt(conn.accessTokenEnc);
  } catch {
    throw new ApiError(
      400,
      "Token Strava tidak dapat dibuka (APP_SECRET pernah berubah). Putuskan lalu hubungkan kembali Strava di Pengaturan."
    );
  }
  if (conn.expiresAt.getTime() - 120_000 > Date.now()) {
    return accessToken;
  }
  let refreshToken: string;
  try {
    refreshToken = decrypt(conn.refreshTokenEnc);
  } catch {
    throw new ApiError(
      400,
      "Token Strava tidak dapat dibuka (APP_SECRET pernah berubah). Putuskan lalu hubungkan kembali Strava di Pengaturan."
    );
  }
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.STRAVA_CLIENT_ID,
      client_secret: env.STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new ApiError(400, `Gagal refresh token Strava: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as StravaTokenResponse;
  await db
    .update(stravaConnections)
    .set({
      accessTokenEnc: encrypt(data.access_token),
      refreshTokenEnc: encrypt(data.refresh_token),
      expiresAt: new Date(data.expires_at * 1000),
    })
    .where(eq(stravaConnections.userId, userId));
  return data.access_token;
}

export async function stravaGet<T>(path: string, token: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(`${STRAVA_API}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("Retry-After") ?? "60");
    throw new ApiError(429, `Rate limit Strava tercapai. Coba lagi dalam ${retryAfter} detik.`);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Strava API ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export async function stravaPost<T>(path: string, token: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${STRAVA_API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 429) {
    throw new ApiError(429, "Rate limit Strava tercapai saat upload aktivitas.");
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Strava API ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export interface StravaActivitySummary {
  id: number;
  name: string;
  type: string;
  sport_type?: string;
  start_date: string;
  start_date_local: string;
  timezone?: string;
  elapsed_time: number;
  moving_time: number;
  distance: number;
  total_elevation_gain: number;
  average_speed: number | null;
  max_speed: number | null;
  average_heartrate: number | null;
  max_heartrate: number | null;
  average_cadence: number | null;
  average_watts: number | null;
  max_watts: number | null;
  kilojoules: number | null;
  calories?: number | null;
  device_name?: string | null;
  trainer: boolean;
  commute: boolean;
  description: string | null;
  [key: string]: unknown;
}
