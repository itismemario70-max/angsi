import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export type LegendsContent = {
  serverIp: string;
  season: string;
  banAppealsEnabled: boolean;
  banAppealQuestions: { id: string; label: string; required: boolean }[];
  staffApplicationQuestions: { id: string; label: string; required: boolean }[];
  pluginInfo: string;
  discordLinks: {
    id: string;
    label: string;
    url: string;
  }[];
  staff: {
    id: string;
    minecraftUsername: string;
    skinUrl: string | null;
    discordUsername: string;
    displayName: string;
    rank: string;
    inGameStaff: boolean;
  }[];
  rules: {
    id: string;
    title: string;
    body: string;
  }[];
  punishments: {
    id: string;
    title: string;
    description: string;
  }[];
  events: {
    id: string;
    title: string;
    time: string;
    description: string;
    reward: string;
  }[];
};

export const legendsSettingsTable = pgTable("legends_settings", {
  id: text("id").primaryKey(),
  content: jsonb("content").$type<LegendsContent>().notNull(),
  adminCodeHash: text("admin_code_hash").notNull(),
  ownerCodeHash: text("owner_code_hash").notNull(),
  adminVersion: integer("admin_version").notNull().default(1),
  ownerVersion: integer("owner_version").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const legendsSubmissionsTable = pgTable("legends_submissions", {
  id: text("id").primaryKey(),
  kind: text("kind").$type<"appeal" | "application">().notNull(),
  minecraftUsername: text("minecraft_username").notNull(),
  discordUsername: text("discord_username").notNull(),
  answers: jsonb("answers")
    .$type<{ questionId: string; question: string; answer: string }[]>()
    .notNull(),
  status: text("status")
    .$type<"pending" | "accepted" | "declined">()
    .notNull()
    .default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
