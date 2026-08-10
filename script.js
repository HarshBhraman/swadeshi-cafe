/* Swadeshii — Cart & Order System + WhatsApp Chat */

const RESTAURANT_PHONE = "9286313130";
const RESTAURANT_PHONE_DISPLAY = "+91 92863 13130";
const RESTAURANT_WHATSAPP = `91${RESTAURANT_PHONE}`;
const UPI_ID = "9286313130@fam";

const API_BASE =
  window.location.protocol === "file:" || !window.location.port
    ? "http://localhost:3000"
    : "";

const MENU_ITEMS = [
  { id: "poha", name: "Poha with Peanuts", price: 89, emoji: "🥣", category: "breakfast" },
  { id: "paratha", name: "Stuffed Paratha Combo", price: 129, emoji: "🫓", category: "breakfast" },
  { id: "dosa", name: "Masala Dosa", price: 109, emoji: "🍳", category: "breakfast" },
  { id: "chole", name: "Chole Bhature", price: 149, emoji: "🥞", category: "breakfast" },
  { id: "thali", name: "Dal Tadka Thali", price: 199, emoji: "🍛", category: "mains" },
  { id: "chicken", name: "Homestyle Chicken Curry", price: 249, emoji: "🍗", category: "mains" },
  { id: "paneer", name: "Paneer Butter Masala", price: 219, emoji: "🥘", category: "mains" },
  { id: "fish", name: "Fish Curry (Bengali Style)", price: 279, emoji: "🐟", category: "mains" },
  { id: "rajma", name: "Rajma Chawal", price: 169, emoji: "🍲", category: "mains" },
  { id: "palak", name: "Palak Paneer", price: 199, emoji: "🥗", category: "mains" },
  { id: "rotis", name: "Assorted Rotis (4 pcs)", price: 49, emoji: "🫓", category: "breads" },
  { id: "rice", name: "Jeera Rice", price: 79, emoji: "🍚", category: "breads" },
  { id: "naan", name: "Garlic Naan (2 pcs)", price: 69, emoji: "🧅", category: "breads" },
  { id: "samosa", name: "Samosa (2 pcs)", price: 49, emoji: "🥟", category: "snacks" },
  { id: "tikka", name: "Paneer Tikka", price: 179, emoji: "🍢", category: "snacks" },
  { id: "bhel", name: "Bhel Puri", price: 69, emoji: "🥙", category: "snacks" },
  { id: "dhokla", name: "Dhokla", price: 89, emoji: "🧆", category: "snacks" },
  { id: "lassi-mango", name: "Fresh Mango Lassi", price: 79, emoji: "🥤", category: "beverages" },
  { id: "chai", name: "Masala Chai", price: 39, emoji: "☕", category: "beverages" },
  { id: "nimbu", name: "Nimbu Pani", price: 49, emoji: "🧃", category: "beverages" },
  { id: "lassi", name: "Sweet Lassi", price: 59, emoji: "🥛", category: "beverages" },
];

let cart = JSON.parse(localStorage.getItem("swadeshii-cart") || "[]");
const itemQty = {};
let activeOrderId = localStorage.getItem("swadeshii-active-order") || null;
let chatPollTimer = null;
let lastMessageCount = 0;

function saveCart() {
  localStorage.setItem("swadeshii-cart", JSON.stringify(cart));
}

function formatPrice(amount) {
  return `₹${amount}`;
}

function getCartTotal() {
  return cart.reduce((sum, item) => sum + item.price * item.qty, 0);
}

function getCartCount() {
  return cart.reduce((sum, item) => sum + item.qty, 0);
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2500);
}

function addToCart(id, qty = 1) {
  const menuItem = MENU_ITEMS.find((m) => m.id === id);
  if (!menuItem) return;

  const existing = cart.find((c) => c.id === id);
  if (existing) {
    existing.qty += qty;
  } else {
    cart.push({ ...menuItem, qty });
  }

  itemQty[id] = (itemQty[id] || 0) + qty;
  saveCart();
  updateCartUI();
  updateMenuQtyDisplays();
  showToast(`${menuItem.emoji} ${menuItem.name} added to cart!`);
}

