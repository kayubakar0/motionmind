import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { aiLogs, aiProviders, type AiProvider } from "../db/schema";
import { decrypt } from "../lib/encrypt";
import { ApiError } from "../http/helpers";

export async function getActiveProvider(): Promise<AiProvider> {
  const rows = await db
    .select()
    .from(aiProviders)
    .where(eq(aiProviders.isActive, true))
    .orderBy(desc(aiProviders.createdAt))
    .limit(1);
  if (rows.length === 0) {
    throw new ApiError(400, "Belum ada AI provider aktif. Atur terlebih dahulu di menu Admin.");
  }
  return rows[0];
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResult {
  content: string;
  promptTokens: number | null;
  completionTokens: number | null;
  latencyMs: number;
}

export async function chatComplete(
  provider: AiProvider,
  messages: ChatMessage[],
  opts: { json?: boolean; userId?: string; purpose?: string; maxTokens?: number }
): Promise<ChatResult> {
  let apiKey: string;
  try {
    apiKey = decrypt(provider.apiKeyEnc);
  } catch {
    throw new ApiError(
      400,
      "API key provider ini tidak dapat dibuka (APP_SECRET pernah berubah). Buka Admin → Edit provider → masukkan ulang API Key → Simpan."
    );
  }
  const started = Date.now();
  let error: string | null = null;
  let result: ChatResult | null = null;

  try {
    const res = await fetch(`${provider.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...(provider.kind === "openrouter"
          ? { "HTTP-Referer": env_CLIENT_URL(), "X-Title": "MotionMind" }
          : {}),
      },
      body: JSON.stringify({
        model: provider.model,
        messages,
        temperature: provider.params?.temperature ?? 0.4,
        max_tokens: opts.maxTokens ?? provider.params?.maxTokens ?? 4096,
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const choice = data.choices?.[0];
    const content = choice?.message?.content ?? "";
    if (!content.trim()) {
      throw new Error(
        `Respons AI kosong (finish_reason: ${choice?.finish_reason ?? "tidak diketahui"}${
          choice?.finish_reason === "length" ? " — output terpotong, naikkan Max Tokens di provider" : ""
        })`
      );
    }
    result = {
      content,
      promptTokens: data.usage?.prompt_tokens ?? null,
      completionTokens: data.usage?.completion_tokens ?? null,
      latencyMs: Date.now() - started,
    };
    return result;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    throw err instanceof Error ? err : new Error(String(err));
  } finally {
    await db.insert(aiLogs).values({
      userId: opts.userId ?? null,
      providerId: provider.id,
      purpose: opts.purpose ?? "chat",
      ok: result != null,
      promptTokens: result?.promptTokens ?? null,
      completionTokens: result?.completionTokens ?? null,
      latencyMs: result?.latencyMs ?? Date.now() - started,
      error,
    });
  }
}

function env_CLIENT_URL(): string {
  return process.env.CLIENT_URL ?? "http://localhost:5173";
}

export async function testProvider(
  provider: AiProvider
): Promise<{ ok: boolean; message: string }> {
  let apiKey: string;
  try {
    apiKey = decrypt(provider.apiKeyEnc);
  } catch {
    return { ok: false, message: "API key tidak dapat dibuka (APP_SECRET pernah berubah) — masukkan ulang API Key." };
  }
  let ok = false;
  let message = "";
  try {
    const res = await fetch(`${provider.baseUrl.replace(/\/+$/, "")}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.ok) {
      const data = (await res.json()) as { data?: Array<{ id?: string }> };
      const count = data.data?.length ?? 0;
      ok = true;
      message = `Koneksi OK. ${count} model tersedia.`;
    } else {
      // beberapa endpoint custom tidak menyediakan /models — coba chat minimal
      const chat = await fetch(`${provider.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: provider.model,
          messages: [{ role: "user", content: "balas dengan kata: ok" }],
          max_tokens: 8,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (chat.ok) {
        ok = true;
        message = "Koneksi OK (via chat completion).";
      } else {
        message = `HTTP ${chat.status}: ${(await chat.text()).slice(0, 200)}`;
      }
    }
  } catch (err) {
    message = err instanceof Error ? err.message : String(err);
  }

  await db
    .update(aiProviders)
    .set({ lastStatus: ok ? "ok" : "error", lastCheckedAt: new Date() })
    .where(eq(aiProviders.id, provider.id));

  return { ok, message };
}
