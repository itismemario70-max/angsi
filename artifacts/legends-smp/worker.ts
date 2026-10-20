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
  GetBanAppealsResponse,
  GetStaffApplicationsResponse,
  LoginLegendsPanelBody,
  LoginLegendsPanelResponse,
  LogoutLegendsPanelResponse,
  UpdateLegendsCodesBody,
  UpdateLegendsCodesResponse,
  UpdateLegendsContentBody,
  UpdateLegendsContentResponse,
  SubmitBanAppealBody,
  SubmitBanAppealResponse,
  SubmitStaffApplicationBody,
  SubmitStaffApplicationResponse,
  UpdateBanAppealStatusBody,
  UpdateBanAppealStatusResponse,
  UpdateStaffApplicationStatusBody,
  UpdateStaffApplicationStatusResponse,
  RequestStaffSkinUploadBody,
  RequestStaffSkinUploadResponse,
  FinalizeStaffSkinUploadBody,
  FinalizeStaffSkinUploadResponse,
} from "@workspace/api-zod";

interface D1RunResult {
  success: boolean;
  meta?: { changes?: number };
}

interface D1PreparedStatement {
  bind(...values: (string | number | null)[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<D1RunResult>;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface R2StoredObject {
  arrayBuffer(): Promise<ArrayBuffer>;
  size: number;
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
}

interface R2Bucket {
  get(key: string): Promise<R2StoredObject | null>;
  put(
    key: string,
    value: string | ArrayBuffer | Uint8Array,
    options?: {
      httpMetadata?: { contentType?: string };
      customMetadata?: Record<string, string>;
    },
  ): Promise<unknown>;
  delete(key: string): Promise<void>;
}

interface WorkerEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
  DB: D1Database;
  SKIN_IMAGES?: R2Bucket;
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
const MAX_STAFF_IMAGE_BYTES = 5 * 1024 * 1024;
const STAFF_UPLOAD_TTL_MS = 15 * 60 * 1000;
type StaffImageContentType = "image/png" | "image/jpeg" | "image/webp";

const emptyContent = {
  serverIp: "",
  season: "",
  banAppealsEnabled: false,
  banAppealQuestions: [
    { id: "appeal-context", label: "What happened from your perspective?", required: true },
    { id: "appeal-change", label: "What would you do differently if welcomed back?", required: true },
  ],
  staffApplicationQuestions: [
    { id: "application-intro", label: "Tell us a little about yourself and your time in the community.", required: true },
    { id: "application-care", label: "How would you help keep Legends welcoming and fair?", required: true },
  ],
  pluginInfo: "",
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
const submissionAttempts = new Map<string, { count: number; resetAt: number }>();

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
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS legends_submissions (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('appeal', 'application')),
      minecraft_username TEXT NOT NULL,
      discord_username TEXT NOT NULL,
      answers_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'declined')),
      created_at TEXT NOT NULL
    )
  `).run();
}

function normalizeContent(input: unknown) {
  const stored =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  return GetLegendsContentResponse.parse({ ...emptyContent, ...stored });
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
      content: normalizeContent(JSON.parse(row.content)),
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
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/api; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict`,
  );
}

