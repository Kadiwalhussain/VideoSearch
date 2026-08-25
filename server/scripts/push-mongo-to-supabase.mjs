/**
 * Copy local Mongo vault collections into Supabase project xirnfdraklgdtleftcag.
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) in server/.env.
 * Optional SUPABASE_ACCESS_TOKEN applies server/sql/vault_supabase.sql first.
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import mongoose from "mongoose";
import { User, VaultVideo, SharedCard } from "../src/models.js";
import {
  applySchemaViaManagement,
  countVaultTables,
  pushAllFromMongo,
  supabaseConfigured,
  supabaseStatus,
} from "../src/supabaseMirror.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL_PATH = path.resolve(__dirname, "../sql/vault_supabase.sql");
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/videosearch";

async function applySchema() {
  const sql = await readFile(SQL_PATH, "utf8");
  const viaApi = await applySchemaViaManagement(sql);
  if (viaApi?.ok) {
    console.log("[supabase] schema applied via Management API");
    return true;
  }

  const cli = spawnSync(
    "npx",
    [
      "--yes",
      "supabase",
      "db",
      "query",
      "--project-ref",
      "xirnfdraklgdtleftcag",
      "-f",
      SQL_PATH,
    ],
    { encoding: "utf8", cwd: path.resolve(__dirname, "../..") }
  );
  if (cli.status === 0) {
    console.log("[supabase] schema applied via supabase db query");
    return true;
  }
  const err = `${cli.stderr || ""}\n${cli.stdout || ""}`.trim();
  console.warn(
    "[supabase] could not apply SQL automatically:\n" +
      err.split("\n").slice(0, 8).join("\n")
  );
  return false;
}

async function main() {
  if (!supabaseConfigured()) {
    console.error(
      "Missing SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY).\n" +
        "Add it to server/.env from https://supabase.com/dashboard/project/xirnfdraklgdtleftcag/settings/api"
    );
    process.exit(1);
  }

  const schemaOk = await applySchema();
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });

  const [users, videos, shares] = await Promise.all([
    User.find().lean(),
    VaultVideo.find().lean(),
    SharedCard.find().lean(),
  ]);

  console.log(
    `[mongo] users=${users.length} videos=${videos.length} shares=${shares.length}`
  );

  const pushed = await pushAllFromMongo({ users, videos, shares });
  const status = await supabaseStatus();
  let counts = null;
  try {
    counts = await countVaultTables();
  } catch (err) {
    counts = { error: err.message };
  }

  console.log("[supabase] push", pushed);
  console.log("[supabase] status", status);
  console.log("[supabase] counts", counts);
  if (!schemaOk && status?.ok === false) {
    console.error(
      "Tables may be missing. Run server/sql/vault_supabase.sql in the SQL editor:\n" +
        "https://supabase.com/dashboard/project/xirnfdraklgdtleftcag/sql/new"
    );
    process.exit(2);
  }
  if (pushed.errors.length) process.exit(3);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    try {
      await mongoose.disconnect();
    } catch {
      /* ignore */
    }
  });
