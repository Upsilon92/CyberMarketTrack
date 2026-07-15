"use client";

// Tiny typed fetch wrapper for the admin mutations.
export class ApiError extends Error {
  status: number;
  fields?: Record<string, string>;
  codes?: string[];
  code?: string;

  constructor(status: number, data: Record<string, unknown>) {
    super((data.error as string) ?? "API error");
    this.status = status;
    this.fields = data.fields as Record<string, string> | undefined;
    this.codes = data.codes as string[] | undefined;
    this.code = data.code as string | undefined;
  }
}

export async function api<T = unknown>(
  path: string,
  method: "POST" | "PUT" | "DELETE",
  body?: unknown
): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}
