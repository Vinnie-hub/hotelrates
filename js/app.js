(function () {
  "use strict";
  /* HotelRate reviewer dashboard. Frontend-only: everything lives in LocalStorage. */
  const KEY = "hotelrate.dashboard.v1", LIMIT = 3, WD_MS = 120000, REVIEW_MS = 300000, MIN_REFERRALS = 3;
  const WD_WARNING = "To qualify for withdrawals, you must have at least 3 successful referrals.";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const r2 = (n) => Math.round(n * 100) / 100;
  const COUNTRIES = {
    KE: { name: "Kenya", flag: "🇰🇪", cur: "KES", dec: 2, tz: "Africa/Nairobi", tzLabel: "Nairobi", cc: "254", re: "[71]\\d{8}", ph: "0712 345 678", min: 500, methods: ["M-Pesa", "Airtel Money"] },
    UG: { name: "Uganda", flag: "🇺🇬", cur: "UGX", dec: 0, tz: "Africa/Kampala", tzLabel: "Kampala", cc: "256", re: "7\\d{8}", ph: "0772 123 456", min: 17000, methods: ["MTN Mobile Money", "Airtel Money"] },
    NG: { name: "Nigeria", flag: "🇳🇬", cur: "NGN", dec: 2, tz: "Africa/Lagos", tzLabel: "Lagos", cc: "234", re: "[789]\\d{9}", ph: "0803 123 4567", min: 6000, methods: ["OPay", "PalmPay"] },
    GH: { name: "Ghana", flag: "🇬🇭", cur: "GHS", dec: 2, tz: "Africa/Accra", tzLabel: "Accra", cc: "233", re: "[25]\\d{8}", ph: "024 123 4567", min: 45, methods: ["MTN MoMo", "Telecel Cash", "AirtelTigo Money"] },
    TZ: { name: "Tanzania", flag: "🇹🇿", cur: "TZS", dec: 0, tz: "Africa/Dar_es_Salaam", tzLabel: "Dar es Salaam", cc: "255", re: "[67]\\d{8}", ph: "0754 123 456", min: 10500, methods: ["M-Pesa", "Tigo Pesa", "Airtel Money"] },
    CM: { name: "Cameroon", flag: "🇨🇲", cur: "XAF", dec: 0, tz: "Africa/Douala", tzLabel: "Douala", cc: "237", re: "6\\d{8}", ph: "671 234 567", min: 2100, methods: ["MTN MoMo", "Orange Money"] },
    ZM: { name: "Zambia", flag: "🇿🇲", cur: "ZMW", dec: 2, tz: "Africa/Lusaka", tzLabel: "Lusaka", cc: "260", re: "[79]\\d{8}", ph: "0971 234 567", min: 85, methods: ["MTN MoMo", "Airtel Money", "Zamtel Kwacha"] },
    RW: { name: "Rwanda", flag: "🇷🇼", cur: "RWF", dec: 0, tz: "Africa/Kigali", tzLabel: "Kigali", cc: "250", re: "7[2389]\\d{7}", ph: "0788 123 456", min: 5600, methods: ["MTN MoMo", "Airtel Money"] },
    MW: { name: "Malawi", flag: "🇲🇼", cur: "MWK", dec: 0, tz: "Africa/Blantyre", tzLabel: "Blantyre", cc: "265", re: "[89]\\d{8}", ph: "0991 234 567", min: 7000, methods: ["Airtel Money", "TNM Mpamba"] },
  };
  const DEFAULT_RATES = { KES: 130, UGX: 4300, NGN: 1500, GHS: 11.2, TZS: 2640, MWK: 1750, XAF: 560, ZMW: 23, RWF: 1450 }; /* indicative; editable in Settings */
  let CC = "KE", tzName = "Africa/Nairobi";
  const C = () => COUNTRIES[CC], cur = () => C().cur, tz = () => tzName;
  const applyCountry = (k) => { CC = COUNTRIES[k] ? k : "KE"; tzName = C().tz; };
  const today = () => new Date().toLocaleDateString("en-CA", { timeZone: tz() });
  const dayOf = (iso) => new Date(iso).toLocaleDateString("en-CA", { timeZone: tz() });
  const fmtDate = (iso) => new Date(iso).toLocaleString("en-KE", { timeZone: tz(), day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const money = (n) => { const d = C().dec; n = Number(n); return cur() + " " + n.toLocaleString("en-KE", { minimumFractionDigits: Number.isInteger(n) ? 0 : d, maximumFractionDigits: d }); };
  const rnd = (n) => { const f = 10 ** C().dec; return Math.round(n * f) / f; };
  const usd = (n) => "$" + Number(n).toFixed(2);
  const num = (n) => Number(n).toLocaleString("en-KE");
  const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const ref = (p) => p + Date.now().toString(36).toUpperCase().slice(-5) + Array.from({ length: 4 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[rand(0, 31)]).join("");

  /* ---------- Hotels: your data.js plus a derived category ---------- */
  const CATS = [["Resort", "Resort"], ["Villas", "Villa retreat"], ["Villa", "Villa retreat"], ["Lodge", "Lodge"], ["Retreat", "Retreat"], ["Inn", "Boutique inn"], ["Palace", "Luxury palace"], ["Suites", "Suites"], ["Haus", "Lodge"], ["Haven", "Retreat"]];
  const H = HOTELS.map((h, i) => ({ ...h, id: i, cat: (CATS.find((c) => h.name.includes(c[0])) || [0, "City hotel"])[1], cents: Math.round(h.pay * 100) }));
  const rate = () => S.rates[cur()];
  const hotelLocal = (h) => rnd((h.cents * rate()) / 100);

  /* ---------- State ---------- */
  const defaults = () => ({ profile: { name: "", email: "", phone: "", country: "" }, rates: { ...DEFAULT_RATES }, minWd: 500, hotels: {}, reviews: [], drafts: {}, tx: [], referrals: 0, daily: { day: today(), count: 0 } });
  function load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { s = null; }
    const d = defaults();
    const stored = !!(s && typeof s === "object"), legacy = stored && !(s.profile && "country" in s.profile);
    s = Object.assign(d, stored ? s : {});
    s.profile = Object.assign(defaults().profile, s.profile);
    s.rates = Object.assign({}, DEFAULT_RATES, s.rates || {});
    if (typeof s.rate === "number") { s.rates.KES = s.rate; delete s.rate; }
    if (legacy) s.profile.country = "KE";
    s.reviews.forEach((r) => { if (!r.status) { r.status = "Verified"; r.day = dayOf(r.date); } r.reasons = r.reasons || []; });
    s.tx.forEach((t) => { /* normalise statuses from earlier versions */
      if (t.type === "reward" && t.status === "Completed") t.status = "Credited";
      if (t.type === "withdrawal") { if (t.status === "Completed") t.status = "Paid"; if (!t.due) t.due = new Date(t.date).getTime() + WD_MS; }
    });
    H.forEach((h) => { /* simulated stats: created once, then kept */
      const o = s.hotels[h.name];
      if (!o || !o.reviews) s.hotels[h.name] = { reviews: rand(100, 10000), rating: Math.round((3.6 + Math.random() * 1.3) * 10) / 10 };
    });
    return s;
  }
  let S = load();
  applyCountry(S.profile.country);
  let toastOk = true;
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { if (toastOk) { toastOk = false; toast("Browser storage is unavailable, so progress will not persist.", "bad"); } } }
  function daily() { if (S.daily.day !== today()) { S.daily = { day: today(), count: 0 }; save(); } return new Set(S.reviews.filter((r) => r.day === today()).map((r) => r.hotel)).size; }
  /* A hotel already counted today (e.g. a rejected review) can still be edited and resubmitted without using another slot */
  const canSubmit = (name) => daily() < LIMIT || S.reviews.some((r) => r.hotel === name && r.day === today());
  const verified = () => S.reviews.filter((r) => r.status === "Verified").length;
  /* Withdrawals are locked until the user has MIN_REFERRALS successful referrals */
  const refCount = () => Math.max(0, Math.floor(Number(S.referrals) || 0));
  const canWithdraw = () => refCount() >= MIN_REFERRALS;
  let refNoteOff = false; /* closed with the X for this visit; returns on reload */
  const refNote = () => canWithdraw() || refNoteOff ? "" : `<div class="alert info refnote" role="note"><span>Invite 3 people using your referral link to unlock withdrawals.</span><button type="button" class="xbtn" data-a="closeref" aria-label="Close note">&times;</button></div>`;
  function wallet() {
    let earned = 0, pw = 0, withdrawn = 0;
    S.tx.forEach((t) => {
      if (t.type === "reward") earned += t.amount;
      else if (t.status === "Pending") pw += t.amount;
      else if (t.status === "Paid") withdrawn += t.amount;
    });
    const pending = S.reviews.filter((r) => r.status === "Verifying").reduce((a, r) => a + r.kes, 0);
    return { earned: r2(earned), pending: r2(pending), withdrawn: r2(withdrawn), avail: r2(earned - pw - withdrawn) };
  }

  const phoneFor = (p, k = CC) => { const c = COUNTRIES[k], m = String(p).replace(/[\s()-]/g, "").match(new RegExp("^(?:\\+?" + c.cc + "|0)?(" + c.re + ")$")); return m ? c.cc + m[1] : null; };
  function switchCountry(key, rates) { /* converts the whole wallet to the new currency, keeping its USD value */
    const nc = COUNTRIES[key], f = rates[nc.cur] / rates[cur()], p = 10 ** nc.dec, cv = (x) => Math.round(x * f * p) / p;
    S.tx.forEach((t) => { t.amount = cv(t.amount); if (t.type === "reward") t.rate = rates[nc.cur]; });
    S.reviews.forEach((r) => { r.kes = cv(r.kes); r.rate = rates[nc.cur]; });
    S.rates = rates; S.minWd = nc.min; S.profile.country = key; applyCountry(key);
    if (S.profile.phone && !phoneFor(S.profile.phone)) S.profile.phone = "";
  }
  function onboard() {
    const d = $("#dlg");
    d.oncancel = (e) => e.preventDefault();
    d.onclick = (e) => {
      const b = e.target.closest("[data-c]"); if (!b) return;
      S.profile.country = b.dataset.c; applyCountry(b.dataset.c); S.minWd = C().min; save();
      d.onclick = null; d.oncancel = null; d.close(); render(); toast(`Welcome! Your wallet is in ${cur()} (${C().name}).`, "ok");
    };
    d.innerHTML = `<h3>Welcome to HotelRate</h3><p>Choose your country. Rewards are paid in US dollars and your wallet is shown in your local currency.</p><div class="cgrid">${Object.entries(COUNTRIES).map(([k, c]) => `<button type="button" class="copt" data-c="${k}"><span class="fl" aria-hidden="true">${c.flag}</span><b>${c.name}</b><small>${c.cur} · $1 = ${num(S.rates[c.cur])}</small></button>`).join("")}</div>`;
    d.showModal();
  }

  /* ---------- Review moderation (runs when a review's verification period ends) ---------- */
  const norm = (t) => t.toLowerCase().replace(/[^a-z0-9'\s]/g, " ").replace(/\s+/g, " ").trim();
  const toks = (t) => norm(t).split(" ").filter(Boolean);
  const shingles = (w, n) => { const o = new Set(); for (let i = 0; i + n <= w.length; i++) o.add(w.slice(i, i + n).join(" ")); return o; };
  const KW = ["room", "stay", "staff", "servic", "clean", "locat", "breakfast", "pool", "food", "meal", "bed", "bath", "shower", "view", "facilit", "check", "price", "value", "comfort", "hotel", "resort", "lodge", "guest", "restaurant", "spa", "reception", "amenit", "lobby", "garden", "beach", "suite", "dinner", "lunch", "wifi", "parking", "balcony", "terrace", "housekeeping", "coffee", "quiet", "noise", "secur", "night", "airport", "transport", "decor", "hospitalit", "friendly", "welcom", "booking", "reserv", "kitchen", "gym", "ocean", "family", "business", "cost"];
  const BAD = /\b(fuck\w*|shit\w*|bullshit|bitch\w*|bastard\w*|asshole\w*|cunt\w*|slut\w*|whore\w*|dickhead\w*|piss\w*|damn\w*|idiot\w*|moron\w*|stupid|retard\w*|scum|crap\w*|malaya|mpumbavu|mjinga|kuma|kumbafu)\b/i;
  function judge(r) {
    const why = [], text = r.text, nt = norm(text), w = toks(text), n = w.length;
    const prev = S.reviews.filter((x) => x !== r && x.date < r.date);
    const exact = prev.some((x) => norm(x.text) === nt);
    if (n < 200) why.push(`The review has ${n} words. At least 200 words are required.`);
    if (exact) why.push("This is an exact duplicate of a review you submitted earlier.");
    if (prev.some((x) => x.hotel === r.hotel && x.status !== "Rejected")) why.push("A review for this hotel was already submitted.");
    if (KW.filter((k) => new RegExp("\\b" + k).test(nt)).length < 6) why.push("The review does not contain enough meaningful content about the hotel (rooms, service, facilities, location, value).");
    const sents = text.split(/[.!?\n]+/).map(norm).filter((x) => x.split(" ").length >= 4);
    const paras = text.split(/\n{2,}/).map(norm).filter((x) => x.split(" ").length >= 8);
    let rep = new Set(sents).size < sents.length || new Set(paras).size < paras.length;
    if (!rep) { const seen = new Set(); for (let i = 0; i + 8 <= w.length; i++) { const g = w.slice(i, i + 8).join(" "); if (seen.has(g)) { rep = true; break; } seen.add(g); } }
    if (rep) why.push("The review repeats the same sentences or paragraphs.");
    const lw = w.filter((x) => x.length >= 4), noVowel = lw.filter((x) => !/[aeiouy]/.test(x)).length;
    const junk = n >= 20 && (new Set(w).size / n < 0.38 || noVowel / Math.max(lw.length, 1) > 0.15 || /(.)\1{4,}/.test(nt) || /lorem ipsum/.test(nt));
    const desc = shingles(toks(H.find((h) => h.name === r.hotel).desc), 5), mine = shingles(w, 5);
    let hit = 0; desc.forEach((g) => { if (mine.has(g)) hit++; });
    const ws = new Set(w);
    const similar = prev.some((x) => { if (norm(x.text) === nt) return false; const o = new Set(toks(x.text)); let c = 0; ws.forEach((a) => { if (o.has(a)) c++; }); return o.size && c / (ws.size + o.size - c) >= 0.9; });
    if (junk) why.push("The review contains meaningless text.");
    if ((desc.size && hit / desc.size >= 0.5) || similar) why.push("The review contains copied content.");
    const hn = norm(r.hotel).replace(/^the /, "");
    if (!(" " + norm(r.title + " " + text) + " ").includes(" " + hn + " ")) why.push(`The review does not mention ${r.hotel}.`);
    if (BAD.test(r.title + " " + text)) why.push("The review contains offensive language.");
    return why;
  }

  /* ---------- UI helpers ---------- */
  const ICON = { overview: "M3 12l9-9 9 9M5 10v10h14V10", hotels: "M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M8 8h3M8 12h3M8 16h3", reviews: "M21 12a8 8 0 0 1-11.5 7.2L4 20l1.1-4.4A8 8 0 1 1 21 12z", wallet: "M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l2-3h12M16 14h2", withdrawals: "M12 19V7m0 0l-4 4m4-4l4 4M5 4h14", transactions: "M4 6h16M4 12h16M4 18h10", settings: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0", more: "M4 7h16M4 12h16M4 17h16" };
  const ico = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[k]}"/></svg>`;
  const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.9L12 17.8 5.8 21l1.2-6.9-5-4.9 6.9-1z"/></svg>';
  const stars = (n) => `<span class="stars" role="img" aria-label="${n} out of 5 stars">${[1, 2, 3, 4, 5].map((i) => `<span class="${i <= Math.round(n) ? "star-on" : "star-off"}">${STAR}</span>`).join("")}</span>`;
  const NAV = [["overview", "Overview"], ["hotels", "Available Hotels"], ["reviews", "My Reviews"], ["wallet", "Earnings & Wallet"], ["withdrawals", "Withdrawals"], ["transactions", "Transaction History"], ["settings", "Profile & Settings"]];
  const BNAV = ["overview", "hotels", "reviews", "wallet"];

  function toast(msg, kind) {
    const t = document.createElement("div");
    t.className = "toast " + (kind || "");
    t.textContent = msg;
    $("#toasts").appendChild(t);
    setTimeout(() => t.remove(), 4500);
  }
  function confirmDlg({ title, body, ok = "Confirm", danger = false }) {
    return new Promise((res) => {
      const d = $("#dlg");
      d.innerHTML = `<h3>${esc(title)}</h3><p>${body}</p><div class="dact"><button class="btn sec" value="no">Cancel</button><button class="btn ${danger ? "danger" : ""}" value="yes">${esc(ok)}</button></div>`;
      d.onclick = (e) => {
        const v = e.target.closest("button");
        if (v) { d.close(); res(v.value === "yes"); } else if (e.target === d) { d.close(); res(false); }
      };
      d.oncancel = () => res(false);
      d.showModal();
    });
  }
  function alertDlg({ title, body, ok = "OK", alt = null }) {
    return new Promise((res) => {
      const d = $("#dlg");
      d.innerHTML = `<div class="proc warnbox" role="alertdialog" aria-live="assertive"><div class="warnic" aria-hidden="true">!</div><h3>${esc(title)}</h3><p>${body}</p><div class="dact">${alt ? `<button class="btn" value="alt">${esc(alt)}</button>` : ""}<button class="btn ${alt ? "sec" : "block"}" value="ok">${esc(ok)}</button></div></div>`;
      const done = (v) => { d.onclick = null; d.oncancel = null; d.close(); res(v); };
      d.onclick = (e) => { const b = e.target.closest("button"); if (b) done(b.value); };
      d.oncancel = (e) => { e.preventDefault(); done("ok"); };
      if (!d.open) d.showModal();
    });
  }
  const maskPhone = (p) => "+" + p.slice(0, 5) + "****" + p.slice(-3);

  /* ---------- Views ---------- */
  const statCard = (label, val, sub, cls = "") => `<div class="card stat ${cls}"><small>${label}</small><b>${val}</b><span>${sub}</span></div>`;

  function chart() {
    const keys = [], base = new Date(today() + "T12:00:00Z");
    for (let i = 6; i >= 0; i--) keys.push(new Date(base - i * 864e5).toISOString().slice(0, 10));
    const sums = keys.map((k) => r2(S.tx.filter((t) => t.type === "reward" && dayOf(t.date) === k).reduce((a, t) => a + t.amount, 0)));
    const max = Math.max(...sums, 1);
    const bars = sums.map((v, i) => { const h = Math.max(3, (v / max) * 110), x = 14 + i * 58; return `<rect class="${v ? "" : "z"}" x="${x}" y="${130 - h}" width="38" height="${h}" rx="5"><title>${money(v)}</title></rect><text x="${x + 19}" y="148" text-anchor="middle">${new Date(keys[i] + "T12:00:00Z").toLocaleDateString("en-KE", { weekday: "short", timeZone: "UTC" })}</text>${v ? `<text x="${x + 19}" y="${124 - h}" text-anchor="middle">${num(Math.round(v))}</text>` : ""}`; }).join("");
    return `<svg class="chart" viewBox="0 0 420 156" width="100%" role="img" aria-label="Earnings in ${cur()} over the last 7 days">${bars}</svg>`;
  }
  const txRow = (t) => `<div class="li"><div><b>${esc(t.desc)}</b><small>${fmtDate(t.date)} · ${esc(t.ref)}</small></div><div style="text-align:right"><span class="${t.type === "reward" ? "pos" : "neg"}">${t.type === "reward" ? "+" : "−"}${money(t.amount)}</span><br><span class="st ${t.status}">${t.status}</span></div></div>`;
  const reviewRow = (r) => `<div class="li"><div><b>${esc(r.hotel)}</b><small>${esc(r.title)} · ${fmtDate(r.date)}</small></div><div style="text-align:right">${stars(r.ratings.overall)}<br>${r.status === "Verified" ? `<span class="pos">+${money(r.kes)}</span>` : `<span class="st ${r.status}">${r.status}</span>`}</div></div>`;

  function vOverview() {
    const w = wallet(), n = daily(), name = S.profile.name.trim();
    const stamps = Array.from({ length: LIMIT }, (_, i) => `<span class="stamp ${i < n ? "on" : ""}">${i < n ? '<svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>' : ""}</span>`).join("");
    return `<div class="sec-h"><div><h2>${name ? "Welcome back, " + esc(name.split(" ")[0]) : "Welcome to HotelRate"}</h2></div></div>
    <div class="grid g4">
      ${statCard("Available balance", money(w.avail), "Ready to withdraw", "hero")}
      ${statCard("Total earnings", money(w.earned), "All review rewards")}
      ${statCard("Pending earnings", money(w.pending), "Rewards under verification")}
      ${statCard("Total withdrawn", money(w.withdrawn), "Paid out successfully")}
    </div>
    <div class="grid g2" style="margin-top:16px">
      <div class="card"><header><h3>Today's review progress</h3><span class="pill">${n}/${LIMIT}</span></header>
        <div class="stamps" aria-hidden="true">${stamps}</div>
        <p class="hint">${n >= LIMIT ? `Daily limit reached. New reviews open at midnight (${C().tzLabel} time).` : `${LIMIT - n} review${LIMIT - n === 1 ? "" : "s"} left today.`}</p>
        <p style="margin-top:12px"><a class="btn sm" href="#hotels" ${n >= LIMIT ? 'aria-disabled="true"' : ""}>Review a hotel</a></p></div>
      <div class="card"><header><h3>Earnings, last 7 days (${cur()})</h3></header>${chart()}</div>
    </div>
    <div class="grid g2" style="margin-top:16px">
      <div class="card"><header><h3>Recent reviews</h3><a href="#reviews" class="hint">View all</a></header>${S.reviews.length ? `<div class="list">${S.reviews.slice(0, 4).map(reviewRow).join("")}</div>` : `<div class="empty"><b>No reviews yet</b>Pick a hotel to write your first review.</div>`}</div>
      <div class="card"><header><h3>Recent transactions</h3><a href="#transactions" class="hint">View all</a></header>${S.tx.length ? `<div class="list">${S.tx.slice(0, 4).map(txRow).join("")}</div>` : `<div class="empty"><b>No transactions yet</b>Rewards and withdrawals will appear here.</div>`}</div>
    </div>`;
  }

  const F = { q: "", sort: "reward", cat: "all" };
  function hotelCard(h) {
    const st = S.hotels[h.name], mine = S.reviews.find((r) => r.hotel === h.name), cap = !canSubmit(h.name);
    const btn = mine && mine.status === "Verified" ? `<span class="btn block" aria-disabled="true">Reviewed</span>` : mine && mine.status === "Verifying" ? `<span class="btn block" aria-disabled="true">Under verification</span>` : cap ? `<span class="btn block" aria-disabled="true">Daily limit reached</span>` : `<a class="btn block" href="#review/${h.id}">${mine ? "Write again" : S.drafts[h.name] ? "Continue draft" : "Review hotel"}</a>`;
    return `<article class="card hcard"><div class="media"><img src="${h.img}" alt="${esc(h.name)}, ${esc(h.city)}" loading="lazy" width="800" height="533"><span class="chip">${h.flag} ${esc(h.city)}</span><span class="chip r">${usd(h.pay)}</span></div>
    <div class="hbody"><div class="meta"><span class="tag">${esc(h.cat)}</span><span title="Average rating">${stars(st.rating)} ${st.rating.toFixed(1)}</span></div>
    <h3>${esc(h.name)}</h3><p class="desc">${esc(h.desc)}</p>
    <div class="meta"><span>${num(st.reviews)} previous reviews</span></div>
    <div class="reward"><b>${usd(h.pay)}</b><span>≈ ${money(hotelLocal(h))}</span></div>${btn}</div></article>`;
  }
  function hotelList() {
    const q = F.q.trim().toLowerCase();
    let l = H.filter((h) => (F.cat === "all" || h.cat === F.cat) && (!q || (h.name + " " + h.city + " " + h.desc).toLowerCase().includes(q)));
    const s = { reward: (a, b) => b.cents - a.cents, low: (a, b) => a.cents - b.cents, reviews: (a, b) => S.hotels[b.name].reviews - S.hotels[a.name].reviews, rating: (a, b) => S.hotels[b.name].rating - S.hotels[a.name].rating, name: (a, b) => a.name.localeCompare(b.name) }[F.sort];
    l = l.slice().sort(s);
    return l.length ? l.map(hotelCard).join("") : `<div class="card empty" style="grid-column:1/-1"><b>No hotels match</b>Try a different search or category.</div>`;
  }
  function vHotels() {
    const cats = [...new Set(H.map((h) => h.cat))].sort();
    const opt = (v, t, cur) => `<option value="${v}" ${v === cur ? "selected" : ""}>${t}</option>`;
    return `<div class="toolbar"><input id="hq" type="search" placeholder="Search hotels, cities or descriptions" aria-label="Search hotels" value="${esc(F.q)}">
      <select id="hcat" aria-label="Category">${opt("all", "All categories", F.cat)}${cats.map((c) => opt(c, c, F.cat)).join("")}</select>
      <select id="hsort" aria-label="Sort hotels">${opt("reward", "Highest reward", F.sort)}${opt("low", "Lowest reward", F.sort)}${opt("reviews", "Most reviews", F.sort)}${opt("rating", "Top rated", F.sort)}${opt("name", "Name A–Z", F.sort)}</select></div>
    <div class="alert info">You have used ${daily()} of ${LIMIT} reviews today.</div>
    <div class="grid g3" id="hgrid">${hotelList()}</div>
`;
  }

  /* Review workspace */
  const CRIT = [["overall", "Overall experience"], ["cleanliness", "Cleanliness"], ["service", "Customer service"], ["facilities", "Facilities"], ["value", "Value for money"]];
  let D = null; /* current in-progress draft */
  function vReview(id) {
    const h = H[id];
    if (!h) return `<div class="card empty"><b>Hotel not found</b><a href="#hotels">Back to hotels</a></div>`;
    const mine = S.reviews.find((r) => r.hotel === h.name);
    if (mine && mine.status !== "Rejected") return `<div class="card empty"><b>${mine.status === "Verified" ? "You already reviewed " + esc(h.name) : "Your review of " + esc(h.name) + " is being verified"}</b>Each hotel can be reviewed once.<p style="margin-top:12px"><a class="btn" href="#reviews">See my reviews</a></p></div>`;
    if (!D || D.id !== id) D = { id, ...(S.drafts[h.name] || (mine ? { ratings: { ...mine.ratings }, title: mine.title, text: mine.text } : { ratings: {}, title: "", text: "" })) };
    const rows = CRIT.map(([k, t]) => `<div class="rate-row"><span id="l-${k}">${t}</span><div class="rstars" role="radiogroup" aria-labelledby="l-${k}">${[1, 2, 3, 4, 5].map((v) => `<button type="button" role="radio" data-a="star" data-k="${k}" data-v="${v}" aria-checked="${D.ratings[k] === v}" aria-label="${v} star${v > 1 ? "s" : ""}" class="${v <= (D.ratings[k] || 0) ? "on" : ""}">${STAR}</button>`).join("")}</div></div>`).join("");
    const capped = !canSubmit(h.name);
    return `<p style="margin:0 0 6px"><a href="#hotels" class="hint" style="display:inline-block;padding:8px 0">← Back to hotels</a></p>
    <div class="rwrap"><form class="card" id="rf" novalidate>
      ${capped ? `<div class="alert warn">You've reached today's limit of ${LIMIT} reviews. You can save a draft and submit tomorrow.</div>` : ""}
      ${mine ? `<div class="alert bad"><b>Your previous review was rejected.</b><ul class="tips" style="margin-top:6px">${mine.reasons.map((x) => `<li>${esc(x)}</li>`).join("")}</ul><p style="margin-top:6px">Edit it below and submit again.</p></div>` : ""}
      <h2 style="margin-bottom:6px">Write your review</h2><p class="hint" style="margin-bottom:12px">Rate each area, then explain your rating in your own words.</p>
      ${rows}
      <div class="f" style="margin-top:16px"><label for="rt">Review title</label><input id="rt" maxlength="80" placeholder="Summarise your review in a few words" value="${esc(D.title)}"><div class="count"><span></span><span id="tc">${D.title.length}/80</span></div></div>
      <div class="f"><label for="rx">Your review</label><textarea id="rx" maxlength="4000" placeholder="Mention ${esc(h.name)} by name and describe your stay: rooms, service, food, facilities, location and value for money.">${esc(D.text)}</textarea><div class="count"><span id="wc"></span><span id="cc"></span></div></div>
      <label style="display:flex;gap:10px;font-weight:500"><input type="checkbox" id="rc" style="width:auto;margin-top:4px">I confirm this review is my own and honestly reflects my experience or impressions.</label>
      <div id="rerr" class="err" role="alert"></div>
      <div class="abar"><button type="button" class="btn sec" data-a="draft">Save draft</button><button type="submit" class="btn" ${capped ? "disabled" : ""}>Submit review</button></div></form>
      <aside class="grid"><div class="card hcard hc" style="padding:0"><div class="media"><img src="${h.img}" alt="${esc(h.name)}"></div><div class="hbody"><span class="tag" style="align-self:start">${esc(h.cat)}</span><h3>${esc(h.name)}</h3><p class="hint">${h.flag} ${esc(h.city)}</p><p class="desc">${esc(h.desc)}</p><div class="reward"><b>${usd(h.pay)}</b><span>≈ ${money(hotelLocal(h))} credited once verified</span></div></div></div>
      <div class="card gl"><h3 style="margin-bottom:8px">Writing guidelines</h3><ul class="tips"><li>Write at least 200 words.</li><li>Mention the hotel by name and write about the stay: rooms, service, food, facilities, location and value.</li><li>Use your own words. Don't copy the hotel description or a previous review, and don't repeat sentences or paragraphs.</li><li>Be honest and respectful. Offensive language is not accepted.</li><li>Each hotel can be reviewed once. Reviews are verified after submission, and only verified reviews earn a reward.</li></ul></div></aside></div>`;
  }
  const words = (t) => (t.trim().match(/\S+/g) || []).length;
  function counters() {
    const t = $("#rx").value, n = words(t); $("#wc").textContent = n + " / 200 words minimum"; $("#wc").className = n < 200 ? "warnc" : "okc"; $("#cc").textContent = t.length + "/4000";
    $("#tc").textContent = $("#rt").value.length + "/80";
  }
  function readDraft() { D.title = $("#rt").value; D.text = $("#rx").value; }
  function saveDraft(quiet) {
    readDraft(); const h = H[D.id];
    S.drafts[h.name] = { ratings: D.ratings, title: D.title, text: D.text }; save();
    if (!quiet) toast("Draft saved. You can finish it later.", "ok");
  }
  function submitReview() {
    readDraft(); const h = H[D.id], errs = [];
    if (!canSubmit(h.name)) errs.push(`You've used all ${LIMIT} reviews for today. Come back after midnight (${C().tzLabel} time).`);
    if (S.reviews.some((r) => r.hotel === h.name && r.status !== "Rejected")) errs.push("You have already submitted a review for this hotel.");
    if (CRIT.some(([k]) => !D.ratings[k])) errs.push("Give a star rating for every category.");
    if (D.title.trim().length < 5) errs.push("Add a review title of at least 5 characters.");
    if (D.text.trim().length < 20) errs.push("Write your review before submitting.");
    if (D.text.length > 4000) errs.push("Keep your review under 4,000 characters.");
    if (!$("#rc").checked) errs.push("Confirm that the review is your own and honest.");
    $("#rerr").innerHTML = errs.map((e) => "• " + esc(e)).join("<br>");
    if (errs.length) return toast(errs[0], "bad");
    return processReview(h);
  }
  let busy = false;
  async function processReview(h) {
    if (busy) return; busy = true;
    const d = $("#dlg"), now = new Date().toISOString(), btn = $("#rf button[type=submit]");
    if (btn) btn.disabled = true;
    d.onclick = null; d.oncancel = (ev) => ev.preventDefault();
    d.innerHTML = `<div class="proc" role="status"><div class="spin" aria-hidden="true"></div><h3>Submitting your review…</h3><p>Please wait.</p><div class="bar"><i></i></div></div>`;
    d.showModal();
    await sleep(1800);
    S.reviews.unshift({ id: ref("RV"), hotel: h.name, city: h.city, ratings: { ...D.ratings }, title: D.title.trim(), text: D.text.trim(), date: now, day: today(), due: Date.now() + REVIEW_MS, status: "Verifying", usd: h.pay, rate: rate(), kes: hotelLocal(h), reasons: [] });
    delete S.drafts[h.name]; D = null; save();
    d.innerHTML = `<div class="proc ok" role="status"><div class="tick" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg></div><h3>Review submitted</h3><p>Your review is now being verified. We'll notify you once it's complete.</p></div>`;
    await sleep(2200);
    d.oncancel = null; d.close(); busy = false;
    location.hash = "#reviews"; render();
  }

  function reviewCard(r) {
    const hid = H.find((h) => h.name === r.hotel).id, pct = Math.min(100, ((Date.now() - Date.parse(r.date)) / (r.due - Date.parse(r.date))) * 100);
    return `<article class="card rv"><div class="meta"><b>${esc(r.hotel)}</b>${r.status === "Verified" ? `<span class="pos">+${money(r.kes)} <small style="color:var(--mute)">(${usd(r.usd)})</small></span>` : `<span class="st ${r.status}">${r.status}</span>`}</div>${stars(r.ratings.overall)}<h3>${esc(r.title)}</h3><p class="rtext clamp">${esc(r.text)}</p><button type="button" class="link" data-a="more" aria-expanded="false" hidden>Read more</button>
    ${r.status === "Verifying" ? `<div class="vwrap"><small>Verification in progress</small><div class="vp" data-s="${Date.parse(r.date)}" data-e="${r.due}"><i style="width:${pct}%"></i></div><small>${money(r.kes)} will be credited once your review is verified.</small></div>` : ""}
    ${r.status === "Rejected" ? `<div class="alert bad" style="margin:10px 0 0"><b>Rejected. No reward was credited.</b><ul class="tips" style="margin-top:6px">${r.reasons.map((x) => `<li>${esc(x)}</li>`).join("")}</ul><a class="btn sm" style="margin-top:10px" href="#review/${hid}">Edit and resubmit</a></div>` : ""}
    <p class="hint" style="margin-top:8px">${CRIT.slice(1).map(([k, t]) => t + " " + r.ratings[k] + "/5").join(" · ")}<br>${fmtDate(r.date)}</p></article>`;
  }
  function vReviews() {
    if (!S.reviews.length) return `<div class="card empty"><b>You haven't submitted any reviews</b>Choose a hotel and write your first review.<p style="margin-top:12px"><a class="btn" href="#hotels">Browse hotels</a></p></div>`;
    const drafts = Object.keys(S.drafts).length;
    return `${drafts ? `<div class="alert info">You have ${drafts} unfinished draft${drafts > 1 ? "s" : ""}. Open the hotel to continue.</div>` : ""}<div class="grid">${S.reviews.map(reviewCard).join("")}</div>`;
  }

  function vWallet() {
    const w = wallet(), rows = S.tx.filter((t) => t.type === "reward"), min = S.minWd;
    const pct = Math.min(100, Math.round((w.avail / min) * 100)), can = w.avail >= min;
    const avg = rows.length ? rnd(w.earned / rows.length) : 0, wdn = S.tx.filter((t) => t.type === "withdrawal" && t.status === "Pending").length;
    const hero = `<div class="card wal-hero"><div class="wh-main"><small>Available balance</small><b>${money(w.avail)}</b><span class="wh-usd">≈ ${usd(w.avail / rate())}</span>
        <div class="wh-prog"><div class="vp" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Progress to minimum withdrawal"><i style="width:${pct}%"></i></div>
        <small>${can ? `You can withdraw now. Minimum is ${money(min)}.` : (w.avail > 0 ? `${money(rnd(min - w.avail))} more to reach the ${money(min)} minimum withdrawal.` : `Earn ${money(min)} to unlock withdrawals.`)}</small></div></div>
      <div class="wh-act"><a class="btn" href="#withdrawals" ${can ? "" : 'aria-disabled="true"'}>Withdraw funds</a><a class="btn sec" href="#hotels">Earn more</a></div></div>`;
    const mini = (l, v, sub) => `<div class="card stat"><small>${l}</small><b>${v}</b><span>${sub}</span></div>`;
    return `${refNote()}${hero}<div class="grid g3s" style="margin-top:16px">${mini("Total earnings", money(w.earned), `${rows.length} verified review${rows.length === 1 ? "" : "s"}${rows.length ? " · avg " + money(avg) : ""}`)}${mini("Pending earnings", money(w.pending), "Rewards under verification")}${mini("Total withdrawn", money(w.withdrawn), wdn ? `${wdn} payout${wdn > 1 ? "s" : ""} processing` : "Paid out successfully")}</div>
    <div class="card" style="margin-top:16px"><header><h3>Earnings history</h3><span class="hint">${rows.length} reward${rows.length === 1 ? "" : "s"} · ${money(w.earned)} total</span></header>
    ${rows.length ? `<div class="scroll"><table class="tbl"><thead><tr><th>Date</th><th>Hotel</th><th class="n hide-s">Reward</th><th class="n">${cur()}</th></tr></thead><tbody>${rows.map((t) => `<tr><td class="d">${fmtDate(t.date)}</td><td class="x">${esc(t.desc.replace("Review reward: ", ""))}</td><td class="n hide-s">${usd(t.usd)} <small style="color:var(--mute)">@ ${num(t.rate)}</small></td><td class="n pos">+${money(t.amount)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty"><b>No earnings yet</b>Submit a review to earn your first reward.<p style="margin-top:12px"><a class="btn sm" href="#hotels">Browse hotels</a></p></div>`}</div>`;
  }

  function vWithdrawals() {
    const w = wallet(), wd = S.tx.filter((t) => t.type === "withdrawal");
    return `${refNote()}<div class="grid g2"><form class="card" id="wf" novalidate><h2 style="margin-bottom:4px">Request withdrawal</h2><p class="hint" style="margin-bottom:14px">Available: <b>${money(w.avail)}</b> · Minimum: <b>${money(S.minWd)}</b></p>
      <div class="f"><label for="wm">Payout method</label><select id="wm">${C().methods.map((m) => `<option>${esc(m)}</option>`).join("")}</select></div>
      <div class="f"><label for="wp">Mobile money number</label><input id="wp" inputmode="tel" placeholder="${C().ph}" value="${esc(S.profile.phone)}" autocomplete="tel"></div>
      <div class="f"><label for="wa">Amount (${cur()})</label><input id="wa" type="number" inputmode="decimal" min="${S.minWd}" step="1" placeholder="${S.minWd}"><p class="hint"><button type="button" class="btn sec sm" data-a="max">Withdraw all</button></p></div>
      <div id="werr" class="err" role="alert"></div><button class="btn block" type="submit">Review request</button></form>
    <div class="card"><header><h3>Your requests</h3></header>${wd.length ? `<div class="list">${wd.map((t) => `<div class="li"><div><b class="neg">−${money(t.amount)}</b><small>${fmtDate(t.date)} · ${esc(t.ref)}<br>To ${esc(t.method || "M-Pesa")} ${esc(maskPhone(t.phone))}${t.status === "Pending" ? `<br><span class="eta">Processing payment…</span>` : t.status === "Paid" ? `<br>Paid ${fmtDate(t.paidDate || t.date)}` : ""}</small></div><div style="text-align:right"><span class="st ${t.status}">${t.status}</span>${t.status === "Pending" ? `<br><button class="btn sec sm" style="margin-top:6px" data-a="cancel" data-id="${t.id}">Cancel</button>` : ""}</div></div>`).join("")}</div>` : `<div class="empty"><b>No withdrawal requests</b>Your requests will appear here.</div>`}</div></div>`;
  }

  const T = { q: "", type: "all", st: "all" };
  function txList() {
    const q = T.q.trim().toLowerCase();
    const l = S.tx.filter((t) => (T.type === "all" || t.type === T.type) && (T.st === "all" || t.status === T.st) && (!q || (t.desc + " " + t.ref).toLowerCase().includes(q)));
    return l.length ? `<div class="scroll"><table class="tbl"><thead><tr><th>Date</th><th>Details</th><th class="hide-s">Reference</th><th>Status</th><th class="n">${cur()}</th></tr></thead><tbody>${l.map((t) => `<tr><td class="d">${fmtDate(t.date)}</td><td class="x">${esc(t.desc)}</td><td class="hide-s">${esc(t.ref)}</td><td class="s"><span class="st ${t.status}">${t.status}</span></td><td class="n ${t.type === "reward" ? "pos" : "neg"}">${t.type === "reward" ? "+" : "−"}${money(t.amount)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty"><b>No transactions found</b>${S.tx.length ? "Adjust your search or filters." : "Submit a review to get started."}</div>`;
  }
  function vTransactions() {
    const o = (v, t, c) => `<option value="${v}" ${v === c ? "selected" : ""}>${t}</option>`;
    return `<div class="toolbar"><input id="tq" type="search" placeholder="Search by hotel or reference" aria-label="Search transactions" value="${esc(T.q)}"><select id="tt" aria-label="Type">${o("all", "All types", T.type)}${o("reward", "Rewards", T.type)}${o("withdrawal", "Withdrawals", T.type)}</select><select id="ts" aria-label="Status">${o("all", "All statuses", T.st)}${o("Credited", "Credited", T.st)}${o("Paid", "Paid", T.st)}${o("Pending", "Pending", T.st)}${o("Cancelled", "Cancelled", T.st)}</select></div><div class="card" id="tl">${txList()}</div>`;
  }

  function vSettings() {
    const p = S.profile;
    return `<div class="grid g2"><form class="card" id="pf" novalidate><h2 style="margin-bottom:14px">Your profile</h2>
      <div class="f"><label for="pn">Full name</label><input id="pn" maxlength="60" value="${esc(p.name)}" autocomplete="name"></div>
      <div class="fields"><div class="f"><label for="pe">Email</label><input id="pe" type="email" value="${esc(p.email)}" autocomplete="email"></div><div class="f"><label for="pp">Mobile money number</label><input id="pp" inputmode="tel" placeholder="${C().ph}" value="${esc(p.phone)}"></div></div>
      <div id="perr" class="err" role="alert"></div><button class="btn" type="submit">Save profile</button></form>
    <div class="grid"><form class="card" id="cf" novalidate><h2 style="margin-bottom:6px">Country & currency</h2><p class="hint" style="margin-bottom:14px">Your wallet, payout methods and daily reset time follow your country. Changing country converts your balance at the rates below.</p>
      <div class="f"><label for="cc">Country</label><select id="cc">${Object.entries(COUNTRIES).map(([k, c]) => `<option value="${k}" ${k === CC ? "selected" : ""}>${c.flag} ${c.name} (${c.cur})</option>`).join("")}</select></div>
      <label style="margin-bottom:8px">Exchange rates ($1 =)</label><div class="fields">${Object.entries(COUNTRIES).map(([, c]) => `<div class="f"><label for="rt-${c.cur}" style="font-weight:500">${c.cur}</label><input id="rt-${c.cur}" type="number" step="any" min="0.01" value="${S.rates[c.cur]}"></div>`).join("")}</div>
      <p class="hint" style="margin:-4px 0 12px">A new rate applies to future reviews only.</p>
      <div class="f"><label for="pm">Minimum withdrawal (${cur()})</label><input id="pm" type="number" step="any" min="0.01" value="${S.minWd}"></div>
      <div id="cerr" class="err" role="alert"></div><div class="abar2"><button class="btn" type="submit">Save</button><button class="btn sec" type="button" data-a="rates-reset">Restore default rates</button></div></form>
    <div class="card"><h3 style="margin-bottom:8px">Reset my data</h3><p class="hint" style="margin-bottom:12px">Clears your profile, reviews, drafts, wallet, transactions, withdrawals and daily progress, and generates fresh hotel review counts.</p><button class="btn danger" data-a="reset">Reset my data</button></div></div></div>`;
  }

  /* ---------- Router ---------- */
  const TITLES = Object.fromEntries(NAV.map(([k, t]) => [k, t]));
  function render() {
    const [raw, arg] = (location.hash.slice(1) || "overview").split("/");
    const key = raw === "review" ? "hotels" : TITLES[raw] ? raw : "overview";
    const views = { overview: vOverview, hotels: vHotels, reviews: vReviews, wallet: vWallet, withdrawals: vWithdrawals, transactions: vTransactions, settings: vSettings };
    $("#view").innerHTML = raw === "review" ? vReview(parseInt(arg, 10)) : views[key]();
    if (raw === "review" && $("#rx")) { counters(); }
    fitReviews();
    document.body.classList.toggle("in-review", raw === "review" && !!$("#rf"));
    $("#pageTitle").textContent = raw === "review" ? "Review workspace" : TITLES[key];
    document.title = $("#pageTitle").textContent + " | HotelRate";
    const n = daily();
    $("#dailyPill").innerHTML = `${n}/${LIMIT}<span class="tdy"> today</span>`;
    $("#curPill").textContent = `${C().flag} ${cur()}`;
    $("#nav").innerHTML = NAV.map(([k, t]) => `<a href="#${k}" ${k === key ? 'aria-current="page"' : ""}>${ico(k)}${t}</a>`).join("");
    $("#bnav").innerHTML = BNAV.map((k) => `<a href="#${k}" ${k === key ? 'aria-current="page"' : ""}>${ico(k)}${{ overview: "Home", hotels: "Hotels", reviews: "Reviews", wallet: "Wallet" }[k]}</a>`).join("") + `<button type="button" data-a="menu">${ico("more")}More</button>`;
    closeMenu();
  }
  function fitReviews() { document.querySelectorAll(".rtext").forEach((p) => { const b = p.nextElementSibling; if (p.classList.contains("clamp")) b.hidden = p.scrollHeight <= p.clientHeight + 1; }); }
  window.addEventListener("resize", fitReviews);
  const closeMenu = () => { $("#side").classList.remove("open"); $("#scrim").classList.remove("show"); };
  window.addEventListener("hashchange", () => { render(); window.scrollTo(0, 0); $("#view").focus({ preventScroll: true }); });

  /* ---------- Events ---------- */
  document.addEventListener("error", (e) => { const i = e.target; if (i && i.tagName === "IMG" && i.parentElement.classList.contains("media")) { i.parentElement.classList.add("noimg"); i.remove(); } }, true);
  document.addEventListener("input", (e) => {
    const id = e.target.id;
    if (id === "hq") { F.q = e.target.value; $("#hgrid").innerHTML = hotelList(); }
    else if (id === "tq") { T.q = e.target.value; $("#tl").innerHTML = txList(); }
    else if (id === "rx" || id === "rt") counters();
  });
  document.addEventListener("change", (e) => {
    const id = e.target.id;
    if (id === "hcat") { F.cat = e.target.value; $("#hgrid").innerHTML = hotelList(); }
    else if (id === "hsort") { F.sort = e.target.value; $("#hgrid").innerHTML = hotelList(); }
    else if (id === "tt") { T.type = e.target.value; $("#tl").innerHTML = txList(); }
    else if (id === "ts") { T.st = e.target.value; $("#tl").innerHTML = txList(); }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });
  document.addEventListener("click", async (e) => {
    if (e.target.closest("#nav a")) closeMenu();
    if (e.target.id === "scrim" || e.target.closest("#scrim")) return closeMenu();
    if (e.target.closest("#menuBtn")) { $("#side").classList.add("open"); $("#scrim").classList.add("show"); return; }
    const b = e.target.closest("[data-a]"); if (!b) return;
    const a = b.dataset.a;
    if (a === "menu") { $("#side").classList.add("open"); $("#scrim").classList.add("show"); }
    else if (a === "star") {
      D.ratings[b.dataset.k] = +b.dataset.v;
      b.parentElement.querySelectorAll("button").forEach((x) => { const on = +x.dataset.v <= D.ratings[b.dataset.k]; x.classList.toggle("on", on); x.setAttribute("aria-checked", String(+x.dataset.v === D.ratings[b.dataset.k])); });
    } else if (a === "more") { const p = b.previousElementSibling, open = p.classList.toggle("clamp") === false; b.textContent = open ? "Read less" : "Read more"; b.setAttribute("aria-expanded", String(open)); }
    else if (a === "draft") saveDraft();
    else if (a === "rates-reset") { Object.entries(DEFAULT_RATES).forEach(([k, v]) => { $("#rt-" + k).value = v; }); toast("Default rates restored. Press Save to apply.", "ok"); }
    else if (a === "closeref") { refNoteOff = true; render(); }
    else if (a === "max") { $("#wa").value = Math.floor(wallet().avail); }
    else if (a === "cancel") {
      const t = S.tx.find((x) => x.id === b.dataset.id); if (!t || t.status !== "Pending") return;
      if (!(await confirmDlg({ title: "Cancel this request?", body: `${money(t.amount)} will return to your available balance.`, ok: "Cancel request", danger: true }))) return;
      t.status = "Cancelled"; save(); render();
      toast("Request cancelled and balance restored.", "ok");
    } else if (a === "reset") {
      if (!(await confirmDlg({ title: "Reset all your data?", body: "This permanently clears your profile, reviews, drafts, wallet, transactions and daily progress in this browser.", ok: "Reset everything", danger: true }))) return;
      try { localStorage.removeItem(KEY); } catch (er) { /* ignore */ }
      S = load(); applyCountry("KE"); D = null; save(); Object.assign(F, { q: "", sort: "reward", cat: "all" }); Object.assign(T, { q: "", type: "all", st: "all" });
      location.hash = "#overview"; render(); onboard();
    }
  });
  document.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = e.target.id;
    if (id === "rf") return submitReview();
    if (id === "wf") {
      const phone = phoneFor($("#wp").value), method = $("#wm").value, amt = rnd(parseFloat($("#wa").value)), w = wallet(), errs = [];
      if (!phone) errs.push(`Enter a valid ${C().name} mobile number, for example ${C().ph}.`);
      if (!(amt > 0)) errs.push("Enter the amount to withdraw.");
      else if (amt < S.minWd) errs.push(`The minimum withdrawal is ${money(S.minWd)}.`);
      else if (amt > w.avail) errs.push(`You can withdraw up to ${money(w.avail)}.`);
      $("#werr").innerHTML = errs.map((x) => "• " + esc(x)).join("<br>");
      if (errs.length) return toast(errs[0], "bad");
      if (!(await confirmDlg({ title: "Confirm withdrawal request", body: `Request <b>${money(amt)}</b> to ${esc(method)} <b>${esc(maskPhone(phone))}</b>? The amount leaves your balance now and the payment is sent to your ${esc(method)} shortly. `, ok: "Confirm request" }))) return;
      if (!canWithdraw()) { /* processing loader, then the referral warning; no withdrawal is created */
        const d = $("#dlg");
        d.onclick = null; d.oncancel = (ev) => ev.preventDefault();
        d.innerHTML = `<div class="proc" role="status"><div class="spin" aria-hidden="true"></div><h3>Processing your withdrawal…</h3><p>Please wait.</p><div class="bar"><i></i></div></div>`;
        d.showModal();
        await sleep(2500);
        const go = await alertDlg({ title: "Withdrawal not allowed", body: esc(WD_WARNING) + ` You currently have ${refCount()} of ${MIN_REFERRALS}.`, ok: "Close", alt: "Review hotels" });
        if (go === "alt") location.hash = "#hotels";
        return;
      }
      const r = ref("WD");
      S.tx.unshift({ id: ref("T"), ref: r, type: "withdrawal", desc: method + " withdrawal", method, amount: amt, phone, date: new Date().toISOString(), due: Date.now() + WD_MS, status: "Pending" });
      save(); render(); toast(`Request ${r} received. Payment is processing.`, "ok");
    } else if (id === "pf") {
      const email = $("#pe").value.trim(), ph = $("#pp").value.trim(), errs = [];
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errs.push("Enter a valid email address.");
      if (ph && !phoneFor(ph)) errs.push(`Enter a valid ${C().name} mobile number, for example ${C().ph}.`);
      $("#perr").innerHTML = errs.map((x) => "• " + esc(x)).join("<br>");
      if (errs.length) return toast(errs[0], "bad");
      S.profile = { ...S.profile, name: $("#pn").value.trim(), email, phone: ph ? "+" + phoneFor(ph) : "" };
      save(); render(); toast("Profile saved.", "ok");
    } else if (id === "cf") {
      const rates = {}, errs = [], key = $("#cc").value, min = parseFloat($("#pm").value);
      Object.values(COUNTRIES).forEach((c) => { const v = parseFloat($("#rt-" + c.cur).value); if (!(v > 0 && v <= 1e7)) errs.push(`Enter a valid ${c.cur} exchange rate.`); rates[c.cur] = v; });
      if (!(min > 0)) errs.push("Minimum withdrawal must be greater than 0.");
      $("#cerr").innerHTML = errs.map((x) => "• " + esc(x)).join("<br>");
      if (errs.length) return toast(errs[0], "bad");
      if (key !== CC) {
        const nc = COUNTRIES[key];
        if (!(await confirmDlg({ title: `Switch to ${nc.name}?`, body: `Your wallet will be shown in <b>${nc.cur}</b>. Your balance, pending rewards and history are converted at $1 = ${nc.cur} ${num(rates[nc.cur])} (from ${cur()} ${num(rates[cur()])}). Your minimum withdrawal resets to ${nc.cur} ${num(nc.min)}.`, ok: "Switch country" }))) return;
        switchCountry(key, rates); save(); render(); return toast(`Switched to ${nc.name}. Your wallet is now in ${nc.cur}.`, "ok");
      }
      S.rates = rates; S.minWd = rnd(min); save(); render(); toast("Currency settings saved.", "ok");
    }
  });

  /* ---------- Midnight reset (follows the selected country) ---------- */
  const tick = () => { if (S.daily.day !== today()) { daily(); render(); toast("A new day has started. Your daily reviews have reset.", "ok"); } };
  let dirty = false;
  function decide(r) {
    const why = judge(r);
    r.decided = new Date().toISOString();
    if (why.length) { r.status = "Rejected"; r.reasons = why; toast(`Review rejected: ${r.hotel}. ${why[0]}`, "bad"); }
    else {
      r.status = "Verified";
      S.tx.unshift({ id: ref("T"), ref: ref("HR"), type: "reward", desc: "Review reward: " + r.hotel, amount: r.kes, usd: r.usd, rate: r.rate, date: r.decided, status: "Credited" });
      toast(`Review verified: ${money(r.kes)} added to your wallet.`, "ok");
    }
    dirty = true; save();
  }
  function settle() {
    const now = Date.now();
    S.reviews.slice().reverse().forEach((r) => { if (r.status === "Verifying" && now >= r.due) decide(r); });
    S.tx.forEach((t) => {
      if (t.type === "withdrawal" && t.status === "Pending" && now >= t.due) {
        t.status = "Paid"; t.paidDate = new Date().toISOString(); dirty = true; save();
        toast(`${money(t.amount)} paid to ${t.method || "M-Pesa"} ${maskPhone(t.phone)}.`, "ok");
      }
    });
    if (dirty) {
      const a = document.activeElement;
      if ($("#rf")) dirty = false;
      else if (!(a && a.matches && a.matches("#view input, #view textarea"))) { dirty = false; render(); }
    }
    document.querySelectorAll(".vp").forEach((e) => { e.firstElementChild.style.width = Math.min(100, ((now - +e.dataset.s) / (+e.dataset.e - +e.dataset.s)) * 100) + "%"; });
  }
  setInterval(settle, 1000);
  setInterval(tick, 15000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });
  window.addEventListener("storage", (e) => { if (e.key === KEY) { S = load(); render(); } });


  settle();
  save();
  render();
  if (!S.profile.country) onboard();
})();
