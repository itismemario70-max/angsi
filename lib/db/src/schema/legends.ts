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
