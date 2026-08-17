import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

import { ServiceError } from "./challenge-service.js";

const MAX_BODY_BYTES = 16 * 1024;

function authorized(header, token) {
  if (typeof header !== "string") return false;
  const actual = Buffer.from(header, "utf8");
  const expected = Buffer.from(`Bearer ${token}`, "utf8");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function sendJson(response, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "x-content-type-options": "nosniff",
    ...extraHeaders,
  });
  response.end(body);
}

function sendError(response, error) {
  const known = error instanceof ServiceError;
  sendJson(response, known ? error.status : 500, {
    error: {
      code: known ? error.code : "INTERNAL_ERROR",
      message: known ? error.message : "The gateway failed closed.",
      retryable: known ? error.retryable : false,
    },
  });
}

async function readJson(request) {
  const contentType = request.headers["content-type"];
  if (typeof contentType !== "string" || !contentType.toLowerCase().startsWith("application/json")) {
    throw new ServiceError(415, "JSON_REQUIRED", "Content-Type must be application/json.");
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new ServiceError(413, "BODY_TOO_LARGE", "The request body is too large.");
    }
    chunks.push(chunk);
  }
  if (size === 0) throw new ServiceError(400, "BODY_REQUIRED", "A JSON request body is required.");
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ServiceError(400, "INVALID_JSON", "The request body is not valid JSON.");
  }
}

function decodeSegment(segment, label) {
  try {
    return decodeURIComponent(segment);
  } catch {
    throw new ServiceError(400, `INVALID_${label.toUpperCase()}`, `${label} is not valid URL encoding.`);
  }
}

export function createGatewayHandler({ service, bearerToken }) {
  return async (request, response) => {
    try {
      if (!authorized(request.headers.authorization, bearerToken)) {
        sendJson(response, 401, {
          error: { code: "UNAUTHORIZED", message: "Bearer authentication is required.", retryable: false },
        }, { "www-authenticate": "Bearer" });
        return;
      }
      if (request.headers["x-zity-network"] !== "testnet") {
        throw new ServiceError(400, "NETWORK_HEADER_MISMATCH", "x-zity-network must be testnet.");
      }

      const url = new URL(request.url ?? "/", "http://gateway.invalid");
      const path = url.pathname;

      if (path === "/v1/health") {
        if (request.method !== "GET") throw new ServiceError(405, "METHOD_NOT_ALLOWED", "Use GET for this endpoint.");
        sendJson(response, 200, await service.health());
        return;
      }

      if (path === "/v1/payment-challenges") {
        if (request.method !== "POST") throw new ServiceError(405, "METHOD_NOT_ALLOWED", "Use POST for this endpoint.");
        sendJson(response, 201, await service.createPaymentChallenge(await readJson(request)));
        return;
      }

      const verifyMatch = path.match(/^\/v1\/payment-challenges\/([^/]+)\/verify$/);
      if (verifyMatch) {
        if (request.method !== "POST") throw new ServiceError(405, "METHOD_NOT_ALLOWED", "Use POST for this endpoint.");
        sendJson(response, 200, await service.verifyPayment(decodeSegment(verifyMatch[1], "challenge id")));
        return;
      }

      const challengeMatch = path.match(/^\/v1\/payment-challenges\/([^/]+)$/);
      if (challengeMatch) {
        if (request.method !== "GET") throw new ServiceError(405, "METHOD_NOT_ALLOWED", "Use GET for this endpoint.");
        sendJson(response, 200, await service.getPaymentChallengeStatus(decodeSegment(challengeMatch[1], "challenge id")));
        return;
      }

      const transactionMatch = path.match(/^\/v1\/transactions\/([^/]+)$/);
      if (transactionMatch) {
        if (request.method !== "GET") throw new ServiceError(405, "METHOD_NOT_ALLOWED", "Use GET for this endpoint.");
        sendJson(response, 200, await service.getTransaction(decodeSegment(transactionMatch[1], "txid")));
        return;
      }

      throw new ServiceError(404, "NOT_FOUND", "The requested gateway endpoint does not exist.");
    } catch (error) {
      sendError(response, error);
    }
  };
}

export function createGatewayServer(options) {
  return createServer(createGatewayHandler(options));
}
