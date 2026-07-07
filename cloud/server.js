const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";
const WRITE_TOKEN = process.env.NIU_TOKEN || "";
const VIEW_TOKEN = process.env.VIEW_TOKEN || "";
const DATA_DIR = process.env.DATA_DIR || __dirname;
const STATE_FILE = path.join(DATA_DIR, "state.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const ASSETS_DIR = path.join(__dirname, "assets");

const defaultState = {
  vehicle: "Niu MT 2025",
  battery: null,
  rangeKm: null,
  charging: null,
  fullIn: null,
  location: null,
  locationAge: null,
  locationRaw: "",
  locationUpdatedAt: null,
  latitude: null,
  longitude: null,
  mapUrl: null,
  raw: "",
  updatedAt: new Date().toISOString(),
};

function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function tokenFrom(req, url) {
  const auth = req.headers.authorization || "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return url.searchParams.get("token") || req.headers["x-niu-token"] || "";
}

function requireToken(req, url, token) {
  if (!token) return true;
  return timingSafeEqual(tokenFrom(req, url), token);
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadState() {
  try {
    return { ...defaultState, ...JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) };
  } catch {
    return { ...defaultState };
  }
}

function saveState(state) {
  ensureDataDir();
  fs.writeFileSync(STATE_FILE, JSON.stringify({ ...defaultState, ...state }, null, 2), "utf8");
}

function lanIp() {
  const candidates = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const item of list || []) {
      if (item.family === "IPv4" && !item.internal) candidates.push(item.address);
    }
  }
  const privateIp = candidates.find(ip =>
    ip.startsWith("192.168.") ||
    ip.startsWith("10.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
  );
  return privateIp || candidates[0] || "127.0.0.1";
}

function durationFromText(text) {
  const en = text.match(/(\d+)\s*hour[s]?\s*(\d+)\s*min/i);
  if (en) return `${en[1]}h ${en[2]}m`;
  const zh = text.match(/(\d+)\s*(?:小?时|h)\s*(\d+)\s*(?:分|m)/i);
  if (zh) return `${zh[1]}h ${zh[2]}m`;
  return null;
}

function locationFromText(text) {
  const raw = String(text || "").trim();
  if (!raw) return {};

  const located = raw.match(/Vehicle\s+(.+?)\s+is\s+located\s+at\s+([^"{}]+)(?:["{}]|$)/i);
  if (located) {
    return {
      locationAge: located[1].trim(),
      location: cleanLocation(located[2]),
      locationRaw: raw,
      locationUpdatedAt: new Date().toISOString(),
    };
  }

  const zh = raw.match(/(?:车辆|小牛).{0,12}?(\d+\s*(?:分钟|小时|天)前).{0,12}?(?:位于|位置[:：]?)\s*(.+)$/i);
  if (zh) {
    return {
      locationAge: zh[1].trim(),
      location: cleanLocation(zh[2]),
      locationRaw: raw,
      locationUpdatedAt: new Date().toISOString(),
    };
  }

  return {};
}

