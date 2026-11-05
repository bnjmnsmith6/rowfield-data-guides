/* Local browser check for the Clear the Bill page.
   Selects sample bills, checks the total and the prefilled link, and writes screenshots.
   It does not submit the research form. */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const logic = require("./bill-logic.js");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = process.env.CLEAR_THE_BILL_ARTIFACTS || "/opt/cursor/artifacts";

function readConfig() {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(new URL("./config.js", import.meta.url), "utf8"),
    context,
    { filename: "config.js" }
  );
  return context.window.CLEAR_THE_BILL_CONFIG;
}

function freePort() {
  return new Promise(function (resolve, reject) {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", function () {
      const port = server.address().port;
      server.close(function (err) { if (err) reject(err); else resolve(port); });
    });
  });
}

function startSite() {
  return new Promise(function (resolve) {
    const server = http.createServer(function (req, res) {
      const url = new URL(req.url, "http://127.0.0.1");
      let pathname = decodeURIComponent(url.pathname);
      if (pathname.endsWith("/")) pathname += "index.html";
      const file = path.normalize(path.join(root, pathname));
      if (!file.startsWith(root + path.sep) && file !== root) {
        res.writeHead(403);
        res.end();
        return;
      }
      fs.readFile(file, function (err, data) {
        if (err) {
          res.writeHead(404);
          res.end("not found");
          return;
        }
        const type = file.endsWith(".css") ? "text/css" : file.endsWith(".js") ? "text/javascript" : "text/html; charset=utf-8";
        res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
        res.end(data);
      });
    });
    server.listen(0, "127.0.0.1", function () { resolve(server); });
  });
}

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let next = 1;
  const pending = new Map();
  const queue = new Map();
  const waiters = new Map();
  const opened = new Promise(function (resolve, reject) {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", reject);
  });
  ws.addEventListener("message", function (event) {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const job = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) job.reject(new Error(JSON.stringify(message.error)));
      else job.resolve(message.result);
      return;
    }
    if (!message.method) return;
    const waiting = waiters.get(message.method) || [];
    if (waiting.length) {
      waiting.shift()(message.params);
      return;
    }
    const saved = queue.get(message.method) || [];
    saved.push(message.params);
    queue.set(message.method, saved);
  });
  return {
    async send(method, params) {
      await opened;
      const id = next++;
      const result = new Promise(function (resolve, reject) { pending.set(id, { resolve: resolve, reject: reject }); });
      ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
      return result;
    },
    waitFor(method, timeoutMs) {
      const saved = queue.get(method) || [];
      if (saved.length) return Promise.resolve(saved.shift());
      return new Promise(function (resolve, reject) {
        const timer = setTimeout(function () { reject(new Error("timeout " + method)); }, timeoutMs || 10000);
        const list = waiters.get(method) || [];
        list.push(function (params) {
          clearTimeout(timer);
          resolve(params);
        });
        waiters.set(method, list);
      });
    },
    close() { ws.close(); }
  };
}