function clearSessionCookie(headers: Headers): void {
  headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/api; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Strict`,
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

function prepareAnswers(
  questions: { id: string; label: string; required: boolean }[],
  submitted: { questionId: string; answer: string }[],
) {
  if (submitted.length > questions.length) return null;
  const byId = new Map(questions.map((question) => [question.id, question]));
  const seen = new Set<string>();
  const answers: { questionId: string; question: string; answer: string }[] = [];
  for (const item of submitted) {
    const question = byId.get(item.questionId);
    const answer = item.answer.trim();
    if (!question || seen.has(item.questionId) || answer.length > 5000) return null;
    seen.add(item.questionId);
    answers.push({ questionId: question.id, question: question.label, answer });
  }
  if (questions.some((question) => question.required && !seen.has(question.id))) {
    return null;
  }
  return answers;
}

function allowSubmission(request: Request, form: "appeal" | "application") {
  const key = `${form}:${getClientKey(request)}`;
  const now = Date.now();
  const previous = submissionAttempts.get(key);
  if (!previous || previous.resetAt <= now) {
    submissionAttempts.set(key, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return true;
  }
  if (previous.count >= 4) return false;
  previous.count += 1;
  return true;
}

async function saveSubmission(
  kind: "appeal" | "application",
  request: Request,
  env: WorkerEnv,
): Promise<Response> {
  if (!allowSubmission(request, kind)) {
    return jsonResponse({ error: "Please wait before submitting again." }, 429);
  }
  const input = await parseRequestBody(request);
  const parsed =
    kind === "appeal"
      ? SubmitBanAppealBody.safeParse(input)
      : SubmitStaffApplicationBody.safeParse(input);
  if (!parsed.success) {
    return jsonResponse({ error: "Check the required form fields." }, 400);
  }
  const { minecraftUsername, discordUsername } = parsed.data;
  if (
    !minecraftUsername.trim() ||
    minecraftUsername.trim().length > 16 ||
    !discordUsername.trim() ||
    discordUsername.trim().length > 100
  ) {
    return jsonResponse(
      { error: "Check your Minecraft and Discord names." },
      400,
    );
  }
  const settings = await getSettings(env);
  const content = normalizeContent(settings.content);
  if (kind === "appeal" && !content.banAppealsEnabled) {
    return jsonResponse({ error: "Ban appeals are currently closed." }, 400);
  }
  const questions =
    kind === "appeal"
      ? content.banAppealQuestions
      : content.staffApplicationQuestions;
  const answers = prepareAnswers(questions, parsed.data.answers);
  if (!answers) {
    return jsonResponse({ error: "Answer all required questions." }, 400);
  }
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO legends_submissions (
      id, kind, minecraft_username, discord_username, answers_json, status, created_at
    ) VALUES (?, ?, ?, ?, ?, 'pending', ?)
  `)
    .bind(
      crypto.randomUUID(),
      kind,
      minecraftUsername.trim(),
      discordUsername.trim(),
      JSON.stringify(answers),
      now,
    )
    .run();
  return jsonResponse(
    kind === "appeal"
      ? SubmitBanAppealResponse.parse({ submitted: true })
      : SubmitStaffApplicationResponse.parse({ submitted: true }),
    201,
  );
}

function mapSubmission(row: {
  id: string;
  minecraft_username: string;
  discord_username: string;
  answers_json: string;
  status: string;
  created_at: string;
}) {
  return {
    id: row.id,
    minecraftUsername: row.minecraft_username,
    discordUsername: row.discord_username,
    answers: JSON.parse(row.answers_json),
    status: row.status,
    createdAt: row.created_at,
  };
}

