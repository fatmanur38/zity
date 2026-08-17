import type { IncomingMessage, ServerResponse } from "node:http";
import { ZodError } from "zod";

export type ApiRequest = IncomingMessage & {
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
};

export type ApiResponse = ServerResponse;

export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryable = false,
    readonly details?: string,
  ) {
    super(message);
  }
}

export function sendJson(response: ApiResponse, status: number, payload: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.setHeader("x-content-type-options", "nosniff");
  response.end(JSON.stringify(payload));
}

export function requireMethod(request: ApiRequest, method: "GET" | "POST"): void {
  if (request.method !== method) {
    throw new ApiFailure(405, "METHOD_NOT_ALLOWED", `Use ${method} for this endpoint.`);
  }
}

export async function readJsonBody(request: ApiRequest): Promise<unknown> {
  if (request.body !== undefined) {
    if (typeof request.body === "string") return JSON.parse(request.body) as unknown;
    return request.body;
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > 16_384) throw new ApiFailure(413, "PAYLOAD_TOO_LARGE", "Request body is too large.");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

export function pathParameter(request: ApiRequest, name: string): string {
  const fromQuery = request.query?.[name];
  const value = Array.isArray(fromQuery) ? fromQuery[0] : fromQuery;
  if (!value) throw new ApiFailure(400, "INVALID_PATH_PARAMETER", `Missing ${name}.`);
  return value;
}

export async function handleApi(
  response: ApiResponse,
  operation: () => Promise<void>,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if (error instanceof ApiFailure) {
      sendJson(response, error.status, {
        error: {
          code: error.code,
          message: error.message,
          retryable: error.retryable,
          ...(error.details ? { details: error.details } : {}),
        },
      });
      return;
    }
    if (error instanceof ZodError) {
      sendJson(response, 400, {
        error: {
          code: "INVALID_REQUEST",
          message: "The request did not match the testnet API contract.",
          retryable: false,
        },
      });
      return;
    }
    if (error instanceof SyntaxError) {
      sendJson(response, 400, {
        error: { code: "INVALID_JSON", message: "Request body must be valid JSON.", retryable: false },
      });
      return;
    }
    sendJson(response, 500, {
      error: {
        code: "INTERNAL_ERROR",
        message: "The testnet request could not be completed.",
        retryable: false,
      },
    });
  }
}
