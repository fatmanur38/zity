import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

export class RpcError extends Error {
  constructor(code, message, { retryable = false, cause } = {}) {
    super(message, { cause });
    this.name = "RpcError";
    this.code = code;
    this.retryable = retryable;
  }
}

export class JsonRpcClient {
  constructor({ url, username, password, cookieFile, timeoutMs = 8_000, fetchImpl = globalThis.fetch }) {
    this.url = url;
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;
    this.basicAuthorization = username && password
      ? `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`
      : undefined;
    this.cookieFile = cookieFile;
  }

  async call(method, params = []) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response;
    try {
      const headers = {
        accept: "application/json",
        "content-type": "application/json",
      };
      const authorization = await this.authorizationHeader();
      if (authorization) headers.authorization = authorization;
      response = await this.fetchImpl(this.url, {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: randomUUID(),
          method,
          params,
        }),
      });
    } catch (error) {
      if (error instanceof RpcError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new RpcError("RPC_TIMEOUT", "The Zcash RPC request timed out.", { retryable: true, cause: error });
      }
      throw new RpcError("RPC_UNAVAILABLE", "The Zcash RPC endpoint is unavailable.", {
        retryable: true,
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new RpcError(
        response.status === 401 || response.status === 403 ? "RPC_AUTH_ERROR" : "RPC_HTTP_ERROR",
        "The Zcash RPC endpoint rejected the request.",
        { retryable: response.status >= 500 },
      );
    }

    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      throw new RpcError("RPC_INVALID_JSON", "The Zcash RPC endpoint returned invalid JSON.", { cause: error });
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new RpcError("RPC_INVALID_RESPONSE", "The Zcash RPC response has an invalid shape.");
    }
    if (payload.error) {
      const rpcCode = typeof payload.error.code === "number" ? payload.error.code : "unknown";
      throw new RpcError("RPC_METHOD_ERROR", `Zcash RPC method ${method} failed (${rpcCode}).`);
    }
    if (!("result" in payload)) {
      throw new RpcError("RPC_INVALID_RESPONSE", "The Zcash RPC response omitted result.");
    }
    return payload.result;
  }

  async authorizationHeader() {
    if (!this.cookieFile) return this.basicAuthorization;
    let cookie;
    try {
      cookie = (await readFile(this.cookieFile, "utf8")).trim();
    } catch (error) {
      throw new RpcError("RPC_COOKIE_UNAVAILABLE", "The Zebra RPC cookie file cannot be read.", {
        retryable: true,
        cause: error,
      });
    }
    if (cookie.length < 3 || cookie.length > 4_096 || !cookie.includes(":") || /[\r\n]/.test(cookie)) {
      throw new RpcError("RPC_COOKIE_INVALID", "The Zebra RPC cookie file has an invalid format.");
    }
    return `Basic ${Buffer.from(cookie, "utf8").toString("base64")}`;
  }
}
