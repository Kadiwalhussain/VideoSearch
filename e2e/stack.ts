/**
 * Throwaway stack for end-to-end tests: mongod + the real vault server +
 * Chromium with the built extension (and Studio served by the server at /app).
 * Nothing touches the developer's .env, database, or live vault on :8787.
 */

import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const SERVER_ENTRY = path.join(ROOT, "server/src/index.js");
const FIXTURES = path.join(ROOT, "e2e/fixtures");
/** Hosts the extension may call; tests never reach the real internet */
const OFFLINE_HOSTS =
  /^https:\/\/([a-z0-9-]+\.)*(youtube\.com|ytimg\.com|googlevideo\.com|google\.com|gstatic\.com|googleapis\.com|huggingface\.co|hf\.co|jsdelivr\.net|clerk\.com|clerk\.accounts\.dev)\//;

export type Account = { token: string; userId: string; email: string };

export class Stack {
  tmp = "";
  api = "";
  apiPort = 0;
  mongoUri = "";
  ctx!: BrowserContext;
  /** Extension page (chrome-extension://…/welcome) signed in as `user` */
  page!: Page;
  user!: Account;
  private mongod: ChildProcess | null = null;
  private server: ChildProcess | null = null;

  async start(): Promise<void> {
    this.tmp = mkdtempSync(path.join(tmpdir(), "vsa-e2e-"));
    const mongoPort = await freePort();
    this.apiPort = await freePort();
    this.api = `http://127.0.0.1:${this.apiPort}`;
    this.mongoUri = `mongodb://127.0.0.1:${mongoPort}/vsa_e2e`;

    const dbPath = path.join(this.tmp, "db");
    mkdirSync(dbPath);
    this.mongod = spawn(
      "mongod",
      ["--dbpath", dbPath, "--port", String(mongoPort), "--bind_ip", "127.0.0.1", "--quiet"],
      { stdio: "ignore" }
    );
    await waitFor(() => canConnect(mongoPort), "mongod");
    await this.startServer();
    this.user = await this.register("e2e@example.com");

    // The manifest only allows the vault on :8787 (host_permissions + CSP).
    // Load a copy pointed at this run's port.
    const extDir = path.join(this.tmp, "ext");
    cpSync(DIST, extDir, { recursive: true });
    const manifestPath = path.join(extDir, "manifest.json");
    writeFileSync(
      manifestPath,
      readFileSync(manifestPath, "utf8").replaceAll(":8787", `:${this.apiPort}`)
    );

    this.ctx = await chromium.launchPersistentContext(path.join(this.tmp, "profile"), {
      channel: "chromium",
      headless: true,
      args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
    });
    // youtube.com/watch → a local stand-in page; everything else Google: blocked
    await this.ctx.route(OFFLINE_HOSTS, async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname.endsWith("youtube.com") && url.pathname === "/watch") {
        return route.fulfill({ path: path.join(FIXTURES, "watch.html") });
      }
      if (url.hostname.endsWith("youtube.com") && url.pathname === "/e2e/tenmin.webm") {
        // Seeking needs byte ranges, like a real media server
        const buf = readFileSync(path.join(FIXTURES, "tenmin.webm"));
        const m = /bytes=(\d*)-(\d*)/.exec(route.request().headers()["range"] || "");
        const start = m?.[1] ? Number(m[1]) : 0;
        const end = m?.[2] ? Math.min(Number(m[2]), buf.length - 1) : buf.length - 1;
        return route.fulfill({
          status: m ? 206 : 200,
          contentType: "video/webm",
          headers: {
            "Accept-Ranges": "bytes",
            ...(m ? { "Content-Range": `bytes ${start}-${end}/${buf.length}` } : {}),
          },
          body: buf.subarray(start, end + 1),
        });
      }
      return route.abort();
    });
    let [sw] = this.ctx.serviceWorkers();
    if (!sw) sw = await this.ctx.waitForEvent("serviceworker");
    const extId = new URL(sw.url()).host;
    this.page = await this.ctx.newPage();
    await this.page.goto(`chrome-extension://${extId}/src/welcome/index.html`);
    await this.page.evaluate(
      async ({ api, u }) => {
        await chrome.storage.local.set({
          vsa_cloud_settings: {
            projectUrl: api,
            apiKey: u.token,
            userId: u.userId,
            email: u.email,
            displayName: "E2E",
          },
          vsa_cloud_ver: 4,
        });
      },
      { api: this.api, u: this.user }
    );
  }

  async stop(): Promise<void> {
    await this.ctx?.close();
    await this.stopServer();
    this.mongod?.kill("SIGTERM");
    if (this.tmp) rmSync(this.tmp, { recursive: true, force: true });
  }

  async startServer(): Promise<void> {
    this.server = spawn(process.execPath, [SERVER_ENTRY], {
      // Run outside server/ so dotenv never loads the developer's real .env
      cwd: this.tmp,
      env: {
        PATH: process.env.PATH,
        PORT: String(this.apiPort),
        HOST: "127.0.0.1",
        NODE_ENV: "test",
        MONGODB_URI: this.mongoUri,
        MONGODB_URI_FALLBACK: this.mongoUri,
        JWT_SECRET: "e2e-secret-that-is-long-enough-for-the-server-0123456789",
        SHOT_BACKUP_DIR: path.join(this.tmp, "shots"),
      },
      stdio: "pipe",
    });
    await waitFor(async () => {
      const r = await fetch(`${this.api}/health`);
      const j = (await r.json()) as { mongo?: string };
      return r.ok && j.mongo !== "down";
    }, "vault server");
  }

  async stopServer(): Promise<void> {
    if (!this.server) return;
    const s = this.server;
    this.server = null;
    await new Promise<void>((resolve) => {
      s.once("exit", () => resolve());
      s.kill("SIGTERM");
    });
  }

  async register(email: string): Promise<Account> {
    const reg = await fetch(`${this.api}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "e2e-Password-123", displayName: email.split("@")[0] }),
    });
    const out = (await reg.json()) as { token: string; user: { userId: string } };
    return { token: out.token, userId: out.user.userId, email };
  }

  /** Call the vault API as a user (default: the extension's user). */
  async call(pathName: string, init: { method?: string; body?: unknown } = {}, as = this.user) {
    const r = await fetch(`${this.api}${pathName}`, {
      method: init.method || (init.body ? "POST" : "GET"),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${as.token}` },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    return { status: r.status, json: (await r.json().catch(() => ({}))) as any };
  }

  /** Vault row as Studio sees it. */
  async vaultRow(videoId: string, as = this.user) {
    const { json } = await this.call("/api/vault", {}, as);
    return (json.rows as Array<{ video_id: string; payload: any }>).find(
      (row) => row.video_id === videoId
    )?.payload;
  }

  /** Run code inside the extension against its real built modules. */
  ext<T>(fn: string): Promise<T> {
    return this.page.evaluate(`(async () => {
      const off = await import("/assets/offlineSync.js");
      const cs = await import("/assets/cloudSync.js");
      const lib = await import("/assets/libraryStore.js");
      const hs = await import("/assets/highlightsStore.js");
      return (${fn})({ off, cs, lib, hs });
    })()`) as Promise<T>;
  }

  badge(): Promise<string> {
    return this.page.evaluate(() => chrome.action.getBadgeText({}));
  }

  /**
   * A YouTube watch page (local stand-in) with the real content script
   * injected by Chrome. The fixture video is 10:00 long.
   */
  async watchPage(videoId: string): Promise<Page> {
    const p = await this.ctx.newPage();
    await p.goto(`https://www.youtube.com/watch?v=${videoId}`);
    await p.waitForFunction(() => {
      const v = document.querySelector("video");
      return Boolean(v && v.readyState >= 1 && v.duration > 0);
    });
    return p;
  }

  /** A Studio (webapp) tab signed in as `as`. */
  async studio(route: string, as = this.user): Promise<Page> {
    const p = await this.ctx.newPage();
    // Same origin, but not the app: nothing can re-save another session
    await p.goto(`${this.api}/health`);
    await p.evaluate(
      ({ api, u }) =>
        localStorage.setItem(
          "vsa_vault_session_v3",
          JSON.stringify({ url: api, token: u.token, user: { userId: u.userId, email: u.email } })
        ),
      { api: this.api, u: as }
    );
    await p.goto(`${this.api}/app${route}`);
    return p;
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const port = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(port));
    });
    s.on("error", reject);
  });
}

function canConnect(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect(port, "127.0.0.1", () => {
      sock.end();
      resolve(true);
    });
    sock.on("error", () => resolve(false));
  });
}

export async function waitFor(
  check: () => Promise<boolean>,
  what: string,
  ms = 60_000
): Promise<void> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await check().catch(() => false)) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Timed out waiting for ${what}`);
}