function updateQty(id, delta) {
  const existing = cart.find((c) => c.id === id);
  if (!existing) {
    if (delta > 0) addToCart(id, 1);
    return;
  }

  existing.qty += delta;
  itemQty[id] = existing.qty;

  if (existing.qty <= 0) {
    cart = cart.filter((c) => c.id !== id);
    itemQty[id] = 0;
  }

  saveCart();
  updateCartUI();
  updateMenuQtyDisplays();
  renderOrderSummary();
}

function removeFromCart(id) {
  cart = cart.filter((c) => c.id !== id);
  itemQty[id] = 0;
  saveCart();
  updateCartUI();
  updateMenuQtyDisplays();
  renderOrderSummary();
}

function updateCartUI() {
  const count = getCartCount();
  const countEl = document.getElementById("cartCount");
  countEl.textContent = count;
  countEl.classList.toggle("visible", count > 0);

  const cartItemsEl = document.getElementById("cartItems");
  const cartTotalEl = document.getElementById("cartTotalAmount");

  if (cart.length === 0) {
    cartItemsEl.innerHTML = `
      <div class="cart-empty">
        <span>🍽️</span>
        <p>Your cart is empty.<br />Add something delicious!</p>
      </div>`;
    cartTotalEl.textContent = formatPrice(0);
    return;
  }

  cartItemsEl.innerHTML = cart
    .map(
      (item) => `
    <div class="cart-item" data-id="${item.id}">
      <span class="cart-item-emoji">${item.emoji}</span>
      <div class="cart-item-details">
        <h4>${item.name}</h4>
        <span>${formatPrice(item.price * item.qty)}</span>
      </div>
      <div class="qty-control">
        <button class="qty-btn" data-action="minus" data-id="${item.id}" aria-label="Decrease quantity">−</button>
        <span class="qty-value">${item.qty}</span>
        <button class="qty-btn" data-action="plus" data-id="${item.id}" aria-label="Increase quantity">+</button>
      </div>
    </div>`
    )
    .join("");

  cartTotalEl.textContent = formatPrice(getCartTotal());
  renderOrderSummary();
  updatePaymentUI();
}

function renderOrderSummary() {
  const summaryEl = document.getElementById("orderSummary");
  if (!summaryEl) return;

  if (cart.length === 0) {
    summaryEl.innerHTML = `<div class="order-summary-empty">🛒 Add items from the menu above</div>`;
    return;
  }

  const itemsHtml = cart
    .map(
      (item) => `
    <div class="summary-item">
      <span class="summary-item-info">${item.emoji} ${item.name} × ${item.qty}</span>
      <span>${formatPrice(item.price * item.qty)}</span>
    </div>`
    )
    .join("");

  summaryEl.innerHTML = `
    <h4>Your Order <span>${getCartCount()} items</span></h4>
    ${itemsHtml}
    <div class="summary-total">
      <span>Total</span>
      <span>${formatPrice(getCartTotal())}</span>
    </div>`;

  updatePaymentUI();
}

function updateMenuQtyDisplays() {
  document.querySelectorAll(".menu-item").forEach((el) => {
    const id = el.dataset.id;
    const qtyEl = el.querySelector(".qty-value");
    const qty = itemQty[id] || 0;
    if (qtyEl) qtyEl.textContent = qty;
  });
}

