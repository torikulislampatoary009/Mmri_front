const API = (window.API_BASE || "http://localhost:5000").replace(/\/$/, "");
const abs = (u) => (/^(data|blob):/.test(u) ? u : API + u);
const $ = (id) => document.getElementById(id);

const el = {
  status: $("status"), banner: $("demo-banner"), drop: $("drop"), file: $("file"), dropText: $("drop-text"),
  thr: $("thr"), thrOut: $("thr-out"), run: $("run"), msg: $("msg"), history: $("history"),
  base: $("img-base"), layer: $("img-layer"), placeholder: $("placeholder"),
  opacity: $("opacity"), opOut: $("op-out"), download: $("download"),
  stats: $("stats"), pct: $("s-pct"), px: $("s-px"), size: $("s-size"), ms: $("s-ms"),
};

let chosen = null;      // File waiting to be uploaded
let current = null;     // result currently shown
let view = "original";  // original | overlay | mask

function say(text, kind = "error") {
  el.msg.hidden = !text;
  el.msg.textContent = text || "";
  el.msg.className = "msg" + (kind === "info" ? " info" : "");
}

async function api(path, opts) {
  const res = await fetch(API + path, opts);
  let data = null;
  try { data = await res.json(); } catch (_) { /* not JSON */ }
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
  return data;
}

/* ---------- server status ---------- */
async function checkServer() {
  // Free hosting sleeps when idle and can take a minute to wake, so retry before giving up.
  for (let i = 0; i < 8; i++) {
    try {
      const h = await api("/api/health");
      el.status.className = "status ok";
      const d = h.model && h.model.val_dice;
      el.status.textContent = h.demo_mode ? "Server connected, demo mode"
        : "Server connected, model loaded" + (d ? ` (validation Dice ${Number(d).toFixed(3)})` : "");
      el.banner.hidden = !h.demo_mode;
      loadHistory();
      return;
    } catch (e) {
      el.status.className = "status";
      el.status.textContent = i < 7 ? "Waking the server, this can take up to a minute…" : "";
      if (i === 7) { el.status.className = "status bad"; el.status.textContent = "Cannot reach the server at " + API; return; }
      await new Promise((r) => setTimeout(r, 8000));
    }
  }
}

el.download.addEventListener("click", async (e) => {
  e.preventDefault();
  const u = el.download.dataset.url;
  if (!u) return;
  try {
    const blob = await (await fetch(u)).blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "overlay.png"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } catch (_) { window.open(u, "_blank"); }
});

/* ---------- choosing files ---------- */
let mode = "single";   // single | seq
const picked = { single: null, pre: null, flair: null, post: null };

function refreshRun() { el.run.disabled = mode === "single" ? !picked.single : !picked.flair; }
function setFile(f, slot = "single") {
  if (!f) return;
  picked[slot] = f;
  say("");
  if (slot === "single") el.dropText.textContent = f.name;
  if ((slot === "single" || slot === "flair") && /\.(png|jpe?g|bmp)$/i.test(f.name)) {   // TIFF can't be previewed by browsers
    showImages({ image_url: URL.createObjectURL(f), overlay_url: null, mask_url: null }, true);
  }
  refreshRun();
}
el.file.addEventListener("change", () => setFile(el.file.files[0]));
document.querySelectorAll("#seq-box input[type=file]").forEach((inp) =>
  inp.addEventListener("change", () => setFile(inp.files[0], inp.dataset.slot)));
document.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => {
  mode = b.dataset.mode;
  document.querySelectorAll(".seg button").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
  $("single-box").hidden = mode !== "single";
  $("seq-box").hidden = mode !== "seq";
  refreshRun();
}));
el.drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.file.click(); } });
["dragenter", "dragover"].forEach((t) => el.drop.addEventListener(t, (e) => { e.preventDefault(); el.drop.classList.add("over"); }));
["dragleave", "drop"].forEach((t) => el.drop.addEventListener(t, (e) => { e.preventDefault(); el.drop.classList.remove("over"); }));
el.drop.addEventListener("drop", (e) => setFile(e.dataTransfer.files[0]));
el.thr.addEventListener("input", () => (el.thrOut.textContent = Number(el.thr.value).toFixed(2)));

