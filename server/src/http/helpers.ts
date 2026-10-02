import type { Context } from "hono";
import type { z } from "zod";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export function handleError(err: unknown, c: Context) {
  if (err instanceof ApiError) {
    return c.json({ error: err.message }, err.status as 400);
  }
  console.error("[unhandled]", err);
  const msg = err instanceof Error ? err.message : "Terjadi kesalahan internal";
  return c.json({ error: msg }, 500 as 500);
}

export async function parseBody<S extends z.ZodTypeAny>(c: Context, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new ApiError(400, "Body harus berupa JSON valid");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path?.length ? `${first.path.join(".")}: ` : "";
    throw new ApiError(400, `${path}${first?.message ?? "Input tidak valid"}`);
  }
  return parsed.data;
}
