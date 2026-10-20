import {
  createHmac,
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  db,
  legendsSettingsTable,
  legendsSubmissionsTable,
  type LegendsContent,
} from "@workspace/db";
import {
  GetBanAppealsResponse,
  GetLegendsContentResponse,
  GetLegendsSessionResponse,
  GetStaffApplicationsResponse,
  LoginLegendsPanelBody,
  LoginLegendsPanelResponse,
  LogoutLegendsPanelResponse,
  SubmitBanAppealBody,
  SubmitBanAppealResponse,
  SubmitStaffApplicationBody,
  SubmitStaffApplicationResponse,
  UpdateBanAppealStatusBody,
  UpdateBanAppealStatusParams,
  UpdateBanAppealStatusResponse,
  UpdateLegendsCodesBody,
  UpdateLegendsCodesResponse,
  UpdateLegendsContentBody,
  UpdateLegendsContentResponse,
  UpdateStaffApplicationStatusBody,
  UpdateStaffApplicationStatusParams,
  UpdateStaffApplicationStatusResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const SETTINGS_ID = "legends";
const SESSION_COOKIE = "legends_panel";
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const LOCKOUT_MS = 10 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 6;
const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();
const submissionAttempts = new Map<string, { count: number; resetAt: number }>();
let settingsTableReady: Promise<void> | undefined;

type PanelRole = "admin" | "owner";
type SessionPayload = {
  role: PanelRole;
  version: number;
  expiresAt: number;
};

const emptyContent: LegendsContent = {
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
  if (!settingsTableReady) {
    settingsTableReady = db
      .execute(
        sql.raw(`
          CREATE TABLE IF NOT EXISTS public.legends_settings (
            id text PRIMARY KEY,
            content jsonb NOT NULL,
            admin_code_hash text NOT NULL,
            owner_code_hash text NOT NULL,
            admin_version integer NOT NULL DEFAULT 1,
            owner_version integer NOT NULL DEFAULT 1,
            updated_at timestamptz NOT NULL DEFAULT now()
          )
          ;
          CREATE TABLE IF NOT EXISTS public.legends_submissions (
            id text PRIMARY KEY,
            kind text NOT NULL CHECK (kind IN ('appeal', 'application')),
            minecraft_username text NOT NULL,
            discord_username text NOT NULL,
            answers jsonb NOT NULL,
            status text NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'accepted', 'declined')),
            created_at timestamptz NOT NULL DEFAULT now()
          )
        `),
      )
      .then(() => undefined)
      .catch((error) => {
        settingsTableReady = undefined;
        throw error;
      });
  }
  await settingsTableReady;

  const existing = await db
    .select()
    .from(legendsSettingsTable)
    .where(eq(legendsSettingsTable.id, SETTINGS_ID))
    .limit(1);
  if (existing[0]) {
    return {
      ...existing[0],
      content: GetLegendsContentResponse.parse({
        ...emptyContent,
        ...(existing[0].content as Partial<LegendsContent>),
      }),
    };
  }

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
    path: "/api",
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

function prepareAnswers(
  questions: LegendsContent["banAppealQuestions"],
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

async function saveCommunitySubmission(
  kind: "appeal" | "application",
  request: Request,
  response: Response,
): Promise<void> {
  if (!allowSubmission(request, kind)) {
    response.status(429).json({ error: "Please wait before submitting again." });
    return;
  }
  const parsed =
    kind === "appeal"
      ? SubmitBanAppealBody.safeParse(request.body)
      : SubmitStaffApplicationBody.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Check the required form fields." });
    return;
  }
  const { minecraftUsername, discordUsername } = parsed.data;
  if (
    !minecraftUsername.trim() ||
    minecraftUsername.trim().length > 16 ||
    !discordUsername.trim() ||
    discordUsername.trim().length > 100
  ) {
    response.status(400).json({ error: "Check your Minecraft and Discord names." });
    return;
  }

  const settings = await getSettings();
  const content = settings.content;
  if (kind === "appeal" && !content.banAppealsEnabled) {
    response.status(400).json({ error: "Ban appeals are currently closed." });
    return;
  }
  const questions =
    kind === "appeal"
      ? content.banAppealQuestions
      : content.staffApplicationQuestions;
  const answers = prepareAnswers(questions, parsed.data.answers);
  if (!answers) {
    response.status(400).json({ error: "Answer all required questions." });
    return;
  }
  await db.insert(legendsSubmissionsTable).values({
    id: randomUUID(),
    kind,
    minecraftUsername: minecraftUsername.trim(),
    discordUsername: discordUsername.trim(),
    answers,
  });
  response.status(201).json(
    kind === "appeal"
      ? SubmitBanAppealResponse.parse({ submitted: true })
      : SubmitStaffApplicationResponse.parse({ submitted: true }),
  );
}

router.post("/legends/appeals", async (request, response): Promise<void> => {
  await saveCommunitySubmission("appeal", request, response);
});

router.post("/legends/applications", async (request, response): Promise<void> => {
  await saveCommunitySubmission("application", request, response);
});

router.get("/legends/admin/appeals", async (request, response): Promise<void> => {
  const settings = await getSettings();
  const role = await getActiveRole(request, settings);
  if (!role) {
    response.status(401).json({ error: "Admin panel access is required." });
    return;
  }
  const rows = await db
    .select()
    .from(legendsSubmissionsTable)
    .where(eq(legendsSubmissionsTable.kind, "appeal"))
    .orderBy(desc(legendsSubmissionsTable.createdAt));
  response.json(GetBanAppealsResponse.parse(rows));
});

router.patch(
  "/legends/admin/appeals/:submissionId",
  async (request, response): Promise<void> => {
    const settings = await getSettings();
    if (!(await getActiveRole(request, settings))) {
      response.status(401).json({ error: "Admin panel access is required." });
      return;
    }
    const { submissionId } = UpdateBanAppealStatusParams.parse(request.params);
    const parsed = UpdateBanAppealStatusBody.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Choose a valid review status." });
      return;
    }
    const [updated] = await db
      .update(legendsSubmissionsTable)
      .set({ status: parsed.data.status })
      .where(
        and(
          eq(legendsSubmissionsTable.id, submissionId),
          eq(legendsSubmissionsTable.kind, "appeal"),
        ),
      )
      .returning({ id: legendsSubmissionsTable.id });
    if (!updated) {
      response.status(404).json({ error: "Appeal not found." });
      return;
    }
    response.json(UpdateBanAppealStatusResponse.parse({ updated: true }));
  },
);

router.get(
  "/legends/owner/applications",
  async (request, response): Promise<void> => {
    const settings = await getSettings();
    if ((await getActiveRole(request, settings)) !== "owner") {
      response.status(401).json({ error: "Owner panel access is required." });
      return;
    }
    const rows = await db
      .select()
      .from(legendsSubmissionsTable)
      .where(eq(legendsSubmissionsTable.kind, "application"))
      .orderBy(desc(legendsSubmissionsTable.createdAt));
    response.json(GetStaffApplicationsResponse.parse(rows));
  },
);

router.patch(
  "/legends/owner/applications/:submissionId",
  async (request, response): Promise<void> => {
    const settings = await getSettings();
    if ((await getActiveRole(request, settings)) !== "owner") {
      response.status(401).json({ error: "Owner panel access is required." });
      return;
    }
    const { submissionId } = UpdateStaffApplicationStatusParams.parse(
      request.params,
    );
    const parsed = UpdateStaffApplicationStatusBody.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Choose a valid review status." });
      return;
    }
    const [updated] = await db
      .update(legendsSubmissionsTable)
      .set({ status: parsed.data.status })
      .where(
        and(
          eq(legendsSubmissionsTable.id, submissionId),
          eq(legendsSubmissionsTable.kind, "application"),
        ),
      )
      .returning({ id: legendsSubmissionsTable.id });
    if (!updated) {
      response.status(404).json({ error: "Application not found." });
      return;
    }
    response.json(UpdateStaffApplicationStatusResponse.parse({ updated: true }));
  },
);

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
    path: "/api",
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

    const nextContent =
      role === "admin"
        ? {
            ...parsed.data,
            staffApplicationQuestions: settings.content.staffApplicationQuestions,
            pluginInfo: settings.content.pluginInfo,
          }
        : parsed.data;
    const [saved] = await db
      .update(legendsSettingsTable)
      .set({
        content: nextContent as LegendsContent,
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
