import { Buffer } from "node:buffer";
import {
  createHmac,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import {
  GetLegendsContentResponse,
  GetLegendsSessionResponse,
  LoginLegendsPanelBody,
  LoginLegendsPanelResponse,
  LogoutLegendsPanelResponse,
  UpdateLegendsCodesBody,
  UpdateLegendsCodesResponse,
  UpdateLegendsContentBody,
  UpdateLegendsContentResponse,
} from "@workspace/api-zod";

interface D1RunResult {
  success: boolean;
  meta?: { changes?: number };
}

interface D1PreparedStatement {
  bind(...values: (string | number | null)[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<D1RunResult>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface WorkerEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
  DB: D1Database;
  LEGENDS_ADMIN_CODE?: string;
  LEGENDS_OWNER_CODE?: string;
  SESSION_SECRET?: string;
}

type LegendsSettings = {
  content: unknown;
  adminCodeHash: string;
  ownerCodeHash: string;
  adminVersion: number;
  ownerVersion: number;
};

type LegendsSettingsRow = {
  content: string;
  admin_code_hash: string;
  owner_code_hash: string;
  admin_version: number;
  owner_version: number;
};

type PanelRole = "admin" | "owner";
type SessionPayload = {
  role: PanelRole;
  version: number;
  expiresAt: number;
};

const SETTINGS_ID = "legends";
const SESSION_COOKIE = "legends_panel";
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const LOCKOUT_MS = 10 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 6;

const emptyContent = {
  serverIp: "",
  season: "",
  discordLinks: [],
  staff: [],
  rules: [],
  punishments: [],
  events: [],
};

const loginAttempts = new Map<
  string,
  { count: number; lockedUntil: number }
>();

async function ensureSettingsTable(env: WorkerEnv) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS legends_settings (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      admin_code_hash TEXT NOT NULL,
      owner_code_hash TEXT NOT NULL,
      admin_version INTEGER NOT NULL DEFAULT 1,
      owner_version INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    )
  `).run();
}

function deriveKey(code: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(code, salt, 64, (error, key) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(Buffer.from(key));
    });
  });
}

async function hashCode(code: string): Promise<string> {
  const salt = randomBytes(16).toString("base64url");
  const digest = await deriveKey(code, salt);
  return `scrypt$${salt}$${digest.toString("base64url")}`;
}

async function matchesCode(code: string, storedHash: string): Promise<boolean> {
  const [algorithm, salt, expected] = storedHash.split("$");
  if (algorithm !== "scrypt" || !salt || !expected) return false;
  const expectedBytes = Buffer.from(expected, "base64url");
  const actualBytes = await deriveKey(code, salt);
  return (
    expectedBytes.length === actualBytes.length &&
    timingSafeEqual(expectedBytes, actualBytes)
  );
}

function requiredSecret(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

async function getSettings(env: WorkerEnv) {
  await ensureSettingsTable(env);
  const readSettings = async (): Promise<LegendsSettings | null> => {
    const row = await env.DB.prepare(`
      SELECT content, admin_code_hash, owner_code_hash, admin_version, owner_version
      FROM legends_settings
      WHERE id = ?
      LIMIT 1
    `)
      .bind(SETTINGS_ID)
      .first<LegendsSettingsRow>();
    if (!row) return null;
    return {
      content: JSON.parse(row.content),
      adminCodeHash: row.admin_code_hash,
      ownerCodeHash: row.owner_code_hash,
      adminVersion: row.admin_version,
      ownerVersion: row.owner_version,
    };
  };

  const existing = await readSettings();
  if (existing) return existing;

  const adminCode = requiredSecret(env.LEGENDS_ADMIN_CODE, "LEGENDS_ADMIN_CODE");
  const ownerCode = requiredSecret(env.LEGENDS_OWNER_CODE, "LEGENDS_OWNER_CODE");
  await env.DB.prepare(`
    INSERT OR IGNORE INTO legends_settings (
      id, content, admin_code_hash, owner_code_hash, updated_at
    ) VALUES (?, ?, ?, ?, ?)
  `)
    .bind(
      SETTINGS_ID,
      JSON.stringify(emptyContent),
      await hashCode(adminCode),
      await hashCode(ownerCode),
      new Date().toISOString(),
    )
    .run();

  const createdOrRaced = await readSettings();
  if (!createdOrRaced) throw new Error("Could not initialize Legends settings.");
  return createdOrRaced;
}

function getSessionSecret(env: WorkerEnv): string {
  return requiredSecret(env.SESSION_SECRET, "SESSION_SECRET");
}

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function encodeSession(
  role: PanelRole,
  version: number,
  env: WorkerEnv,
): string {
  const payload = Buffer.from(
    JSON.stringify({
      role,
      version,
      expiresAt: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    } satisfies SessionPayload),
  ).toString("base64url");
  return `${payload}.${signPayload(payload, getSessionSecret(env))}`;
}

function decodeSession(
  token: string,
  env: WorkerEnv,
): SessionPayload | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  try {
    const expected = Buffer.from(
      signPayload(payload, getSessionSecret(env)),
      "base64url",
    );
    const provided = Buffer.from(signature, "base64url");
    if (
      expected.length !== provided.length ||
      !timingSafeEqual(expected, provided)
    ) {
      return null;
    }

    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as Partial<SessionPayload>;
    if (
      (decoded.role !== "admin" && decoded.role !== "owner") ||
      typeof decoded.version !== "number" ||
      typeof decoded.expiresAt !== "number" ||
      decoded.expiresAt <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return decoded as SessionPayload;
  } catch {
    return null;
  }
}

function readCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  for (const cookie of cookieHeader.split(";")) {
    const separator = cookie.indexOf("=");
    if (separator < 0 || cookie.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(cookie.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function setSessionCookie(
  headers: Headers,
  role: PanelRole,
  version: number,
  env: WorkerEnv,
): void {
  const token = encodeSession(role, version, env);
  headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/api/legends; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict`,
  );
}

function clearSessionCookie(headers: Headers): void {
  headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/api/legends; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Strict`,
  );
}

function getClientKey(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? "unknown";
}

async function getActiveRole(
  request: Request,
  settings: Awaited<ReturnType<typeof getSettings>>,
  env: WorkerEnv,
): Promise<PanelRole | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const session = decodeSession(token, env);
  if (!session) return null;
  const expectedVersion =
    session.role === "owner" ? settings.ownerVersion : settings.adminVersion;
  return session.version === expectedVersion ? session.role : null;
}

function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders?: HeadersInit,
): Response {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), { status, headers });
}

async function parseRequestBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function handleLegendsApi(
  request: Request,
  env: WorkerEnv,
): Promise<Response> {
  const { pathname } = new URL(request.url);

  if (pathname === "/api/legends/content" && request.method === "GET") {
    const settings = await getSettings(env);
    return jsonResponse(GetLegendsContentResponse.parse(settings.content));
  }

  if (pathname === "/api/legends/auth/session" && request.method === "GET") {
    const settings = await getSettings(env);
    const role = await getActiveRole(request, settings, env);
    return jsonResponse(
      GetLegendsSessionResponse.parse({
        authenticated: role !== null,
        role,
      }),
    );
  }

  if (pathname === "/api/legends/auth/login" && request.method === "POST") {
    const parsed = LoginLegendsPanelBody.safeParse(
      await parseRequestBody(request),
    );
    if (!parsed.success) {
      return jsonResponse(
        { error: "Enter a valid panel and access code." },
        400,
      );
    }

    const clientKey = getClientKey(request);
    const attempts = loginAttempts.get(clientKey);
    if (attempts && attempts.lockedUntil > Date.now()) {
      return jsonResponse(
        { error: "Too many attempts. Try again later." },
        429,
      );
    }
    if (attempts && attempts.lockedUntil <= Date.now()) {
      loginAttempts.delete(clientKey);
    }

    const settings = await getSettings(env);
    const role = parsed.data.panel as PanelRole;
    const storedHash =
      role === "owner" ? settings.ownerCodeHash : settings.adminCodeHash;
    const valid = await matchesCode(parsed.data.code, storedHash);
    if (!valid) {
      const previous = loginAttempts.get(clientKey)?.count ?? 0;
      const count = previous + 1;
      loginAttempts.set(clientKey, {
        count,
        lockedUntil: count >= MAX_LOGIN_ATTEMPTS ? Date.now() + LOCKOUT_MS : 0,
      });
      return jsonResponse(
        { error: "That access code did not match." },
        401,
      );
    }

    loginAttempts.delete(clientKey);
    const version =
      role === "owner" ? settings.ownerVersion : settings.adminVersion;
    const responseHeaders = new Headers();
    setSessionCookie(responseHeaders, role, version, env);
    return jsonResponse(
      LoginLegendsPanelResponse.parse({ authenticated: true, role }),
      200,
      responseHeaders,
    );
  }

  if (pathname === "/api/legends/auth/logout" && request.method === "POST") {
    const responseHeaders = new Headers();
    clearSessionCookie(responseHeaders);
    return jsonResponse(
      LogoutLegendsPanelResponse.parse({ authenticated: false, role: null }),
      200,
      responseHeaders,
    );
  }

  if (pathname === "/api/legends/admin/content" && request.method === "PUT") {
    const settings = await getSettings(env);
    const role = await getActiveRole(request, settings, env);
    if (!role) {
      return jsonResponse(
        { error: "Admin panel access is required." },
        401,
      );
    }

    const parsed = UpdateLegendsContentBody.safeParse(
      await parseRequestBody(request),
    );
    if (!parsed.success) {
      return jsonResponse({ error: "Review the site content fields." }, 400);
    }

    const saved = await env.DB.prepare(`
      UPDATE legends_settings
      SET content = ?, updated_at = ?
      WHERE id = ?
    `)
      .bind(
        JSON.stringify(parsed.data),
        new Date().toISOString(),
        SETTINGS_ID,
      )
      .run();
    if (!saved.success || !saved.meta?.changes) {
      return jsonResponse({ error: "Could not save site content." }, 500);
    }
    return jsonResponse(UpdateLegendsContentResponse.parse(parsed.data));
  }

  if (pathname === "/api/legends/owner/codes" && request.method === "PATCH") {
    const settings = await getSettings(env);
    const role = await getActiveRole(request, settings, env);
    if (role !== "owner") {
      return jsonResponse(
        { error: "Owner panel access is required." },
        401,
      );
    }

    const parsed = UpdateLegendsCodesBody.safeParse(
      await parseRequestBody(request),
    );
    if (!parsed.success) {
      return jsonResponse(
        { error: "New codes must be at least 8 characters long." },
        400,
      );
    }

    const { adminCode, ownerCode } = parsed.data;
    if (!adminCode && !ownerCode) {
      return jsonResponse({ error: "Enter at least one new code." }, 400);
    }

    const assignments = ["updated_at = ?"];
    const values: (string | number)[] = [new Date().toISOString()];
    if (adminCode) {
      assignments.push("admin_code_hash = ?", "admin_version = ?");
      values.push(
        await hashCode(adminCode),
        settings.adminVersion + 1,
      );
    }
    if (ownerCode) {
      assignments.push("owner_code_hash = ?", "owner_version = ?");
      values.push(
        await hashCode(ownerCode),
        settings.ownerVersion + 1,
      );
    }
    values.push(SETTINGS_ID);
    const updated = await env.DB.prepare(`
      UPDATE legends_settings
      SET ${assignments.join(", ")}
      WHERE id = ?
    `)
      .bind(...values)
      .run();
    if (!updated.success || !updated.meta?.changes) {
      return jsonResponse({ error: "Could not update access codes." }, 500);
    }

    return jsonResponse(UpdateLegendsCodesResponse.parse({ updated: true }));
  }

  return jsonResponse({ error: "Not found." }, 404);
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === "/api/health" && request.method === "GET") {
      return jsonResponse({ status: "ok" });
    }

    if (pathname.startsWith("/api/legends/")) {
      try {
        return await handleLegendsApi(request, env);
      } catch {
        return jsonResponse(
          { error: "The Legends service is temporarily unavailable." },
          503,
        );
      }
    }

    if (pathname.startsWith("/api/")) {
      return jsonResponse({ error: "Not found." }, 404);
    }

    return env.ASSETS.fetch(request);
  },
};