/* ---------- running segmentation ---------- */
el.run.addEventListener("click", async () => {
  const fd = new FormData();
  if (mode === "single") {
    if (!picked.single) return;
    fd.append("image", picked.single);
  } else {
    if (!picked.flair) return;
    ["pre", "flair", "post"].forEach((k) => picked[k] && fd.append(k, picked[k]));
  }
  fd.append("threshold", el.thr.value);
  el.run.disabled = true; el.run.classList.add("busy"); el.run.textContent = "Segmenting…";
  say("");
  try {
    const r = await api("/api/predict", { method: "POST", body: fd });
    show(r);
    if (r.warning) say(r.warning, "info");
    else if (!r.saved) say("Result not saved to history: " + (r.db_error || "database unavailable"), "info");
    if (r.saved) loadHistory();
  } catch (e) {
    say(e.message);
  } finally {
    el.run.classList.remove("busy"); el.run.textContent = "Segment scan"; refreshRun();
  }
});

/* ---------- viewer ---------- */
function showImages(r, previewOnly = false) {
  el.placeholder.hidden = true;
  el.base.hidden = false;
  el.base.src = abs(r.image_url);
  el.layer.dataset.src = r.mask_url ? abs(r.mask_url) : "";
  el.layer.src = el.layer.dataset.src;
  el.download.hidden = !r.overlay_url;
  el.download.dataset.url = r.overlay_url ? abs(r.overlay_url) : "";
  if (previewOnly) { el.stats.hidden = true; setView("original"); } else applyView();
}

function show(r) {
  current = r;
  showImages(r);
  el.stats.hidden = false;
  el.pct.textContent = Number(r.tumor_percent).toFixed(2) + "%";
  el.px.textContent = Number(r.tumor_pixels).toLocaleString();
  el.size.textContent = `${r.width} × ${r.height}`;
  el.ms.textContent = r.inference_ms + " ms";
  setView(r.tumor_pixels > 0 ? "overlay" : "original");
  if (r.tumor_pixels === 0) say("No tumor region found at this cut-off. Try a lower sensitivity cut-off.", "info");
  document.querySelectorAll(".history .open").forEach((b) => b.classList.toggle("active", Number(b.dataset.id) === r.id));
}

function setView(v) {
  view = v;
  document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.view === v)));
  applyView();
}
function applyView() {
  const hasLayer = !!el.layer.dataset.src;
  el.layer.hidden = !(hasLayer && view !== "original");
  el.base.style.visibility = view === "mask" ? "hidden" : "visible";
  el.layer.style.opacity = view === "mask" ? 1 : el.opacity.value / 100;
  if (hasLayer && view !== "original") {
    el.layer.style.width = el.base.clientWidth + "px";
    el.layer.style.height = el.base.clientHeight + "px";
  }
}
document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
el.opacity.addEventListener("input", () => { el.opOut.textContent = el.opacity.value + "%"; applyView(); });
el.base.addEventListener("load", applyView);
window.addEventListener("resize", applyView);

/* ---------- history ---------- */
async function loadHistory() {
  try {
    const rows = await api("/api/history");
    el.history.innerHTML = "";
    if (!rows.length) { el.history.innerHTML = '<li class="empty">No scans yet. Upload one to get started.</li>'; return; }
    rows.forEach((r) => {
      const li = document.createElement("li");
      li.className = "item";
      const open = document.createElement("button");
      open.className = "open"; open.dataset.id = r.id;
      open.innerHTML = `<img alt=""><span><span class="name"></span><span class="meta"></span></span>`;
      open.querySelector("img").src = abs(r.thumb_url || r.image_url);
      open.querySelector(".name").textContent = r.original_name;
      open.querySelector(".meta").textContent = `${Number(r.tumor_percent).toFixed(2)}% tumor · ${new Date(r.created_at).toLocaleString()}`;
      open.addEventListener("click", () => show(r));
      const del = document.createElement("button");
      del.className = "del"; del.textContent = "Delete"; del.setAttribute("aria-label", "Delete " + r.original_name);
      del.addEventListener("click", async () => {
        if (!confirm("Delete this scan and its results?")) return;
        try { await api("/api/history/" + r.id, { method: "DELETE" }); loadHistory(); } catch (e) { say(e.message); }
      });
      li.append(open, del);
      el.history.append(li);
    });
  } catch (e) {
    el.history.innerHTML = '<li class="empty"></li>';
    el.history.firstChild.textContent = "History unavailable: " + e.message;
  }
}

checkServer();