function openCart() {
  document.getElementById("cartOverlay").classList.add("open");
  document.getElementById("cartDrawer").classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeCart() {
  document.getElementById("cartOverlay").classList.remove("open");
  document.getElementById("cartDrawer").classList.remove("open");
  document.body.style.overflow = "";
}

function generateOrderId() {
  const num = Math.floor(10000 + Math.random() * 90000);
  return `SWD-${num}`;
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function renderChatBubbles(messages, container) {
  container.innerHTML = messages
    .map((msg) => {
      const sender =
        msg.from === "restaurant"
          ? "🌿 Swadeshii"
          : msg.from === "customer"
            ? "You"
            : "";
      const senderHtml =
        msg.from !== "system" ? `<span class="chat-bubble-sender">${sender}</span>` : "";
      return `<div class="chat-bubble ${msg.from}">
        ${senderHtml}
        ${escapeHtml(msg.text)}
        <span class="chat-bubble-time">${formatTime(msg.at)}</span>
      </div>`;
    })
    .join("");
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function showChatFab(show = true) {
  const fab = document.getElementById("chatFab");
  fab.hidden = !show;
}

function openOrderChat() {
  document.getElementById("orderChat").classList.add("open");
  document.getElementById("chatFab").hidden = true;
}

function closeOrderChat() {
  document.getElementById("orderChat").classList.remove("open");
  if (activeOrderId) document.getElementById("chatFab").hidden = false;
}

async function checkWhatsAppStatus() {
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    const data = await res.json();
    document.getElementById("chatStatus").classList.toggle("connected", data.whatsapp);
    return data.whatsapp;
  } catch {
    document.getElementById("chatStatus").classList.remove("connected");
    return false;
  }
}

async function fetchMessages(orderId) {
  const res = await fetch(`${API_BASE}/api/orders/${orderId}/messages`);
  if (!res.ok) throw new Error("Failed to fetch messages");
  return res.json();
}

async function pollMessages() {
  if (!activeOrderId) return;

  try {
    const data = await fetchMessages(activeOrderId);
    const chatEl = document.getElementById("chatMessages");
    const modalChat = document.getElementById("modalChat");

    if (data.messages.length !== lastMessageCount) {
      renderChatBubbles(data.messages, chatEl);
      if (modalChat) renderChatBubbles(data.messages, modalChat);

      const newRestaurantMsgs = data.messages.filter((m) => m.from === "restaurant").length;
      if (newRestaurantMsgs > 0 && !document.getElementById("orderChat").classList.contains("open")) {
        document.getElementById("chatFabBadge").classList.add("visible");
      }

      lastMessageCount = data.messages.length;
    }
  } catch {
    /* server offline — keep polling */
  }
}

function startChatPolling() {
  stopChatPolling();
  pollMessages();
  chatPollTimer = setInterval(pollMessages, 2500);
}

function stopChatPolling() {
  if (chatPollTimer) {
    clearInterval(chatPollTimer);
    chatPollTimer = null;
  }
}

function activateOrderChat(orderId) {
  activeOrderId = orderId;
  localStorage.setItem("swadeshii-active-order", orderId);
  document.getElementById("chatOrderId").textContent = orderId;
  lastMessageCount = 0;
  showChatFab(true);
  startChatPolling();
  checkWhatsAppStatus();
}

function showSuccessModal(orderId, eta, messages = []) {
  document.getElementById("modalOrderId").textContent = orderId;
  document.getElementById("modalEta").textContent = eta;
  const modalChat = document.getElementById("modalChat");
  if (messages.length) renderChatBubbles(messages, modalChat);
  document.getElementById("successModal").classList.add("open");
  activateOrderChat(orderId);
}

function closeModal() {
  document.getElementById("successModal").classList.remove("open");
  openOrderChat();
}

function initMenuFilters() {
  const filters = document.getElementById("menuFilters");
  const items = document.querySelectorAll(".menu-item");

  filters.addEventListener("click", (e) => {
    const btn = e.target.closest(".filter-btn");
    if (!btn) return;

    filters.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    const filter = btn.dataset.filter;
    items.forEach((item) => {
      const match = filter === "all" || item.dataset.category === filter;
      item.classList.toggle("hidden", !match);
    });
  });
}

function initHeader() {
  const header = document.getElementById("header");
  window.addEventListener("scroll", () => {
    header.classList.toggle("scrolled", window.scrollY > 50);
  });

  const toggle = document.getElementById("menuToggle");
  const navLinks = document.getElementById("navLinks");

  toggle.addEventListener("click", () => {
    toggle.classList.toggle("open");
    navLinks.classList.toggle("open");
  });

  navLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      toggle.classList.remove("open");
      navLinks.classList.remove("open");
    });
  });
}

