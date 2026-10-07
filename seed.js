/*
 * The Cherry Seed signature graphic.
 * A luminous seed drawn from fine spiralling meridians. As `level` rises from 0 to 3 it gains
 * latitude rings (structure), a connected surface lattice (a team, a model), and finally
 * outward nodes linked back to the core (a venture meeting the world).
 * Canvas 2D only; ~2k short strokes per frame, paused when off screen.
 */
(function () {
  "use strict";

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ease = (t) => 1 - Math.pow(1 - t, 3);

  // Deterministic PRNG so every load draws the same silhouette
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Seed silhouette: pointed crown, fuller base, a slight spiral twist
  const TWIST = 0.75;
  function shape(v, u, k) {
    const s = Math.sin(v);
    const c = Math.cos(v);
    const e = 1 + 0.38 * c;                      // sharper at the crown (v=0), rounder at the base
    const r = Math.pow(Math.max(s, 0), e) * (0.6 - 0.13 * c) * (k || 1);
    const uu = u + TWIST * v;
    return [r * Math.cos(uu), -c * 1.0 * (k || 1), r * Math.sin(uu)];
  }

  function buildGeometry() {
    const rand = rng(7);
    const MER = 26, SEG = 48, RINGS = 11, RSEG = 64;

    const meridians = [];
    for (let m = 0; m < MER; m++) {
      // interleaved order so new meridians fill gaps evenly as the count grows
      const idx = (m * 11) % MER;
      const u = (idx / MER) * TAU;
      const pts = [];
      for (let i = 0; i <= SEG; i++) pts.push(shape((i / SEG) * Math.PI, u));
      meridians.push(pts);
    }

    const rings = [];
    for (let r = 1; r <= RINGS; r++) {
      const v = (r / (RINGS + 1)) * Math.PI;
      const pts = [];
      for (let i = 0; i <= RSEG; i++) pts.push(shape(v, (i / RSEG) * TAU - TWIST * v));
      rings.push(pts);
    }

    // Surface lattice from a Fibonacci distribution
    const N = 64;
    const nodes = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - ((i + 0.5) / N) * 2;
      const v = Math.acos(y);
      const u = i * golden;
      nodes.push(shape(v, u, 1.02));
    }
    const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
    const edgeSet = new Set();
    const edges = [];
    nodes.forEach((a, i) => {
      const near = nodes
        .map((b, j) => [j, d2(a, b)])
        .filter(([j]) => j !== i)
        .sort((p, q) => p[1] - q[1])
        .slice(0, 3);
      near.forEach(([j]) => {
        const key = i < j ? i + "-" + j : j + "-" + i;
        if (!edgeSet.has(key)) { edgeSet.add(key); edges.push([i, j]); }
      });
    });

    // Outer venture nodes, each tethered to the nearest surface node
    const SAT = 22;
    const sats = [];
    for (let i = 0; i < SAT; i++) {
      const v = Math.acos(1 - 2 * (0.08 + rand() * 0.84));
      const u = rand() * TAU;
      const R = 1.4 + rand() * 0.8;
      const dir = shape(v, u);
      const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
      const p = [dir[0] / len * R, dir[1] / len * R * 0.92, dir[2] / len * R];
      let best = 0, bd = Infinity;
      nodes.forEach((n, j) => { const dd = d2(n, p); if (dd < bd) { bd = dd; best = j; } });
      sats.push({ p, anchor: best, delay: rand() * 0.45, size: 1.4 + rand() * 1.8 });
    }
    const satLinks = [];
    sats.forEach((s, i) => {
      let best = -1, bd = Infinity;
      sats.forEach((o, j) => { if (j !== i) { const dd = d2(s.p, o.p); if (dd < bd) { bd = dd; best = j; } } });
      if (best > i || sats[best] === undefined) satLinks.push([i, best]);
      else if (!satLinks.some(([a, b]) => a === best && b === i)) satLinks.push([i, best]);
    });

    // Luminous dust inside the core
    const dust = [];
    for (let i = 0; i < 150; i++) {
      const v = Math.acos(1 - 2 * rand());
      const u = rand() * TAU;
      const k = Math.pow(rand(), 0.6) * 0.92;
      dust.push({ p: shape(v, u, k), tw: rand() * TAU, s: 0.6 + rand() * 1.3 });
    }

    return { meridians, rings, nodes, edges, sats, satLinks, dust };
  }

  let GEO = null;

  const PALETTES = {
    // on electric blue: white and ice light
    blue: { line: [226, 248, 255], node: [255, 255, 255], glow: [194, 254, 255], glowA: 0.34, base: 0.95, crown: 0.55 },
    // on black: electric blue structure with ice highlights
    dark: { line: [112, 138, 220], node: [218, 226, 250], glow: [47, 91, 234], glowA: 0.32, base: 0.95, crown: 0.7 },
  };

  function Seed(canvas, opts) {
    GEO = GEO || buildGeometry();
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.pal = PALETTES[opts.palette] || PALETTES.blue;
    this.level = opts.level;
    this.target = opts.level;
    this.isStatic = !!opts.isStatic;
    this.reduced = !!opts.reduced;
    this.visible = false;
    this.t0 = performance.now();
    this.raf = 0;
    this.resize();
    this.frame = this.frame.bind(this);
  }

  Seed.prototype.resize = function () {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.raf) this.draw(this.isStatic || this.reduced ? 2600 : performance.now() - this.t0);
  };

  Seed.prototype.setLevel = function (lv) {
    this.target = lv;
    if (this.reduced || this.isStatic) { this.level = lv; this.draw(2600); }
    else this.start();
  };

  Seed.prototype.setVisible = function (v) {
    this.visible = v;
    if (v) this.start(); else this.stop();
  };

  Seed.prototype.start = function () {
    if (this.raf || this.reduced || this.isStatic || !this.visible) return;
    this.raf = requestAnimationFrame(this.frame);
  };
  Seed.prototype.stop = function () { cancelAnimationFrame(this.raf); this.raf = 0; };

  Seed.prototype.frame = function (now) {
    this.raf = 0;
    this.level += (this.target - this.level) * 0.045;
    if (Math.abs(this.target - this.level) < 0.001) this.level = this.target;
    this.draw(now - this.t0);
    if (this.visible) this.raf = requestAnimationFrame(this.frame);
  };

  Seed.prototype.draw = function (t) {
    const { ctx, w, h, pal } = this;
    const L = this.level;
    ctx.clearRect(0, 0, w, h);

    const outer = ease(clamp(L - 2, 0, 1));
    const lattice = ease(clamp(L - 1.1, 0, 1));
    const ringsA = ease(clamp(L - 0.35, 0, 1));
    const cx = w / 2, cy = h / 2;
    const unit = Math.min(w, h) * (0.36 - 0.15 * outer);
    const breathe = 1 + 0.012 * Math.sin(t * 0.0009);

    const ry = t * 0.00011 + 0.6;
    const rx = 0.32 + 0.05 * Math.sin(t * 0.00023);
    const rz = -0.38;
    const cyR = Math.cos(ry), syR = Math.sin(ry);
    const cxR = Math.cos(rx), sxR = Math.sin(rx);
    const czR = Math.cos(rz), szR = Math.sin(rz);
    const F = 4.2;

    const proj = (p, out) => {
      let x = p[0], y = p[1], z = p[2];
      let x1 = x * cyR + z * syR; let z1 = -x * syR + z * cyR;           // Y
      let y1 = y * cxR - z1 * sxR; let z2 = y * sxR + z1 * cxR;          // X
      let x2 = x1 * czR - y1 * szR; let y2 = x1 * szR + y1 * czR;        // Z
      const k = F / (F + z2);
      out[0] = cx + x2 * unit * breathe * k;
      out[1] = cy + y2 * unit * breathe * k;
      out[2] = z2;                                                     // depth: -1 near, +1 far
      return out;
    };

    const [lr, lg, lb] = pal.line;
    const [nr, ng, nb] = pal.node;

    // Core glow
    const gR = unit * (1.15 - 0.15 * lattice);
    const g = ctx.createRadialGradient(cx, cy + unit * 0.12, 0, cx, cy + unit * 0.12, gR);
    const [gr, gg, gb] = pal.glow;
    g.addColorStop(0, `rgba(${gr},${gg},${gb},${pal.glowA * (1 - 0.25 * outer)})`);
    g.addColorStop(0.55, `rgba(${gr},${gg},${gb},${pal.glowA * 0.25})`);
    g.addColorStop(1, `rgba(${gr},${gg},${gb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";

    // Depth-bucketed strokes: 4 alpha bands, one stroke() each
    const BUCKETS = 4;
    const buckets = [];
    for (let i = 0; i < BUCKETS; i++) buckets.push([]);
    const a = [0, 0, 0], b = [0, 0, 0];
    const pushPolyline = (pts, weight) => {
      proj(pts[0], a);
      for (let i = 1; i < pts.length; i++) {
        proj(pts[i], b);
        const depth = (a[2] + b[2]) * 0.5;                            // -1..1
        const bi = clamp(Math.floor(((1 - depth) / 2) * BUCKETS), 0, BUCKETS - 1);
        buckets[bi].push(a[0], a[1], b[0], b[1], weight);
        a[0] = b[0]; a[1] = b[1]; a[2] = b[2];
      }
    };
    const flush = (alphaScale, width) => {
      for (let i = 0; i < BUCKETS; i++) {
        const list = buckets[i];
        if (!list.length) continue;
        const depthA = 0.18 + (i / (BUCKETS - 1)) * 0.82;
        // group by weight to vary opacity per family
        ctx.lineWidth = width;
        let cur = -1;
        for (let j = 0; j < list.length; j += 5) {
          const wgt = list[j + 4];
          if (wgt !== cur) {
            if (cur !== -1) ctx.stroke();
            cur = wgt;
            ctx.strokeStyle = `rgba(${lr},${lg},${lb},${clamp(depthA * alphaScale * wgt, 0, 1)})`;
            ctx.beginPath();
          }
          ctx.moveTo(list[j], list[j + 1]);
          ctx.lineTo(list[j + 2], list[j + 3]);
        }
        if (cur !== -1) ctx.stroke();
        list.length = 0;
      }
    };

    // Meridians: 7 at the seed stage, all 26 at full structure
    const mCount = 7 + (GEO.meridians.length - 7) * clamp(L / 2.2, 0, 1);
    for (let m = 0; m < GEO.meridians.length; m++) {
      const vis = clamp(mCount - m, 0, 1);
      if (vis <= 0) break;
      pushPolyline(GEO.meridians[m], Math.round(vis * 4) / 4);
    }
    flush(pal.base * (0.75 - 0.15 * outer), 1);

    // Latitude rings
    if (ringsA > 0) {
      GEO.rings.forEach((r) => pushPolyline(r, 1));
      flush(pal.base * 0.42 * ringsA, 0.8);
    }

    // Dust
    const dustA = 0.75 - 0.45 * lattice;
    for (let i = 0; i < GEO.dust.length; i++) {
      const d = GEO.dust[i];
      proj(d.p, a);
      const tw = 0.55 + 0.45 * Math.sin(t * 0.0016 + d.tw);
      const al = dustA * tw * (0.35 + 0.65 * (1 - a[2]) / 2);
      ctx.fillStyle = `rgba(${nr},${ng},${nb},${al})`;
      ctx.fillRect(a[0] - d.s / 2, a[1] - d.s / 2, d.s, d.s);
    }

    // Surface lattice
    const P = GEO.nodes.map((n) => proj(n, [0, 0, 0]));
    if (lattice > 0) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(${nr},${ng},${nb},${0.5 * lattice})`;
      ctx.beginPath();
      GEO.edges.forEach(([i, j], k) => {
        if (k / GEO.edges.length > lattice) return;
        const p = P[i], q = P[j];
        if (p[2] + q[2] > 0.9) return;                  // keep the far side quiet
        ctx.moveTo(p[0], p[1]);
        ctx.lineTo(q[0], q[1]);
      });
      ctx.stroke();
      P.forEach((p) => {
        const al = lattice * (0.25 + 0.75 * (1 - p[2]) / 2);
        const s = 1.6 + 1.6 * (1 - p[2]) / 2;
        ctx.fillStyle = `rgba(${nr},${ng},${nb},${al})`;
        ctx.fillRect(p[0] - s / 2, p[1] - s / 2, s, s);
      });
    }

    // Outer venture network
    if (outer > 0) {
      const S = GEO.sats.map((s) => {
        const e = ease(clamp((outer - s.delay) / (1 - s.delay), 0, 1));
        const an = GEO.nodes[s.anchor];
        const p = [an[0] + (s.p[0] - an[0]) * e, an[1] + (s.p[1] - an[1]) * e, an[2] + (s.p[2] - an[2]) * e];
        return { q: proj(p, [0, 0, 0]), e, s };
      });
      ctx.lineWidth = 0.9;
      S.forEach(({ q, e, s }) => {
        if (e <= 0) return;
        const p = P[s.anchor];
        ctx.strokeStyle = `rgba(${lr},${lg},${lb},${0.55 * e})`;
        ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
      });
      GEO.satLinks.forEach(([i, j]) => {
        const A = S[i], B = S[j];
        const e = Math.min(A.e, B.e);
        if (e <= 0) return;
        ctx.strokeStyle = `rgba(${nr},${ng},${nb},${0.28 * e})`;
        ctx.beginPath(); ctx.moveTo(A.q[0], A.q[1]); ctx.lineTo(B.q[0], B.q[1]); ctx.stroke();
      });
      S.forEach(({ q, e, s }) => {
        if (e <= 0) return;
        const size = s.size * 1.5 * e;
        ctx.fillStyle = `rgba(${nr},${ng},${nb},${0.9 * e})`;
        ctx.beginPath(); ctx.arc(q[0], q[1], size, 0, TAU); ctx.fill();
        ctx.strokeStyle = `rgba(${nr},${ng},${nb},${0.35 * e})`;
        ctx.beginPath(); ctx.arc(q[0], q[1], size * 2.8, 0, TAU); ctx.stroke();
      });
    }

    // Bright crown point: the "seed" of the idea
    proj(shape(0.0001, 0), a);
    const cr = ctx.createRadialGradient(a[0], a[1], 0, a[0], a[1], unit * 0.22);
    cr.addColorStop(0, `rgba(${nr},${ng},${nb},${pal.crown})`);
    cr.addColorStop(0.18, `rgba(${nr},${ng},${nb},${pal.crown * 0.35})`);
    cr.addColorStop(1, `rgba(${nr},${ng},${nb},0)`);
    ctx.fillStyle = cr;
    ctx.fillRect(a[0] - unit * 0.22, a[1] - unit * 0.22, unit * 0.44, unit * 0.44);

    ctx.globalCompositeOperation = "source-over";
  };

  window.CherrySeed = {
    create(canvas, opts) {
      try {
        if (!canvas.getContext || !canvas.getContext("2d")) return null;
        return new Seed(canvas, opts);
      } catch (e) {
        return null; // the CSS glow behind each canvas remains as the static fallback
      }
    },
  };
})();
