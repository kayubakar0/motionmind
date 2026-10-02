import { defineConfig } from "drizzle-kit";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function readEnvFile(path: string): Record<string, string> {
  try {
    const text = readFileSync(path, "utf8");
    const out: Record<string, string> = {};
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

const fileEnv = readEnvFile(join(dirname(fileURLToPath(import.meta.url)), ".env"));

function pick(name: string, fallback = ""): string {
  return fileEnv[name] ?? process.env[name] ?? fallback;
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    host: pick("DB_HOST", "127.0.0.1"),
    port: Number(pick("DB_PORT", "5432")),
    database: pick("DB_DATABASE", "cyclebundb"),
    user: pick("DB_USERNAME", "postgres"),
    password: pick("DB_PASSWORD", "kybk"),
  },
});
