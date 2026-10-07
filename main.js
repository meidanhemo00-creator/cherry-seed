(function () {
  "use strict";

  const reduceMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  const reduced = reduceMQ.matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

  /* ------------------------------------------------------------------
     Hero refraction: the light field is sliced into vertical glass ribs,
     each showing the field with a slight horizontal offset.
     ------------------------------------------------------------------ */
  const field = $(".hero__field");
  function buildStrips() {
    if (!field) return;
    const W = field.clientWidth;
    const stripW = W < 600 ? 40 : W < 1100 ? 52 : 64;
    const n = Math.ceil(W / stripW) + 1;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < n; i++) {
      const x = i * stripW;
      // small offsets: the photograph stays readable, the ribs read as glass
      const offset = Math.sin(i * 0.82) * stripW * 0.16 + Math.sin(i * 0.23) * stripW * 0.22;
      const strip = document.createElement("div");
      strip.className = "strip";
      strip.style.left = x + "px";
      strip.style.width = stripW + 1 + "px";
      const light = document.createElement("div");
      light.className = "strip__light";
      light.style.width = W + stripW * 4 + "px";
      light.style.left = -x - stripW * 2 + offset + "px";
      light.style.animationDelay = -(i * 0.42) + "s";
      strip.appendChild(light);
      frag.appendChild(strip);
    }
    field.replaceChildren(frag);
    field.classList.add("is-refracted");
  }
  buildStrips();
  let stripW0 = field ? field.clientWidth : 0;
  let rT;
  const onFieldResize = () => {
    clearTimeout(rT);
    rT = setTimeout(() => {
      if (field && Math.abs(field.clientWidth - stripW0) > 24) { stripW0 = field.clientWidth; buildStrips(); }
    }, 150);
  };
  if (field && "ResizeObserver" in window) new ResizeObserver(onFieldResize).observe(field);
  else window.addEventListener("resize", onFieldResize);

  /* ------------------------------------------------------------------
     Seeds
     ------------------------------------------------------------------ */
  const seeds = [];
  if (window.CherrySeed) {
    $$("canvas[data-seed]").forEach((canvas) => {
      const s = window.CherrySeed.create(canvas, {
        level: parseFloat(canvas.dataset.level || "0"),
        palette: canvas.dataset.palette,
        isStatic: canvas.hasAttribute("data-static"),
        reduced,
      });
      if (!s) return;
      canvas.parentElement.classList.add("is-live");
      canvas._seed = s;
      seeds.push(s);
    });

    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => e.target._seed && e.target._seed.setVisible(e.isIntersecting));
    }, { rootMargin: "80px" });
    seeds.forEach((s) => io.observe(s.canvas));

    if ("ResizeObserver" in window) {
      const ro = new ResizeObserver((entries) => entries.forEach((e) => e.target._seed && e.target._seed.resize()));
      seeds.forEach((s) => ro.observe(s.canvas));
    }
  }

  /* Journey: the sticky seed develops as each stage reaches the middle of the viewport */
  const journeySeed = $("canvas[data-journey]");
  const stages = $$(".stage");
  const readNum = $("[data-readout-num]");
  const readName = $("[data-readout-name]");
  const ticks = $$(".journey__ticks li");
  function setStage(n) {
    stages.forEach((s) => s.classList.toggle("is-active", +s.dataset.stage <= n));
    ticks.forEach((t, i) => t.classList.toggle("is-active", i < n));
    const st = stages[n - 1];
    if (readNum) readNum.textContent = "0" + n;
    if (readName && st) readName.textContent = $(".stage__title", st).textContent;
    if (journeySeed && journeySeed._seed) journeySeed._seed.setLevel(n);
  }
  if (stages.length) {
    const stageIO = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) setStage(+e.target.dataset.stage); });
    }, { rootMargin: "-45% 0px -45% 0px" });
    stages.forEach((s) => stageIO.observe(s));
    setStage(1);
  }

  /* ------------------------------------------------------------------
     Header tone follows the section beneath it
     ------------------------------------------------------------------ */
  const header = $(".site-header");
  const toneSections = $$("main > section, .site-footer");
  const navLinks = $$(".site-nav a");
  let ticking = false;
  function updateHeader() {
    ticking = false;
    const probe = (header ? header.offsetHeight : 68) / 2;
    let tone = "dark", onBlack = false, current = null;
    for (const sec of toneSections) {
      const r = sec.getBoundingClientRect();
      if (r.top <= probe && r.bottom > probe) {
        tone = sec.dataset.tone || "dark";
        onBlack = sec.classList.contains("journey") || sec.classList.contains("site-footer");
        // the Who section's right half is blue, but the header sits over the white text column
        break;
      }
    }
    for (const sec of toneSections) {
      const r = sec.getBoundingClientRect();
      if (r.top <= window.innerHeight * 0.4 && r.bottom > window.innerHeight * 0.4) { current = sec.id; break; }
    }
    if (header && header.classList.contains("menu-open")) { tone = "dark"; onBlack = true; }
    if (header) {
      header.dataset.tone = tone;
      header.classList.toggle("is-scrolled", window.scrollY > 8);
      header.classList.toggle("is-on-black", onBlack);
    }
    navLinks.forEach((a) => {
      const on = current && a.getAttribute("href") === "#" + current;
      if (on) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
    });
  }
  window.addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(updateHeader); } }, { passive: true });
  window.addEventListener("resize", updateHeader);
  updateHeader();

  /* ------------------------------------------------------------------
     Mobile menu
     ------------------------------------------------------------------ */
  const toggle = $(".menu-toggle");
  const menu = $("#mobile-menu");
  function setMenu(open) {
    if (!toggle || !menu) return;
    toggle.setAttribute("aria-expanded", String(open));
    $(".menu-toggle__label", toggle).textContent = open ? "Close" : "Menu";
    menu.hidden = !open;
    if (header) header.classList.toggle("menu-open", open);
    updateHeader();
    if (open) $("a", menu).focus();
  }
  if (toggle) {
    toggle.addEventListener("click", () => setMenu(toggle.getAttribute("aria-expanded") !== "true"));
    $$("a", menu).forEach((a) => a.addEventListener("click", () => setMenu(false)));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") { setMenu(false); toggle.focus(); }
    });
    window.matchMedia("(min-width: 900px)").addEventListener("change", (e) => { if (e.matches) setMenu(false); });
  }

  /* Syllabus toggle label reflects its state */
  const syl = $("#syllabus");
  if (syl) {
    const lbl = $(".syllabus__toggle span", syl);
    syl.addEventListener("toggle", () => { lbl.textContent = syl.open ? "Hide the full syllabus" : "View the full syllabus"; });
  }

  /* ------------------------------------------------------------------
     Reveals
     ------------------------------------------------------------------ */
  const reveals = $$(".reveal");
  if (reduced || !("IntersectionObserver" in window)) {
    reveals.forEach((el) => el.classList.add("is-in"));
  } else {
    const rio = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-in"); rio.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -8% 0px" });
    reveals.forEach((el) => rio.observe(el));
  }

})();
