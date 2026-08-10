const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcodeTerminal = require("qrcode-terminal");
const QRCode = require("qrcode");

const PORT = process.env.PORT || 3000;
const RESTAURANT_NAME = process.env.RESTAURANT_NAME || "Swadeshii";
const RESTAURANT_PHONE = process.env.RESTAURANT_PHONE || "9286313130";
const UPI_ID = process.env.UPI_ID || "9286313130@fam";
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "store.json");
const ROOT_DIR = path.join(__dirname, "..");

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);

  for (const chromePath of candidates) {
    if (fs.existsSync(chromePath)) return chromePath;
  }
  return null;
}

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ orders: {} }, null, 2));
  }
}

function readStore() {
  ensureStore();
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function writeStore(store) {
  ensureStore();
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
}

function normalizePhone(phone) {
  let digits = String(phone).replace(/\D/g, "");
  if (digits.length === 10) digits = `91${digits}`;
  if (digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

function toWhatsAppId(phone) {
  return `${normalizePhone(phone)}@c.us`;
}

function fromWhatsAppId(waId) {
  return waId.replace("@c.us", "").replace("@s.whatsapp.net", "");
}

function formatOrderMessage(order) {
  const lines = [
    `🍛 *NEW ORDER — ${order.id}*`,
    ``,
    `👤 *Customer:* ${order.customer.name}`,
    `📞 *Phone:* ${order.customer.phone}`,
    `📍 *Address:* ${order.customer.address}`,
  ];

  if (order.customer.notes) {
    lines.push(`📝 *Notes:* ${order.customer.notes}`);
  }

  lines.push(``, `*Items:*`);
  order.items.forEach((item) => {
    lines.push(`  • ${item.emoji} ${item.name} × ${item.qty} — ₹${item.price * item.qty}`);
  });
  lines.push(
    ``,
    `💰 *Total: ₹${order.total}*`,
    `💳 *UPI:* ${UPI_ID}`,
    `📞 *Restaurant:* +91 ${RESTAURANT_PHONE}`,
    ``,
    `⏱️ Deliver within 30 minutes!`,
    ``,
    `_Reply to this customer on WhatsApp — they'll see your message on the website too._`
  );

  return lines.join("\n");
}

function addMessage(store, orderId, from, text) {
  const order = store.orders[orderId];
  if (!order) return null;

  const message = {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    from,
    text,
    at: new Date().toISOString(),
  };

  order.messages.push(message);
  order.updatedAt = message.at;
  return message;
}

function findOrderByPhone(store, phone) {
  const normalized = normalizePhone(phone);
  const orders = Object.values(store.orders)
    .filter((o) => normalizePhone(o.customer.phone) === normalized)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return orders.find((o) => o.status !== "delivered") || orders[0] || null;
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(ROOT_DIR));

let waReady = false;
let waClient = null;
let latestQr = null;
let waError = null;
let waStatus = "disconnected";
let client = null;

function buildPuppeteerConfig() {
  const chromePath = findChrome();
  const config = {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  };
  if (chromePath) {
    config.executablePath = chromePath;
    console.log(`🌐 Using Chrome: ${chromePath}`);
  }
  return config;
}

function attachClientEvents(wa) {
  wa.on("qr", (qr) => {
    latestQr = qr;
    waStatus = "qr";
    waError = null;
    console.log("\n📱 Scan QR at http://localhost:" + PORT + "/whatsapp-setup.html\n");
    qrcodeTerminal.generate(qr, { small: true });
    console.log("\nWhatsApp → Settings → Linked Devices → Link a Device\n");
  });

  wa.on("ready", () => {
    waReady = true;
    waStatus = "ready";
    latestQr = null;
    waError = null;
    console.log(`✅ WhatsApp connected for ${RESTAURANT_NAME}`);
  });

  wa.on("authenticated", () => {
    waStatus = "authenticated";
    console.log("🔐 WhatsApp authenticated");
  });

  wa.on("auth_failure", (msg) => {
    waReady = false;
    waStatus = "error";
    waError = String(msg);
    console.error("❌ WhatsApp auth failed:", msg);
  });

  wa.on("disconnected", (reason) => {
    waReady = false;
    waStatus = "disconnected";
    latestQr = null;
    console.log("⚠️ WhatsApp disconnected:", reason);
  });
}

function createClient() {
  return new Client({
    authStrategy: new LocalAuth({ dataPath: path.join(DATA_DIR, "wwebjs_auth") }),
    puppeteer: buildPuppeteerConfig(),
  });
}

async function initWhatsApp() {
  const chromePath = findChrome();
  if (!chromePath) {
    waStatus = "error";
    waError =
      "Google Chrome not found. Install Chrome from google.com/chrome then restart the server.";
    console.error("❌", waError);
    return;
  }

  try {
    waStatus = "initializing";
    waError = null;
    client = createClient();
    waClient = client;
    attachClientEvents(client);

    client.on("message_create", onMessageCreate);
    client.on("message", onIncomingMessage);

    await client.initialize();
  } catch (err) {
    waReady = false;
    waStatus = "error";
    waError = err.message;
    console.error("❌ WhatsApp failed to start:", err.message);
  }
}

async function onMessageCreate(msg) {

  if (!msg.fromMe || msg.isStatus) return;

  try {
    const store = readStore();
    const customerPhone = fromWhatsAppId(msg.to);
    const order = findOrderByPhone(store, customerPhone);

    if (!order) return;

    const body = msg.body?.trim();
    if (!body) return;

    const lastMsg = order.messages[order.messages.length - 1];
    if (lastMsg?.from === "restaurant" && lastMsg.text === body) return;

    addMessage(store, order.id, "restaurant", body);
    writeStore(store);
    console.log(`💬 Reply synced to order ${order.id}: ${body.slice(0, 50)}...`);
  } catch (err) {
    console.error("message_create error:", err.message);
  }
}

async function onIncomingMessage(msg) {
  if (msg.fromMe || msg.isStatus) return;

  try {
    const store = readStore();
    const customerPhone = fromWhatsAppId(msg.from);
    const order = findOrderByPhone(store, customerPhone);
    if (!order) return;

    const body = msg.body?.trim();
    if (!body) return;

    addMessage(store, order.id, "customer", body);
    writeStore(store);
    console.log(`📩 Customer WhatsApp message on ${order.id}`);
  } catch (err) {
    console.error("message error:", err.message);
  }
}

async function sendWhatsApp(phone, text) {
  if (!waReady || !client) return { ok: false, error: "WhatsApp not connected" };
  try {
    await client.sendMessage(toWhatsAppId(phone), text);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, whatsapp: waReady });
});

app.get("/api/whatsapp/status", (_req, res) => {
  res.json({
    connected: waReady,
    status: waStatus,
    error: waError,
    hasQr: !!latestQr,
    setupUrl: `/whatsapp-setup.html`,
  });
});

app.get("/api/whatsapp/qr", async (_req, res) => {
  if (!latestQr) return res.status(404).json({ error: "No QR code available yet" });
  try {
    const qr = await QRCode.toDataURL(latestQr);
    res.json({ qr });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/whatsapp/retry", async (_req, res) => {
  try {
    if (client) {
      await client.destroy().catch(() => {});
    }
    client = null;
    waReady = false;
    latestQr = null;
    await initWhatsApp();
    res.json({ ok: true, status: waStatus, error: waError });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/orders/:id", (req, res) => {
  const store = readStore();
  const order = store.orders[req.params.id];
  if (!order) return res.status(404).json({ error: "Order not found" });
  res.json(order);
});

app.get("/api/orders/:id/messages", (req, res) => {
  const store = readStore();
  const order = store.orders[req.params.id];
  if (!order) return res.status(404).json({ error: "Order not found" });
  res.json({ messages: order.messages, status: order.status });
});

app.post("/api/orders/:id/messages", async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: "Message required" });

  const store = readStore();
  const order = store.orders[req.params.id];
  if (!order) return res.status(404).json({ error: "Order not found" });

  const message = addMessage(store, order.id, "customer", text.trim());
  writeStore(store);

  if (waReady && client.info?.wid) {
    const ownerNotify =
      `💬 *Message from ${order.customer.name}* (${order.id})\n` +
      `📞 ${order.customer.phone}\n\n` +
      text.trim();
    await client.sendMessage(client.info.wid._serialized, ownerNotify).catch(() => {});
  }

  res.json({ message, whatsapp: waReady });
});

