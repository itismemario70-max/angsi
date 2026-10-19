import { Buffer } from "node:buffer";
import {
  createHmac,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import {
  legendsSettingsTable,
  type LegendsContent,
} from "@workspace/db/schema";
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

interface WorkerEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
  HYPERDRIVE?: { connectionString: string };
  LEGENDS_ADMIN_CODE?: string;
  LEGENDS_OWNER_CODE?: string;
  SESSION_SECRET?: string;
}

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

const emptyContent: LegendsContent = {
  serverIp: "",
  season: "",
  discordLinks: [],
  staff: [],
  rules: [],
  punishments: [],
  events: [],
};

let pool: Pool | undefined;
let poolConnectionString: string | undefined;
let schemaReady: Promise<void> | undefined;
const loginAttempts = new Map<
  string,
  { count: number; lockedUntil: number }
>();

function getDatabase(env: WorkerEnv) {
  const connectionString = env.HYPERDRIVE?.connectionString;
  if (!connectionString) {
    throw new Error("The HYPERDRIVE binding is not configured.");
  }

  if (!pool || poolConnectionString !== connectionString) {
    pool = new Pool({
      connectionString,
      max: 1,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 10_000,
    });
    poolConnectionString = connectionString;
    schemaReady = undefined;
  }

  return drizzle(pool, { schema: { legendsSettingsTable } });
}

async function ensureSettingsTable(env: WorkerEnv) {
  const db = getDatabase(env);
  if (!schemaReady) {
    const activePool = pool;
    if (!activePool) throw new Error("The PostgreSQL pool is unavailable.");
    schemaReady = activePool
      .query("SELECT to_regclass('public.legends_settings') AS relation")
      .then(async (result) => {
        if (result.rows[0]?.relation) return;
        await activePool.query(`
          CREATE TABLE IF NOT EXISTS public.legends_settings (
            id text PRIMARY KEY,
            content jsonb NOT NULL,
            admin_code_hash text NOT NULL,
            owner_code_hash text NOT NULL,
            admin_version integer NOT NULL DEFAULT 1,
            owner_version integer NOT NULL DEFAULT 1,
            updated_at timestamptz NOT NULL DEFAULT now()
          )
        `);
      })
      .catch((error) => {
        schemaReady = undefined;
        throw error;
      });
  }
  await schemaReady;
  return db;
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
  const db = await ensureSettingsTable(env);
  const existing = await db
    .select()
    .from(legendsSettingsTable)
    .where(eq(legendsSettingsTable.id, SETTINGS_ID))
    .limit(1);
  if (existing[0]) return existing[0];

  const adminCode = requiredSecret(env.LEGENDS_ADMIN_CODE, "LEGENDS_ADMIN_CODE");
  const ownerCode = requiredSecret(env.LEGENDS_OWNER_CODE, "LEGENDS_OWNER_CODE");
  const created = await db
    .insert(legendsSettingsTable)
    .values({
      id: SETTINGS_ID,
      content: emptyContent,
      adminCodeHash: await hashCode(adminCode),
      ownerCodeHash: await hashCode(ownerCode),
    })
    .onConflictDoNothing()
    .returning();
  if (created[0]) return created[0];

  const raced = await db
    .select()
    .from(legendsSettingsTable)
    .where(eq(legendsSettingsTable.id, SETTINGS_ID))
    .limit(1);
  if (!raced[0]) throw new Error("Could not initialize Legends settings.");
  return raced[0];
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

    const [saved] = await getDatabase(env)
      .update(legendsSettingsTable)
      .set({
        content: parsed.data as LegendsContent,
        updatedAt: new Date(),
      })
      .where(eq(legendsSettingsTable.id, SETTINGS_ID))
      .returning();
    if (!saved) {
      return jsonResponse({ error: "Could not save site content." }, 500);
    }
    return jsonResponse(UpdateLegendsContentResponse.parse(saved.content));
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

    const changes: Partial<typeof legendsSettingsTable.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (adminCode) {
      changes.adminCodeHash = await hashCode(adminCode);
      changes.adminVersion = settings.adminVersion + 1;
    }
    if (ownerCode) {
      changes.ownerCodeHash = await hashCode(ownerCode);
      changes.ownerVersion = settings.ownerVersion + 1;
    }
    await getDatabase(env)
      .update(legendsSettingsTable)
      .set(changes)
      .where(eq(legendsSettingsTable.id, SETTINGS_ID));

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