async function waitForChrome(port) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch("http://127.0.0.1:" + port + "/json/version");
      if (response.ok) return;
    } catch (err) {
      await new Promise(function (resolve) { setTimeout(resolve, 100); });
    }
  }
  throw new Error("Chrome did not open a debugging port");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const config = readConfig();
  const expectedPair = logic.buildBundleUrl(config, ["utility-a", "utility-b"]);
  fs.mkdirSync(outDir, { recursive: true });
  const site = await startSite();
  const port = await freePort();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "clear-the-bill-"));
  const chrome = spawn("/usr/local/bin/google-chrome", [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--remote-debugging-port=" + port,
    "--user-data-dir=" + profile,
    "--window-size=1280,900",
    "about:blank"
  ], { stdio: "ignore" });
  let client;
  try {
    await waitForChrome(port);
    const targets = await fetch("http://127.0.0.1:" + port + "/json/list").then(function (response) { return response.json(); });
    const page = targets.find(function (target) { return target.type === "page"; });
    client = cdp(page.webSocketDebuggerUrl);
    await client.send("Page.enable");
    const loaded = client.waitFor("Page.loadEventFired");
    await client.send("Page.navigate", {
      url: "http://127.0.0.1:" + site.address().port + "/clear-the-bill/"
    });
    await loaded;
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    async function pageState() {
      const evaluated = await client.send("Runtime.evaluate", {
        expression: `(() => ({
          total: document.getElementById("sample-total").textContent,
          summary: document.getElementById("selection-summary").textContent,
          banner: document.getElementById("launch-banner").textContent,
          status: document.getElementById("form-status").textContent,
          money: document.getElementById("money-note").textContent,
          role: document.getElementById("role-note").textContent,
          joinDetail: document.querySelector("#join-link .button-state").textContent,
          reviewDetail: document.querySelector("#review-link .button-state").textContent,
          robots: document.querySelector('meta[name="robots"]').content,
          frames: document.querySelectorAll("iframe").length,
          review: document.getElementById("review-link").getAttribute("href"),
          reviewDisabled: document.getElementById("review-link").getAttribute("aria-disabled"),
          join: document.getElementById("join-link").getAttribute("href"),
          storage: localStorage.length + sessionStorage.length,
          cookieHasEmail: document.cookie.includes("@"),
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          state: document.documentElement.getAttribute("data-form-state")
        }))()`,
        returnByValue: true
      });
      if (evaluated.exceptionDetails) throw new Error(JSON.stringify(evaluated.exceptionDetails));
      return evaluated.result.value;
    }

    const initial = await pageState();
    assert(initial.total === "SAMPLE total: $0", "initial total " + initial.total);
    assert(initial.review === null, "review link should start without an href");
    assert(initial.reviewDisabled === "true", "review link should start disabled");
    assert(initial.join === config.responderUrl, "join link mismatch");
    assert(initial.storage === 0, "browser storage was written");
    assert(initial.cookieHasEmail === false, "cookie contains an email");
    assert(initial.state === "configured", "page did not accept the form config");
    assert(initial.status.includes("not a signup"), "status missing");
    assert(initial.banner.includes("Free research prototype"), "banner prototype " + initial.banner);
    assert(initial.banner.includes("SAMPLE bills only"), "banner samples " + initial.banner);
    assert(initial.banner.includes("No donation, payment, or bill payment happens here"), "banner payment " + initial.banner);
    assert(initial.banner.includes("Joining does not move money"), "banner money " + initial.banner);
    assert(initial.money.includes("SAMPLE bills only"), "money note " + initial.money);
    assert(initial.money.includes("Joining does not move money"), "money note payment " + initial.money);
    assert(initial.joinDetail.includes("Joining does not move money"), "join detail " + initial.joinDetail);
    assert(initial.role.includes("help pay others' bills"), "role note " + initial.role);
    assert(initial.role.includes("need help with a bill"), "role note help " + initial.role);
    assert(initial.role.includes("or other"), "role note other " + initial.role);
    assert(initial.robots === "noindex, nofollow", "robots " + initial.robots);
    assert(initial.frames === 0, "form was iframed");
    assert(initial.scrollWidth <= initial.clientWidth + 1, "desktop overflow " + initial.scrollWidth);

    await client.send("Runtime.evaluate", {
      expression: `(() => {
        document.querySelector('input[value="utility-a"]').click();
        document.querySelector('input[value="utility-b"]').click();
      })()`
    });
    const selected = await pageState();
    assert(selected.total === "SAMPLE total: $105", "selected total " + selected.total);
    assert(selected.summary === "2 sample bills selected.", "summary " + selected.summary);
    assert(selected.review === expectedPair, "prefill mismatch\n" + selected.review + "\n" + expectedPair);
    assert(selected.reviewDisabled === null, "review link stayed disabled");
    assert(selected.reviewDetail.includes("Joining does not move money"), "review detail " + selected.reviewDetail);
    assert(selected.banner === initial.banner, "banner changed after selection");
    assert(selected.join === config.responderUrl, "join link changed");
    assert(!selected.review.includes("medical"), "unselected medical bill was prefilled");
    assert(selected.storage === 0, "selection was stored in the browser");

    async function shoot(name) {
      const shot = await client.send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: true
      });
      fs.writeFileSync(path.join(outDir, name), Buffer.from(shot.data, "base64"));
    }
    await shoot("clear_the_bill_desktop_selected.png");

    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true
    });
    const mobile = await pageState();
    assert(mobile.total === "SAMPLE total: $105", "mobile total changed");
    assert(mobile.scrollWidth <= mobile.clientWidth + 1, "mobile overflow " + mobile.scrollWidth + "/" + mobile.clientWidth);
    await shoot("clear_the_bill_mobile_selected.png");

    await client.send("Runtime.evaluate", {
      expression: `document.getElementById("reset-selection").click()`
    });
    const cleared = await pageState();
    assert(cleared.total === "SAMPLE total: $0", "reset total " + cleared.total);
    assert(cleared.review === null, "reset left a bundle link");
    assert(cleared.reviewDisabled === "true", "reset left the bundle link enabled");
    assert(cleared.join === config.responderUrl, "reset removed the plain form link");
    assert(cleared.storage === 0, "reset wrote browser storage");
    console.log("browser-check ok");
    console.log("desktop " + path.join(outDir, "clear_the_bill_desktop_selected.png"));
    console.log("mobile " + path.join(outDir, "clear_the_bill_mobile_selected.png"));
  } finally {
    if (client) client.close();
    if (chrome.exitCode === null && !chrome.killed) {
      chrome.kill("SIGKILL");
      await new Promise(function (resolve) {
        chrome.once("exit", resolve);
        setTimeout(resolve, 1500);
      });
    }
    site.close();
    try {
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    } catch (err) {
      console.error("profile cleanup skipped: " + err.message);
    }
  }
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