async function handleLegendsApi(
  request: Request,
  env: WorkerEnv,
): Promise<Response> {
  const { pathname } = new URL(request.url);

  if (pathname === "/api/legends/content" && request.method === "GET") {
    const settings = await getSettings(env);
    return jsonResponse(normalizeContent(settings.content));
  }

  if (
    (pathname === "/api/legends/appeals" ||
      pathname === "/api/legends/applications") &&
    request.method === "POST"
  ) {
    return saveSubmission(
      pathname.endsWith("/appeals") ? "appeal" : "application",
      request,
      env,
    );
  }

  if (pathname === "/api/legends/admin/appeals" && request.method === "GET") {
    const settings = await getSettings(env);
    if (!(await getActiveRole(request, settings, env))) {
      return jsonResponse({ error: "Admin panel access is required." }, 401);
    }
    const result = await env.DB.prepare(`
      SELECT id, minecraft_username, discord_username, answers_json, status, created_at
      FROM legends_submissions WHERE kind = 'appeal' ORDER BY created_at DESC
    `).all<{
      id: string;
      minecraft_username: string;
      discord_username: string;
      answers_json: string;
      status: string;
      created_at: string;
    }>();
    return jsonResponse(GetBanAppealsResponse.parse((result.results ?? []).map(mapSubmission)));
  }

  if (pathname === "/api/legends/owner/applications" && request.method === "GET") {
    const settings = await getSettings(env);
    if ((await getActiveRole(request, settings, env)) !== "owner") {
      return jsonResponse({ error: "Owner panel access is required." }, 401);
    }
    const result = await env.DB.prepare(`
      SELECT id, minecraft_username, discord_username, answers_json, status, created_at
      FROM legends_submissions WHERE kind = 'application' ORDER BY created_at DESC
    `).all<{
      id: string;
      minecraft_username: string;
      discord_username: string;
      answers_json: string;
      status: string;
      created_at: string;
    }>();
    return jsonResponse(GetStaffApplicationsResponse.parse((result.results ?? []).map(mapSubmission)));
  }

  const appealStatusPath = pathname.match(/^\/api\/legends\/admin\/appeals\/([^/]+)$/);
  if (appealStatusPath && request.method === "PATCH") {
    const settings = await getSettings(env);
    if (!(await getActiveRole(request, settings, env))) {
      return jsonResponse({ error: "Admin panel access is required." }, 401);
    }
    const parsed = UpdateBanAppealStatusBody.safeParse(await parseRequestBody(request));
    if (!parsed.success) return jsonResponse({ error: "Choose a valid review status." }, 400);
    const saved = await env.DB.prepare(`
      UPDATE legends_submissions SET status = ?
      WHERE id = ? AND kind = 'appeal'
    `).bind(parsed.data.status, decodeURIComponent(appealStatusPath[1])).run();
    if (!saved.meta?.changes) return jsonResponse({ error: "Appeal not found." }, 404);
    return jsonResponse(UpdateBanAppealStatusResponse.parse({ updated: true }));
  }

  const applicationStatusPath = pathname.match(/^\/api\/legends\/owner\/applications\/([^/]+)$/);
  if (applicationStatusPath && request.method === "PATCH") {
    const settings = await getSettings(env);
    if ((await getActiveRole(request, settings, env)) !== "owner") {
      return jsonResponse({ error: "Owner panel access is required." }, 401);
    }
    const parsed = UpdateStaffApplicationStatusBody.safeParse(await parseRequestBody(request));
    if (!parsed.success) return jsonResponse({ error: "Choose a valid review status." }, 400);
    const saved = await env.DB.prepare(`
      UPDATE legends_submissions SET status = ?
      WHERE id = ? AND kind = 'application'
    `).bind(parsed.data.status, decodeURIComponent(applicationStatusPath[1])).run();
    if (!saved.meta?.changes) return jsonResponse({ error: "Application not found." }, 404);
    return jsonResponse(UpdateStaffApplicationStatusResponse.parse({ updated: true }));
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

    const nextContent =
      role === "admin"
        ? {
            ...parsed.data,
            staffApplicationQuestions: normalizeContent(settings.content).staffApplicationQuestions,
            pluginInfo: normalizeContent(settings.content).pluginInfo,
          }
        : parsed.data;
    const saved = await env.DB.prepare(`
      UPDATE legends_settings
      SET content = ?, updated_at = ?
      WHERE id = ?
    `)
      .bind(
        JSON.stringify(nextContent),
        new Date().toISOString(),
        SETTINGS_ID,
      )
      .run();
    if (!saved.success || !saved.meta?.changes) {
      return jsonResponse({ error: "Could not save site content." }, 500);
    }
    return jsonResponse(UpdateLegendsContentResponse.parse(nextContent));
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

function isStaffImageContentType(value: string | undefined): value is StaffImageContentType {
  return value === "image/png" || value === "image/jpeg" || value === "image/webp";
}

function detectStaffImageContentType(bytes: Uint8Array): StaffImageContentType | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

async function handleSkinStorageApi(
  request: Request,
  env: WorkerEnv,
): Promise<Response> {
  const { pathname } = new URL(request.url);
  const bucket = env.SKIN_IMAGES;

  if (
    pathname === "/api/storage/uploads/request-url" &&
    request.method === "POST"
  ) {
    const settings = await getSettings(env);
    if (!(await getActiveRole(request, settings, env))) {
      return jsonResponse({ error: "Admin panel access is required." }, 401);
    }
    if (!bucket) {
      return jsonResponse({ error: "Staff image storage is not configured." }, 503);
    }

    const parsed = RequestStaffSkinUploadBody.safeParse(
      await parseRequestBody(request),
    );
    if (!parsed.success) {
      return jsonResponse(
        { error: "Upload a PNG, JPG, or WebP image under 5 MB." },
        400,
      );
    }

    const uploadId = crypto.randomUUID();
    const expiresAt = Date.now() + STAFF_UPLOAD_TTL_MS;
    await bucket.put(
      `pending/${uploadId}.json`,
      JSON.stringify({
        size: parsed.data.size,
        contentType: parsed.data.contentType,
        expiresAt,
      }),
      { httpMetadata: { contentType: "application/json" } },
    );
    const uploadURL = new URL(
      `/api/storage/uploads/${uploadId}`,
      request.url,
    ).toString();
    return jsonResponse(
      RequestStaffSkinUploadResponse.parse({
        uploadURL,
        objectPath: `/objects/uploads/${uploadId}`,
      }),
    );
  }

  const uploadMatch = pathname.match(
    /^\/api\/storage\/uploads\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,
  );
  if (uploadMatch && request.method === "PUT") {
    const settings = await getSettings(env);
    if (!(await getActiveRole(request, settings, env))) {
      return jsonResponse({ error: "Admin panel access is required." }, 401);
    }
    if (!bucket) {
      return jsonResponse({ error: "Staff image storage is not configured." }, 503);
    }

    const uploadId = uploadMatch[1];
    const reservationKey = `pending/${uploadId}.json`;
    const reservationObject = await bucket.get(reservationKey);
    if (!reservationObject) {
      return jsonResponse({ error: "Upload request not found." }, 404);
    }

    let reservation: {
      size?: unknown;
      contentType?: unknown;
      expiresAt?: unknown;
    };
    try {
      reservation = JSON.parse(
        new TextDecoder().decode(await reservationObject.arrayBuffer()),
      ) as typeof reservation;
    } catch {
      await bucket.delete(reservationKey);
      return jsonResponse({ error: "Upload request is invalid." }, 400);
    }
    if (
      typeof reservation.size !== "number" ||
      !Number.isInteger(reservation.size) ||
      reservation.size < 1 ||
      reservation.size > MAX_STAFF_IMAGE_BYTES ||
      !isStaffImageContentType(
        typeof reservation.contentType === "string"
          ? reservation.contentType
          : undefined,
      ) ||
      typeof reservation.expiresAt !== "number"
    ) {
      await bucket.delete(reservationKey);
      return jsonResponse({ error: "Upload request is invalid." }, 400);
    }
    if (reservation.expiresAt <= Date.now()) {
      await bucket.delete(reservationKey);
      return jsonResponse({ error: "Upload request expired. Choose the image again." }, 410);
    }

    const contentLengthHeader = request.headers.get("content-length");
    if (
      contentLengthHeader &&
      Number(contentLengthHeader) !== reservation.size
    ) {
      return jsonResponse({ error: "Image size does not match the upload request." }, 400);
    }
    const bytes = new Uint8Array(await request.arrayBuffer());
    const headerContentType = request.headers
      .get("content-type")
      ?.split(";")[0]
      .trim()
      .toLowerCase();
    const detectedContentType = detectStaffImageContentType(bytes);
    if (
      bytes.byteLength !== reservation.size ||
      bytes.byteLength > MAX_STAFF_IMAGE_BYTES ||
      !detectedContentType ||
      detectedContentType !== reservation.contentType ||
      detectedContentType !== headerContentType
    ) {
      return jsonResponse({ error: "Choose a valid PNG, JPG, or WebP image." }, 400);
    }

    await bucket.put(`uploads/${uploadId}`, bytes, {
      httpMetadata: { contentType: detectedContentType },
      customMetadata: { state: "pending", expiresAt: String(reservation.expiresAt) },
    });
    await bucket.delete(reservationKey);
    return new Response(null, { status: 204 });
  }

  if (
    pathname === "/api/storage/uploads/finalize" &&
    request.method === "POST"
  ) {
    const settings = await getSettings(env);
    if (!(await getActiveRole(request, settings, env))) {
      return jsonResponse({ error: "Admin panel access is required." }, 401);
    }
    if (!bucket) {
      return jsonResponse({ error: "Staff image storage is not configured." }, 503);
    }

    const parsed = FinalizeStaffSkinUploadBody.safeParse(
      await parseRequestBody(request),
    );
    if (!parsed.success) {
      return jsonResponse({ error: "The image upload is invalid." }, 400);
    }
    const objectPathMatch = parsed.data.objectPath.match(
      /^\/objects\/uploads\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,
    );
    if (!objectPathMatch) {
      return jsonResponse({ error: "The image upload is invalid." }, 400);
    }

    const uploadId = objectPathMatch[1];
    const objectKey = `uploads/${uploadId}`;
    const uploadedObject = await bucket.get(objectKey);
    if (!uploadedObject || uploadedObject.customMetadata?.state !== "pending") {
      return jsonResponse({ error: "The uploaded image could not be found." }, 400);
    }
    const expiresAt = Number(uploadedObject.customMetadata.expiresAt);
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) {
      await bucket.delete(objectKey);
      return jsonResponse({ error: "Upload expired. Choose the image again." }, 410);
    }

    const contentType = uploadedObject.httpMetadata?.contentType;
    const bytes = new Uint8Array(await uploadedObject.arrayBuffer());
    if (
      !isStaffImageContentType(contentType) ||
      bytes.byteLength !== uploadedObject.size ||
      bytes.byteLength > MAX_STAFF_IMAGE_BYTES ||
      detectStaffImageContentType(bytes) !== contentType
    ) {
      await bucket.delete(objectKey);
      return jsonResponse({ error: "The uploaded image is invalid." }, 400);
    }

    await bucket.put(objectKey, bytes, {
      httpMetadata: { contentType },
      customMetadata: { visibility: "public" },
    });
    return jsonResponse(
      FinalizeStaffSkinUploadResponse.parse({
        imagePath: `/api/storage/objects/uploads/${uploadId}`,
      }),
    );
  }

  const imageMatch = pathname.match(
    /^\/api\/storage\/objects\/uploads\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,
  );
  if (imageMatch && request.method === "GET") {
    if (!bucket) {
      return jsonResponse({ error: "Staff image storage is not configured." }, 503);
    }
    const object = await bucket.get(`uploads/${imageMatch[1]}`);
    const contentType = object?.httpMetadata?.contentType;
    if (
      !object ||
      object.customMetadata?.visibility !== "public" ||
      !isStaffImageContentType(contentType) ||
      object.size > MAX_STAFF_IMAGE_BYTES
    ) {
      return jsonResponse({ error: "Image not found." }, 404);
    }
    return new Response(await object.arrayBuffer(), {
      headers: {
        "Cache-Control": "public, max-age=3600",
        "Content-Length": String(object.size),
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  return jsonResponse({ error: "Not found." }, 404);
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === "/api/health" && request.method === "GET") {
      return jsonResponse({ status: "ok" });
    }

    if (pathname.startsWith("/api/storage/")) {
      try {
        return await handleSkinStorageApi(request, env);
      } catch {
        return jsonResponse(
          { error: "Staff image storage is temporarily unavailable." },
          503,
        );
      }
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
