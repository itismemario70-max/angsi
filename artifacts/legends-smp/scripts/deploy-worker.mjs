import { spawn } from "node:child_process";
import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const hyperdriveId = process.env.HYPERDRIVE_ID?.trim();

if (!hyperdriveId) {
  console.error(
    "Set HYPERDRIVE_ID in Cloudflare Workers Builds to the ID of the Hyperdrive configuration for the Legends PostgreSQL database.",
  );
  process.exit(1);
}

const configPath = path.join(projectRoot, ".wrangler.deploy.json");
const config = {
  name: "legends",
  main: "./worker.ts",
  compatibility_date: "2026-10-19",
  compatibility_flags: ["nodejs_compat"],
  keep_vars: true,
  workers_dev: true,
  preview_urls: false,
  assets: {
    directory: "./dist/public",
    binding: "ASSETS",
    run_worker_first: ["/api/*"],
    not_found_handling: "single-page-application",
  },
  hyperdrive: [{ binding: "HYPERDRIVE", id: hyperdriveId }],
};

await writeFile(configPath, JSON.stringify(config, null, 2));

try {
  const isDryRun = process.argv.includes("--dry-run");
  const deployArgs = ["wrangler", "deploy", "--config", configPath];
  if (isDryRun) deployArgs.push("--dry-run");

  const exitCode = await new Promise((resolve, reject) => {
    const deploy = spawn("npx", deployArgs, {
      cwd: projectRoot,
      env: process.env,
      stdio: "inherit",
    });
    deploy.once("error", reject);
    deploy.once("exit", (code) => resolve(code ?? 1));
  });

  if (exitCode !== 0) process.exitCode = Number(exitCode);
} finally {
  await rm(configPath, { force: true });
}