function initCart() {
  cart.forEach((item) => {
    itemQty[item.id] = item.qty;
  });

  document.getElementById("cartBtn").addEventListener("click", openCart);
  document.getElementById("cartClose").addEventListener("click", closeCart);
  document.getElementById("cartOverlay").addEventListener("click", closeCart);

  document.getElementById("cartItems").addEventListener("click", (e) => {
    const btn = e.target.closest(".qty-btn");
    if (!btn) return;
    const id = btn.dataset.id;
    const delta = btn.dataset.action === "plus" ? 1 : -1;
    updateQty(id, delta);
  });

  document.getElementById("checkoutBtn").addEventListener("click", () => {
    closeCart();
    document.getElementById("order").scrollIntoView({ behavior: "smooth" });
  });
}

function initMenuFooters() {
  const menuItems = document.querySelectorAll(".menu-item");
  menuItems.forEach((el, i) => {
    const item = MENU_ITEMS[i];
    if (!item) return;
    el.dataset.id = item.id;

    const body = el.querySelector(".menu-item-body");
    const footer = document.createElement("div");
    footer.className = "menu-item-footer";
    footer.innerHTML = `
      <div class="qty-control">
        <button class="qty-btn" data-action="minus" data-id="${item.id}" aria-label="Decrease quantity">−</button>
        <span class="qty-value">0</span>
        <button class="qty-btn" data-action="plus" data-id="${item.id}" aria-label="Increase quantity">+</button>
      </div>
      <button class="btn-add" data-id="${item.id}">Add to Cart</button>`;
    body.appendChild(footer);
  });
}

function initMenuActions() {
  document.getElementById("menuGrid").addEventListener("click", (e) => {
    const addBtn = e.target.closest(".btn-add");
    const qtyBtn = e.target.closest(".qty-btn");

    if (addBtn) {
      addToCart(addBtn.dataset.id);
      addBtn.classList.add("added");
      addBtn.textContent = "Added ✓";
      setTimeout(() => {
        addBtn.classList.remove("added");
        addBtn.textContent = "Add to Cart";
      }, 1500);
      return;
    }

    if (qtyBtn) {
      const id = qtyBtn.dataset.id;
      const delta = qtyBtn.dataset.action === "plus" ? 1 : -1;
      updateQty(id, delta);
    }
  });
}

function initOrderForm() {
  const form = document.getElementById("orderForm");
  const submitBtn = form.querySelector('button[type="submit"]');

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (cart.length === 0) {
      showToast("Please add items to your cart first!");
      document.getElementById("menu").scrollIntoView({ behavior: "smooth" });
      return;
    }

    const formData = new FormData(form);
    const name = formData.get("name");
    const phone = formData.get("phone");
    const address = formData.get("address");
    const notes = formData.get("notes") || "";

    const orderId = generateOrderId();
    const now = new Date();
    const eta = new Date(now.getTime() + 30 * 60000);
    const etaStr = eta.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

    const order = {
      id: orderId,
      customer: { name, phone, address, notes },
      items: [...cart],
      total: getCartTotal(),
      placedAt: now.toISOString(),
      eta: eta.toISOString(),
    };

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending to WhatsApp...";

    try {
      const res = await fetch(`${API_BASE}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: orderId,
          customer: order.customer,
          items: order.items,
          total: order.total,
        }),
      });

      if (!res.ok) throw new Error("Server error");

      const data = await res.json();

      if (!data.whatsapp?.connected) {
        showToast("⚠️ Start the server & scan WhatsApp QR first!");
      } else if (data.whatsapp?.owner) {
        showToast("📱 Order sent to your WhatsApp!");
      }

      cart = [];
      Object.keys(itemQty).forEach((k) => (itemQty[k] = 0));
      saveCart();
      updateCartUI();
      updateMenuQtyDisplays();
      form.reset();

      showSuccessModal(orderId, etaStr, data.order?.messages || []);
    } catch {
      const waText = buildWhatsAppFallback(order);
      window.open(
        `https://wa.me/${RESTAURANT_WHATSAPP}?text=${encodeURIComponent(waText)}`,
        "_blank"
      );

      cart = [];
      Object.keys(itemQty).forEach((k) => (itemQty[k] = 0));
      saveCart();
      updateCartUI();
      updateMenuQtyDisplays();
      form.reset();

      showToast("Server offline — opened WhatsApp instead");
      showSuccessModal(orderId, etaStr, [
        {
          from: "system",
          text: "Order opened in WhatsApp. Start the server for live chat sync.",
          at: new Date().toISOString(),
        },
      ]);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Place Order — Delivered in 30 Min ⚡";
    }
  });
}

