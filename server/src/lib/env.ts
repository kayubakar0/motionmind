import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

function loadDotEnv(): Record<string, string> {
  const dir = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [join(dir, "../../.env"), join(dir, "../../../.env")]) {
    try {
      const text = readFileSync(candidate, "utf8");
      const out: Record<string, string> = {};
      for (const line of text.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
      return out;
    } catch {
      continue;
    }
  }
  return {};
}

const fileEnv = loadDotEnv();

for (const [key, value] of Object.entries(fileEnv)) {
  if (process.env[key] !== undefined && process.env[key] !== value && key === "PORT") {
    console.warn(`[env] PORT dari shell (${process.env[key]}) diabaikan — memakai PORT dari server/.env (${value})`);
  }
  process.env[key] = value;
}

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Env ${name} tidak ditemukan`);
  return v;
}

export const env = {
  DB_HOST: req("DB_HOST", "127.0.0.1"),
  DB_PORT: Number(req("DB_PORT", "5432")),
  DB_DATABASE: req("DB_DATABASE", "cyclebundb"),
  DB_USERNAME: req("DB_USERNAME", "postgres"),
  DB_PASSWORD: req("DB_PASSWORD", "kybk"),
  PORT: Number(req("PORT", "3000")),
  CLIENT_URL: req("CLIENT_URL", "http://localhost:5173"),
  APP_SECRET: req("APP_SECRET", "motionmind-dev-secret-please-change-me-123456"),
  STRAVA_CLIENT_ID: process.env.STRAVA_CLIENT_ID ?? "",
  STRAVA_CLIENT_SECRET: process.env.STRAVA_CLIENT_SECRET ?? "",
  ADMIN_USERNAME: req("ADMIN_USERNAME", "admin"),
  ADMIN_PASSWORD: req("ADMIN_PASSWORD", "admin123"),
  UPLOAD_DIR: req("UPLOAD_DIR", join(dirname(fileURLToPath(import.meta.url)), "../../uploads")),
  IS_DEV: process.env.NODE_ENV !== "production",
};

if (env.APP_SECRET.includes("please-change-me") || env.APP_SECRET.length < 24) {
  console.warn(
    "[env] PERINGATAN: APP_SECRET masih nilai bawaan/terlalu pendek. Ganti dengan string acak ≥32 karakter di server/.env — JANGAN diubah lagi setelah ada data tersimpan (token Strava / API key AI akan tak terbaca)."
  );
}

export const DB_CONNECTION_STRING = `postgres://${encodeURIComponent(env.DB_USERNAME)}:${encodeURIComponent(
  env.DB_PASSWORD
)}@${env.DB_HOST}:${env.DB_PORT}/${env.DB_DATABASE}`;