app.post("/api/orders", async (req, res) => {
  const { id, customer, items, total } = req.body;

  if (!id || !customer?.name || !customer?.phone || !customer?.address || !items?.length) {
    return res.status(400).json({ error: "Invalid order data" });
  }

  const store = readStore();
  const order = {
    id,
    customer,
    items,
    total,
    status: "confirmed",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [],
  };

  store.orders[id] = order;
  addMessage(
    store,
    id,
    "system",
    `Order confirmed! We're preparing your home-cooked meal. Estimated delivery in 30 minutes.`
  );
  writeStore(store);

  const customerWelcome =
    `🌿 *${RESTAURANT_NAME}*\n\n` +
    `Hi ${customer.name}! Your order *${id}* is confirmed.\n\n` +
    `We're cooking your meal with love — delivery in ~30 minutes.\n\n` +
    `💰 Total: ₹${total}\n` +
    `💳 Pay via UPI: *${UPI_ID}*\n\n` +
    `You can track updates on our website. Reply here anytime!`;

  const ownerOrder = formatOrderMessage(order);

  let whatsappStatus = { owner: false, customer: false };

  if (waReady) {
    if (client.info?.wid) {
      try {
        await client.sendMessage(client.info.wid._serialized, ownerOrder);
        whatsappStatus.owner = true;
      } catch {
        whatsappStatus.owner = false;
      }
    }

    const customerResult = await sendWhatsApp(customer.phone, customerWelcome);
    whatsappStatus.customer = customerResult.ok;

    if (customerResult.ok) {
      addMessage(store, id, "system", "We've sent you a confirmation on WhatsApp too!");
      writeStore(store);
    }
  }

  const waLink = `https://wa.me/${normalizePhone(customer.phone)}?text=${encodeURIComponent(
    `Hi! I placed order ${id} on Swadeshii.`
  )}`;

  res.json({
    order: store.orders[id],
    whatsapp: { connected: waReady, ...whatsappStatus },
    waLink,
  });
});

app.patch("/api/orders/:id/status", (req, res) => {
  const { status } = req.body;
  const store = readStore();
  const order = store.orders[req.params.id];
  if (!order) return res.status(404).json({ error: "Order not found" });

  order.status = status;
  order.updatedAt = new Date().toISOString();
  writeStore(store);
  res.json(order);
});

const server = app.listen(PORT, () => {
  console.log(`\n🌿 ${RESTAURANT_NAME} server running at http://localhost:${PORT}`);
  console.log(`📱 Connect WhatsApp: http://localhost:${PORT}/whatsapp-setup.html\n`);
  initWhatsApp();
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n❌ Port ${PORT} is already in use.`);
    console.error("   Close the old server terminal window, then run npm start again.\n");
  } else {
    console.error("Server error:", err.message);
  }
  process.exit(1);
});