function buildWhatsAppFallback(order) {
  const lines = [
    `🍛 NEW ORDER — ${order.id}`,
    ``,
    `👤 ${order.customer.name}`,
    `📞 ${order.customer.phone}`,
    `📍 ${order.customer.address}`,
  ];
  if (order.customer.notes) lines.push(`📝 ${order.customer.notes}`);
  lines.push(``);
  order.items.forEach((i) => lines.push(`• ${i.name} × ${i.qty} — ₹${i.price * i.qty}`));
  lines.push(``, `💰 Total: ₹${order.total}`, ``, `💳 UPI: ${UPI_ID}`);
  return lines.join("\n");
}

function updatePaymentUI() {
  const total = getCartTotal();
  const upiLink = document.getElementById("upiPayLink");
  const upiAmount = document.getElementById("upiAmount");

  if (upiAmount) {
    upiAmount.textContent = total > 0 ? formatPrice(total) : "—";
  }

  if (upiLink) {
    if (total > 0) {
      const params = new URLSearchParams({
        pa: UPI_ID,
        pn: "Swadeshii",
        am: String(total),
        cu: "INR",
      });
      upiLink.href = `upi://pay?${params.toString()}`;
      upiLink.classList.remove("disabled");
    } else {
      upiLink.href = "#";
      upiLink.classList.add("disabled");
    }
  }
}

function initPayment() {
  document.getElementById("upiDisplay").textContent = UPI_ID;

  document.getElementById("copyUpi").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(UPI_ID);
      showToast("UPI ID copied!");
    } catch {
      showToast(UPI_ID);
    }
  });

  updatePaymentUI();
}

function initChat() {
  document.getElementById("chatFab").addEventListener("click", () => {
    document.getElementById("chatFabBadge").classList.remove("visible");
    openOrderChat();
  });

  document.getElementById("chatClose").addEventListener("click", closeOrderChat);

  document.getElementById("chatForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("chatInput");
    const text = input.value.trim();
    if (!text || !activeOrderId) return;

    input.value = "";
    input.disabled = true;

    try {
      const res = await fetch(`${API_BASE}/api/orders/${activeOrderId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (res.ok) {
        await pollMessages();
      } else {
        showToast("Could not send message");
      }
    } catch {
      showToast("Server offline — message not sent");
    } finally {
      input.disabled = false;
      input.focus();
    }
  });

  if (activeOrderId) {
    activateOrderChat(activeOrderId);
  }
}

function initModal() {
  document.getElementById("modalClose").addEventListener("click", closeModal);
  document.getElementById("successModal").addEventListener("click", (e) => {
    if (e.target.id === "successModal") closeModal();
  });
}

function initScrollReveal() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.style.opacity = "1";
          entry.target.style.transform = "translateY(0)";
        }
      });
    },
    { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
  );

  document.querySelectorAll(".menu-item, .about-card, .testimonial").forEach((el) => {
    el.style.opacity = "0";
    el.style.transform = "translateY(20px)";
    el.style.transition = "opacity 0.6s ease, transform 0.6s ease";
    observer.observe(el);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initHeader();
  initMenuFooters();
  initMenuFilters();
  initCart();
  initMenuActions();
  initOrderForm();
  initModal();
  initChat();
  initPayment();
  initScrollReveal();
  updateCartUI();
  updateMenuQtyDisplays();
});
