import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  legendsSettingsTable,
  type LegendsContent,
} from "@workspace/db";
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

const router: IRouter = Router();
const SETTINGS_ID = "legends";
const SESSION_COOKIE = "legends_panel";
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const LOCKOUT_MS = 10 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 6;
const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();

type PanelRole = "admin" | "owner";
type SessionPayload = {
  role: PanelRole;
  version: number;
  expiresAt: number;
};

const emptyContent: LegendsContent = {
  serverIp: "",
  season: "",
  discordLinks: [],
  staff: [],
  rules: [],
  punishments: [],
  events: [],
};

function deriveKey(code: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(code, salt, 64, (error, key) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(key as Buffer);
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

async function getSettings() {
  const existing = await db
    .select()
    .from(legendsSettingsTable)
    .where(eq(legendsSettingsTable.id, SETTINGS_ID))
    .limit(1);
  if (existing[0]) return existing[0];

  const adminCode = process.env.LEGENDS_ADMIN_CODE;
  const ownerCode = process.env.LEGENDS_OWNER_CODE;
  if (!adminCode || !ownerCode) {
    throw new Error(
      "LEGENDS_ADMIN_CODE and LEGENDS_OWNER_CODE must be configured before initializing Legends SMP.",
    );
  }

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
  if (!raced[0]) throw new Error("Could not initialize Legends SMP settings.");
  return raced[0];
}

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET must be configured.");
  return secret;
}

function signPayload(payload: string): string {
  return createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url");
}

function encodeSession(role: PanelRole, version: number): string {
  const payload = Buffer.from(
    JSON.stringify({
      role,
      version,
      expiresAt: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    } satisfies SessionPayload),
  ).toString("base64url");
  return `${payload}.${signPayload(payload)}`;
}

function decodeSession(token: string): SessionPayload | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  try {
    const expected = Buffer.from(signPayload(payload), "base64url");
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
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return null;
  for (const cookie of cookieHeader.split(";")) {
    const separator = cookie.indexOf("=");
    if (separator < 0 || cookie.slice(0, separator).trim() !== name) continue;
    return decodeURIComponent(cookie.slice(separator + 1).trim());
  }
  return null;
}

function setSessionCookie(
  response: Response,
  role: PanelRole,
  version: number,
): void {
  response.cookie(SESSION_COOKIE, encodeSession(role, version), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/legends",
    maxAge: SESSION_TTL_SECONDS * 1000,
  });
}

async function getActiveRole(
  request: Request,
  settings: Awaited<ReturnType<typeof getSettings>>,
): Promise<PanelRole | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const session = decodeSession(token);
  if (!session) return null;
  const expectedVersion =
    session.role === "owner" ? settings.ownerVersion : settings.adminVersion;
  return session.version === expectedVersion ? session.role : null;
}

function getClientKey(request: Request): string {
  return request.ip || request.socket.remoteAddress || "unknown";
}

router.get("/legends/content", async (_request, response): Promise<void> => {
  const settings = await getSettings();
  response.json(GetLegendsContentResponse.parse(settings.content));
});

router.get("/legends/auth/session", async (request, response): Promise<void> => {
  const settings = await getSettings();
  const role = await getActiveRole(request, settings);
  response.json(
    GetLegendsSessionResponse.parse({
      authenticated: role !== null,
      role,
    }),
  );
});

router.post("/legends/auth/login", async (request, response): Promise<void> => {
  const parsed = LoginLegendsPanelBody.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Enter a valid panel and access code." });
    return;
  }

  const clientKey = getClientKey(request);
  const attempts = loginAttempts.get(clientKey);
  if (attempts && attempts.lockedUntil > Date.now()) {
    response.status(429).json({ error: "Too many attempts. Try again later." });
    return;
  }
  if (attempts && attempts.lockedUntil <= Date.now()) {
    loginAttempts.delete(clientKey);
  }

  const settings = await getSettings();
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
    response.status(401).json({ error: "That access code did not match." });
    return;
  }

  loginAttempts.delete(clientKey);
  const version =
    role === "owner" ? settings.ownerVersion : settings.adminVersion;
  setSessionCookie(response, role, version);
  response.json(
    LoginLegendsPanelResponse.parse({ authenticated: true, role }),
  );
});

router.post("/legends/auth/logout", (_request, response): void => {
  response.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/legends",
  });
  response.json(
    LogoutLegendsPanelResponse.parse({ authenticated: false, role: null }),
  );
});

router.put(
  "/legends/admin/content",
  async (request, response): Promise<void> => {
    const settings = await getSettings();
    const role = await getActiveRole(request, settings);
    if (!role) {
      response.status(401).json({ error: "Admin panel access is required." });
      return;
    }

    const parsed = UpdateLegendsContentBody.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Review the site content fields." });
      return;
    }

    const [saved] = await db
      .update(legendsSettingsTable)
      .set({
        content: parsed.data as LegendsContent,
        updatedAt: new Date(),
      })
      .where(eq(legendsSettingsTable.id, SETTINGS_ID))
      .returning();
    response.json(UpdateLegendsContentResponse.parse(saved.content));
  },
);

router.patch(
  "/legends/owner/codes",
  async (request, response): Promise<void> => {
    const settings = await getSettings();
    const role = await getActiveRole(request, settings);
    if (role !== "owner") {
      response.status(401).json({ error: "Owner panel access is required." });
      return;
    }

    const parsed = UpdateLegendsCodesBody.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        error: "New codes must be at least 8 characters long.",
      });
      return;
    }

    const { adminCode, ownerCode } = parsed.data;
    if (!adminCode && !ownerCode) {
      response.status(400).json({ error: "Enter at least one new code." });
      return;
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
    await db
      .update(legendsSettingsTable)
      .set(changes)
      .where(eq(legendsSettingsTable.id, SETTINGS_ID));
    response.json(UpdateLegendsCodesResponse.parse({ updated: true }));
  },
);

export default router;
