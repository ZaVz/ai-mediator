import "server-only";
import { NextRequest, NextResponse } from "next/server";
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
export function protectOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  // Next may normalize nextUrl's hostname to localhost. Compare the browser's
  // Origin against the actual Host, with protocol forwarded by a trusted proxy.
  const protocol =
    req.headers.get("x-forwarded-proto")?.split(",")[0].trim() ??
    req.nextUrl.protocol.replace(":", "");
  const expectedOrigin = `${protocol}://${req.headers.get("host")}`;
  if (origin && origin !== expectedOrigin)
    throw new ApiError(403, "BAD_ORIGIN", "请在本站页面操作。");
  if (req.headers.get("sec-fetch-site") === "cross-site")
    throw new ApiError(403, "BAD_ORIGIN", "请在本站页面操作。");
}
export async function body(req: NextRequest): Promise<Record<string, unknown>> {
  protectOrigin(req);
  if (
    !req.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    throw new ApiError(415, "JSON_REQUIRED", "请发送 JSON 数据。");
  }
  // Bound actual bytes, including chunked bodies without Content-Length.
  const reader = req.body?.getReader();
  if (!reader) throw new ApiError(400, "INVALID_JSON", "请求内容为空。");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 24000) {
      await reader.cancel();
      throw new ApiError(413, "TOO_LARGE", "内容太长，请缩短后再试。");
    }
    chunks.push(value);
  }
  try {
    const result: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!result || typeof result !== "object" || Array.isArray(result))
      throw new Error();
    return result as Record<string, unknown>;
  } catch {
    throw new ApiError(400, "INVALID_JSON", "请求内容不是有效的 JSON 对象。");
  }
}
export function string(
  value: unknown,
  name: string,
  max = 2000,
  required = true,
): string {
  if (value === undefined && !required) return "";
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  ) {
    throw new ApiError(
      400,
      "INVALID_INPUT",
      `${name}不能为空且不能超过${max}字。`,
    );
  }
  return value.trim();
}
export function grade(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 6
  ) {
    throw new ApiError(400, "INVALID_GRADE", "请选择一至六年级。");
  }
  return value;
}
export function endpoint(
  fn: (
    req: NextRequest,
    context: { params: Promise<Record<string, string>> },
  ) => Promise<Response>,
) {
  return async (
    req: NextRequest,
    context: { params: Promise<Record<string, string>> },
  ) => {
    try {
      return await fn(req, context);
    } catch (err) {
      if (err instanceof ApiError)
        return json(
          { error: { code: err.code, message: err.message } },
          err.status,
        );
      // Never log passwords, keys, upstream responses or children's text.
      console.error(
        "API internal error:",
        err instanceof Error ? err.name : "UnknownError",
      );
      return json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "暂时没有完成操作，请稍后重试。",
          },
        },
        500,
      );
    }
  };
}
const buckets = new Map<string, { count: number; until: number }>();
export function rateLimit(key: string, limit: number, windowMs = 60000) {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.until <= now) buckets.delete(k);
  const bucket = buckets.get(key) ?? { count: 0, until: now + windowMs };
  if (bucket.count >= limit)
    throw new ApiError(429, "RATE_LIMIT", "操作太频繁，请稍等一分钟再试。");
  bucket.count++;
  buckets.set(key, bucket);
}
const locks = new Set<string>();
export async function exclusive<T>(key: string, fn: () => Promise<T>) {
  if (locks.has(key))
    throw new ApiError(409, "BUSY", "上一条消息还在处理，请稍等再试。");
  locks.add(key);
  try {
    return await fn();
  } finally {
    locks.delete(key);
  }
}
