import { spawn } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

const d1DatabaseId = process.env.D1_DATABASE_ID?.trim();

if (!d1DatabaseId) {
  console.error(
    "Set D1_DATABASE_ID in Cloudflare Workers Builds to the ID of the Cloudflare D1 database for Legends SMP.",
  );
  process.exit(1);
}

// Workers serves this site at the domain root, independently of Replit's
// preview routing. Build on every deployment, including dry runs.
const buildExitCode = await run("pnpm", ["run", "build"], {
  ...process.env,
  NODE_ENV: "production",
  BASE_PATH: "/",
  PORT: process.env.PORT || "5173",
});
if (buildExitCode !== 0) {
  process.exit(Number(buildExitCode));
}

const sourceConfigPath = path.join(projectRoot, "wrangler.jsonc");
const configPath = path.join(projectRoot, ".wrangler.deploy.json");
const config = JSON.parse(await readFile(sourceConfigPath, "utf8"));
config.d1_databases = [
  {
    binding: "DB",
    database_name: "legends",
    database_id: d1DatabaseId,
  },
];

await writeFile(configPath, JSON.stringify(config, null, 2));

try {
  const isDryRun = process.argv.includes("--dry-run");
  const deployArgs = ["wrangler", "deploy", "--config", configPath];
  if (isDryRun) deployArgs.push("--dry-run");

  const exitCode = await run("npx", deployArgs);

  if (exitCode !== 0) process.exitCode = Number(exitCode);
} finally {
  await rm(configPath, { force: true });
}