function cleanLocation(value) {
  return String(value || "")
    .trim()
    .replace(/[\\"]+$/g, "")
    .replace(/\\+$/g, "")
    .trim();
}

function numberOrNull(value) {
  if (value == null || value === "") return null;
  const num = Number.parseFloat(value);
  return Number.isFinite(num) ? num : null;
}

function staticMapUrl(latitude, longitude) {
  const lat = numberOrNull(latitude);
  const lng = numberOrNull(longitude);
  if (lat == null || lng == null) return null;
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=16&size=280x105&markers=${lat},${lng},red-pushpin`;
}

function boolValue(value) {
  if (value == null || value === "") return null;
  if (typeof value === "boolean") return value;
  const text = String(value).toLowerCase();
  return ["1", "true", "yes", "y", "charging", "charge"].includes(text) || /充电/.test(String(value));
}

function tryParseJsonObject(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text.startsWith("{") || !text.endsWith("}")) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeIncoming(incoming) {
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) return {};
  if (incoming.raw || incoming.raw2 || incoming.text || incoming.location || incoming.address || incoming.latitude || incoming.lat || incoming.mapUrl) return incoming;

  const entries = Object.entries(incoming);
  if (entries.length !== 1) return incoming;

  const [key, value] = entries[0];
  const parsedValue = tryParseJsonObject(value);
  if (parsedValue && (parsedValue.raw || parsedValue.raw2 || parsedValue.text || parsedValue.location || parsedValue.address)) return parsedValue;

  const parsedKey = tryParseJsonObject(key);
  if (parsedKey && (parsedKey.raw || parsedKey.raw2 || parsedKey.text || parsedKey.location || parsedKey.address)) return parsedKey;

  return incoming;
}

function parseBody(body, contentType) {
  let incoming = {};
  const text = body.toString("utf8").trim();

  if (contentType.includes("application/json")) {
    try {
      incoming = JSON.parse(text || "{}");
    } catch {
      incoming = { raw: text };
    }
  } else if (contentType.includes("application/x-www-form-urlencoded")) {
    incoming = Object.fromEntries(new URLSearchParams(text));
    incoming.raw = incoming.raw || incoming.text || text;
  } else {
    incoming = { raw: text };
  }

  incoming = normalizeIncoming(incoming);

  const raw = String(incoming.raw || incoming.raw2 || incoming.text || text || "");
  const percent = raw.match(/remaining\s*(\d{1,3})\s*%/i) || raw.match(/(\d{1,3})\s*%/);
  const km = raw.match(/Battery Life\s*(\d+(?:\.\d+)?)\s*km/i) || raw.match(/(\d+(?:\.\d+)?)\s*km/i);

  const battery = incoming.battery ?? incoming.batteryPercent ?? (percent && percent[1]);
  const rangeKm = incoming.rangeKm ?? incoming.range ?? incoming.mileage ?? (km && km[1]);
  const charging = boolValue(incoming.charging);

  const locationFields = locationFromText(raw);
  const explicitLocation = cleanLocation(incoming.location || incoming.address || incoming.locationText);
  const explicitLocationAge = incoming.locationAge || incoming.positionAge;
  const latitude = numberOrNull(incoming.latitude ?? incoming.lat);
  const longitude = numberOrNull(incoming.longitude ?? incoming.lng ?? incoming.lon);
  const mapUrl = incoming.mapUrl || incoming.mapImageUrl || staticMapUrl(latitude, longitude);

  const result = {
    updatedAt: new Date().toISOString(),
  };

  if (incoming.vehicle || incoming.name) result.vehicle = incoming.vehicle || incoming.name;
  if (raw) result.raw = raw;
  if (battery != null && battery !== "") result.battery = Number.parseInt(battery, 10);
  if (rangeKm != null && rangeKm !== "") result.rangeKm = Number.parseFloat(Number.parseFloat(rangeKm).toFixed(1));
  if (result.battery != null && result.battery >= 100) result.charging = false;
  else if (charging != null) result.charging = charging;
  else if (/charging|充电/i.test(raw)) result.charging = true;
  if (result.battery != null && result.battery >= 100) {
    result.fullIn = "Full";
  } else if (incoming.fullIn || incoming.estimatedFullIn || durationFromText(raw)) {
    result.fullIn = incoming.fullIn || incoming.estimatedFullIn || durationFromText(raw);
  }

  if (explicitLocation || locationFields.location) {
    result.location = explicitLocation || locationFields.location;
    result.locationUpdatedAt = new Date().toISOString();
  }
  if (explicitLocationAge || locationFields.locationAge) result.locationAge = explicitLocationAge || locationFields.locationAge;
  if (incoming.locationRaw || locationFields.locationRaw) result.locationRaw = incoming.locationRaw || locationFields.locationRaw;
  if (latitude != null) result.latitude = latitude;
  if (longitude != null) result.longitude = longitude;
  if (mapUrl) result.mapUrl = mapUrl;

  return result;
}

const html = String.raw`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>小牛状态面板</title>
  <style>
    :root{--ink:#18202a;--muted:#637083;--line:#d9e0ea;--bg:#eef3f8;--battery:#20b26b;--blue:#255f9f;color-scheme:light}
    *{box-sizing:border-box} body{margin:0;min-height:100vh;display:grid;place-items:center;background:linear-gradient(115deg,rgba(37,95,159,.08),transparent 46%),repeating-linear-gradient(90deg,rgba(24,32,42,.045) 0 1px,transparent 1px 18px),var(--bg);color:var(--ink);font-family:"Segoe UI","Microsoft YaHei UI",system-ui,sans-serif}
    main{width:min(440px,calc(100vw - 28px));padding:18px}.panel{overflow:hidden;border:1px solid rgba(24,32,42,.1);border-radius:8px;background:rgba(248,250,252,.94);box-shadow:0 20px 50px rgba(24,32,42,.14)}
    .top{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 20px 12px;border-bottom:1px solid var(--line)}h1{margin:0;font-size:18px;line-height:1.2}p{margin:5px 0 0;color:var(--muted);font-size:12px;line-height:1.4}.signal{flex:0 0 auto;min-width:78px;padding:8px 10px;border-radius:6px;color:#fff;background:var(--battery);text-align:center;font-size:12px;font-weight:800}
    .hero{display:grid;grid-template-columns:1fr 144px;align-items:center;gap:14px;padding:26px 20px 24px}.range{display:flex;align-items:baseline;gap:8px}.range strong{font-size:clamp(54px,18vw,86px);line-height:.9;font-weight:850;font-variant-numeric:tabular-nums}.range span{font-size:24px;font-weight:850}.battery-pack{margin-top:16px;width:170px;max-width:100%}.battery-shell{position:relative;height:42px;border:2px solid #203044;border-radius:7px;padding:4px;background:#fff}.battery-shell:after{content:"";position:absolute;right:-10px;top:12px;width:7px;height:16px;border-radius:0 4px 4px 0;background:#203044}.battery-fill{height:100%;width:0%;min-width:3px;border-radius:4px;background:var(--battery);transition:width .35s ease}.battery-label{margin-top:8px;font-size:18px;font-weight:850;font-variant-numeric:tabular-nums}
    .scooter{position:relative;height:132px}.deck{position:absolute;left:22px;right:18px;bottom:34px;height:10px;border-radius:999px;background:#1b2531}.front,.rear{position:absolute;bottom:9px;width:40px;height:40px;border:8px solid #1b2531;border-radius:50%;background:#e7edf4}.front{left:8px}.rear{right:4px}.stem{position:absolute;left:36px;bottom:43px;width:8px;height:70px;border-radius:999px;background:#1b2531;transform:rotate(-18deg);transform-origin:bottom center}.bar{position:absolute;left:18px;top:8px;width:54px;height:7px;border-radius:999px;background:#1b2531}.seat{position:absolute;right:22px;bottom:72px;width:58px;height:14px;border-radius:999px;background:#1b2531}.pack{position:absolute;right:26px;bottom:42px;width:26px;height:34px;border-radius:4px;background:var(--battery);box-shadow:inset 0 0 0 3px rgba(255,255,255,.35)}
    .details{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid var(--line)}.detail{padding:15px 18px;border-right:1px solid var(--line)}.detail:last-child{border-right:0}.detail span{display:block;color:var(--muted);font-size:12px}.detail strong{display:block;margin-top:5px;font-size:17px;line-height:1.25}.raw{padding:14px 18px 16px;border-top:1px solid var(--line);color:var(--muted);font-size:12px;line-height:1.55;word-break:break-word}.setup{margin-top:12px;padding:12px 14px;border:1px dashed rgba(37,95,159,.38);border-radius:8px;background:rgba(255,255,255,.55);color:var(--muted);font-size:12px;line-height:1.55}code{color:var(--blue);font-family:Consolas,"Cascadia Mono",monospace;font-size:12px}@media(max-width:390px){.hero{grid-template-columns:1fr}.scooter{height:104px;opacity:.84}}
  </style>
</head>
<body>
  <main>
    <section class="panel" aria-live="polite">
      <div class="top"><div><h1 id="vehicle">小牛 MT 2025</h1><p id="updated">等待 iPhone 快捷指令发送状态</p></div><div class="signal" id="signal">待更新</div></div>
      <div class="hero"><div><div class="range"><strong id="range">--</strong><span>km</span></div><div class="battery-pack"><div class="battery-shell"><div class="battery-fill" id="fill"></div></div><div class="battery-label" id="battery">--%</div></div></div><div class="scooter" aria-hidden="true"><div class="bar"></div><div class="stem"></div><div class="seat"></div><div class="deck"></div><div class="pack"></div><div class="front"></div><div class="rear"></div></div></div>
      <div class="details"><div class="detail"><span>状态</span><strong id="charging">--</strong></div><div class="detail"><span>预计充满</span><strong id="fullIn">--</strong></div></div>
      <div class="raw" id="raw">打开 iPhone 快捷指令后，状态会显示在这里。</div>
    </section>
    <div class="setup">快捷指令 POST 地址：<code id="endpoint"></code><br>JSON 示例：<code>{"battery":15,"rangeKm":11,"charging":true,"fullIn":"7小时18分钟"}</code></div>
  </main>
  <script>
    const params = new URLSearchParams(location.search);
    const token = params.get("token");
    const tokenQuery = token ? "?token=" + encodeURIComponent(token) : "";
    document.getElementById("endpoint").textContent = location.origin + "/niu" + tokenQuery;
    function fmtTime(v){if(!v)return"等待 iPhone 快捷指令发送状态";const d=new Date(v);return Number.isNaN(d.getTime())?v:"更新于 "+d.toLocaleString("zh-CN",{hour12:false})}
    function statusText(s){if(s.battery==null)return"待更新";if(s.charging)return"充电中";if(s.battery<30)return"该充电";if(s.battery<50)return"偏低";return"够用"}
    function colorFor(b,c){if(b==null)return"#637083";if(c)return"#20b26b";if(b<30)return"#d94a38";if(b<50)return"#e2a51a";return"#20b26b"}
    function render(s){const b=Number.isFinite(Number(s.battery))?Number(s.battery):null;const km=Number.isFinite(Number(s.rangeKm))?Number(s.rangeKm):null;document.documentElement.style.setProperty("--battery",colorFor(b,s.charging));vehicle.textContent=s.vehicle||"小牛 MT 2025";updated.textContent=fmtTime(s.updatedAt);signal.textContent=statusText(s);range.textContent=km==null?"--":String(km).replace(".0","");battery.textContent=b==null?"--%":b+"%";fill.style.width=Math.max(0,Math.min(100,b??0))+"%";charging.textContent=s.charging==null?"--":s.charging?"充电中":"未充电";fullIn.textContent=s.fullIn||"--";raw.textContent=s.raw||"未收到原始文本。";document.title=b==null?"小牛状态面板":"小牛 "+b+"% / "+(km??"--")+"km"}
    async function refresh(){try{const r=await fetch("/state"+tokenQuery,{cache:"no-store"});render(await r.json())}catch{signal.textContent="离线";raw.textContent="没有连上接收服务，或查看 token 不正确。"}}
    refresh();setInterval(refresh,3000);
  </script>
</body>
</html>`;

function respond(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Niu-Token",
  });
  res.end(body);
}

function json(res, status, data) {
  respond(res, status, JSON.stringify(data), "application/json; charset=utf-8");
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "application/javascript; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

function serveStatic(res, baseDir, requestPath) {
  const decoded = decodeURIComponent(requestPath).replace(/^\/+/, "");
  const fullPath = path.resolve(baseDir, decoded);
  const base = path.resolve(baseDir);
  if (!fullPath.startsWith(base + path.sep) && fullPath !== base) {
    return json(res, 403, { ok: false, error: "forbidden" });
  }
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    return json(res, 404, { ok: false, error: "not found" });
  }
  const body = fs.readFileSync(fullPath);
  respond(res, 200, body, contentType(fullPath));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "OPTIONS") return json(res, 200, { ok: true });
  if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { ok: true });
  if (req.method === "GET" && url.pathname.startsWith("/assets/")) return serveStatic(res, ASSETS_DIR, url.pathname.slice("/assets/".length));
  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    const indexPath = path.join(PUBLIC_DIR, "index.html");
    if (fs.existsSync(indexPath)) return serveStatic(res, PUBLIC_DIR, "index.html");
    return respond(res, 200, html, "text/html; charset=utf-8");
  }

  if (req.method === "GET" && url.pathname === "/state") {
    if (!requireToken(req, url, VIEW_TOKEN)) return json(res, 401, { ok: false, error: "invalid token" });
    return json(res, 200, loadState());
  }

  if (req.method === "POST" && url.pathname === "/niu") {
    if (!requireToken(req, url, WRITE_TOKEN)) return json(res, 401, { ok: false, error: "invalid token" });

    const chunks = [];
    req.on("data", chunk => chunks.push(chunk));
    req.on("end", () => {
      const state = { ...loadState(), ...parseBody(Buffer.concat(chunks), req.headers["content-type"] || "") };
      saveState(state);
      json(res, 200, { ok: true, state });
      console.log(`[${new Date().toLocaleString("zh-CN", { hour12: false })}] ${state.battery ?? "--"}% ${state.rangeKm ?? "--"}km`);
    });
    return;
  }

  json(res, 404, { ok: false, error: "not found" });
});

function start() {
  saveState(loadState());
  server.listen(PORT, HOST, () => {
    const ip = lanIp();
    console.log("Niu dashboard started");
    console.log(`Local:  http://127.0.0.1:${PORT}`);
    console.log(`LAN:    http://${ip}:${PORT}`);
    console.log(`POST:   http://${ip}:${PORT}/niu${WRITE_TOKEN ? "?token=***" : ""}`);
  });
}

if (require.main === module) start();

module.exports = { server, start, parseBody, loadState };
