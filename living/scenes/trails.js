/* =====================================================================
   TRAILS — testimonials.html (live hero)
   The page's own claim is the heading: "At Alpine, we have a 100%
   success rate." Beside it, a living constellation: Alpine Aviation is
   the gold origin light; one luminous trail per person quoted on this
   page flows out to a small glass card with their name as written and
   ONE short verbatim phrase from their own quote. Light pulses travel
   out along each trail; when one arrives, that person's card glows.

   NOTHING INVENTED. The cards carry only words that appear in the quotes
   on this page (checked against the page at load: a phrase that is not
   found verbatim in its quote is dropped). The constellation is abstract,
   not a map: trail directions and lengths mean nothing.

   Layout adapts to the room beside the heading:
     wide   two staggered columns, all six cards
     narrow one column, three cards at a time, cycling
     phone  one card at a time above the heading, cycling
   ===================================================================== */
(function () {
  "use strict";
  const NS = window.Living = window.Living || { scenes: {} };
  const K = window.LivingKit;

  /* name as written in the figcaption + a verbatim phrase from that person's quote */
  const PEOPLE = [
    { name: "Waylon Forgue", phrase: "very practical and geared for real-life applications" },
    { name: "Tanner Wayne Cude", phrase: "flying a Sikorsky Skycrane heli tanker on fires in California with just over 1000 hrs" },
    { name: "Andrew Southard", phrase: "working on my Commercial Rotor wing add-on" },
    { name: "Bud Layne", phrase: "flying helicopters is just a huge amount of fun too" },
    { name: "Beau Value", phrase: "everything they did to help me earn my helicopter license" },
    { name: "James Pafford", phrase: "a training manual that is second to none" }
  ];
  const D = 1000, FOV = .62;

  let SEG = 72, BG, TR, SP, HF, TER, SKY, people = [], L = null, originLab, lastSig = "", frameN = 0;
  const esc = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ---- keep only phrases that really are in the page's quotes ---- */
  function verified() {
    const figs = [...document.querySelectorAll("figure.quote")];
    return PEOPLE.filter(P => figs.some(f => {
      const cap = (f.querySelector("figcaption") || {}).textContent || "", q = (f.querySelector("blockquote") || {}).textContent || "";
      return cap.trim().startsWith(P.name) && q.includes(P.phrase);
    }));
  }

  /* ---- trail ribbons (own shader: gradient along the line + travelling pulse) ---- */
  function trailGeometry(E) {
    const gl = E.gl, n = people.length * (SEG + 1) * 2;
    const buf = { pos: new Float32Array(n * 3), nxt: new Float32Array(n * 3), prv: new Float32Array(n * 3), side: new Float32Array(n), along: new Float32Array(n), id: new Float32Array(n) };
    const idx = [];
    for (let li = 0; li < people.length; li++) {
      const b = li * (SEG + 1) * 2;
      for (let i = 0; i <= SEG; i++) {
        for (let s = 0; s < 2; s++) { const k = b + i * 2 + s; buf.side[k] = s ? 1 : -1; buf.along[k] = i / SEG; buf.id[k] = li; }
        if (i < SEG) { const a = b + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
    }
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const mk = (arr, size, i, dyn) => { const bb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bb); gl.bufferData(gl.ARRAY_BUFFER, arr, dyn ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW); gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, size, gl.FLOAT, false, 0, 0); return bb; };
    const bP = mk(buf.pos, 3, 0, 1), bN = mk(buf.nxt, 3, 1, 1), bV = mk(buf.prv, 3, 2, 1);
    mk(buf.side, 1, 3); mk(buf.along, 1, 4); mk(buf.id, 1, 5);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(idx), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    const P = E.program(`#version 300 es
precision highp float;
in vec3 aP, aN, aV; in float aS, aA, aId;
uniform mat4 uVP; uniform vec2 uRes; uniform float uW;
out float vA, vS, vId;
void main(){
  vec4 c = uVP * vec4(aP, 1.), cn = uVP * vec4(aN, 1.), cp = uVP * vec4(aV, 1.);
  vec2 dir = normalize((cn.xy / cn.w - cp.xy / cp.w) * uRes + 1e-6);
  c.xy += vec2(-dir.y, dir.x) * aS * uW / uRes * c.w;
  gl_Position = c; vA = aA; vS = aS; vId = aId;
}`, `#version 300 es
precision highp float;
in float vA, vS, vId; out vec4 o;
uniform float uT, uPh[6], uHit[6], uVis[6], uI;
uniform vec3 uGold, uIce, uCream;
void main(){
  int i = int(vId + .5);
  float core = 1. - smoothstep(0., 1., abs(vS));
  float g = pow(core, 1.7) * .55 + pow(core, 9.) * 1.;
  /* Alpine gold at the origin -> ice-blue flight path -> gold at the person */
  vec3 col = mix(uGold, uIce, smoothstep(.02, .3, vA));
  col = mix(col, uGold * 1.1, smoothstep(.72, .99, vA));
  float flow = .82 + .18 * sin(vA * 38. - uT * 2.1 + vId * 1.7);
  float d = uPh[i] - vA;
  float hd = d / .016;                                       /* squared by hand: pow() of a negative base is undefined */
  float head = uPh[i] > -.5 ? exp(-hd * hd) : 0.;
  float tail = (uPh[i] > -.5 && d > 0.) ? exp(-d / .16) * (1. - smoothstep(.9, 1.05, uPh[i]) * .6) : 0.;
  float vis = mix(.28, 1., uVis[i]);
  float endGlow = uHit[i] * smoothstep(.55, 1., vA) * 1.6;
  vec3 c = col * g * uI * vis * (flow + tail * 1.6 + endGlow) + uCream * g * head * 3.2 * vis;
  /* fade in from the origin core so the trails grow out of the light */
  c *= smoothstep(0., .035, vA);
  o = vec4(c, 1.);
}`, ["aP", "aN", "aV", "aS", "aA", "aId"]);
    return {
      upload(curves) {
        let k = 0;
        curves.forEach(pts => {
          for (let i = 0; i <= SEG; i++) {
            const p = pts[i], pn = pts[Math.min(SEG, i + 1)], pp = pts[Math.max(0, i - 1)];
            for (let s = 0; s < 2; s++) { buf.pos.set(p, k * 3); buf.nxt.set(pn, k * 3); buf.prv.set(pp, k * 3); k++; }
          }
        });
        gl.bindBuffer(gl.ARRAY_BUFFER, bP); gl.bufferSubData(gl.ARRAY_BUFFER, 0, buf.pos);
        gl.bindBuffer(gl.ARRAY_BUFFER, bN); gl.bufferSubData(gl.ARRAY_BUFFER, 0, buf.nxt);
        gl.bindBuffer(gl.ARRAY_BUFFER, bV); gl.bufferSubData(gl.ARRAY_BUFFER, 0, buf.prv);
      },
      draw(vp, u) {
        gl.enable(gl.DEPTH_TEST); gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
        P.use().m4("uVP", vp).f2("uRes", E.W, E.H).f1("uW", u.width * E.scale).f1("uT", u.t).f1("uI", u.intensity)
          .v1("uPh", u.ph).v1("uHit", u.hit).v1("uVis", u.vis)
          .v3("uGold", [1.5, .92, .38]).v3("uIce", [.34, .66, 1.45]).v3("uCream", [1.6, 1.45, 1.2]);
        gl.bindVertexArray(vao); gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_INT, 0); gl.bindVertexArray(null);
        gl.depthMask(true); gl.disable(gl.BLEND);
      }
    };
  }

  /* ---- overlay on the dusk sky: faint nebula around the constellation, Alpine's warm glow,
     and a darker left side for the words (blend ONE, SRC_ALPHA: rgb adds, alpha scales what is there) ---- */
  function overlay(E) {
    return E.program(E.QV, `#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform vec2 uO, uC; uniform float uT, uAsp, uHz;
${K.GLSL.hash}
${K.GLSL.noise}
void main(){
  vec2 uv = vUv, p = vec2(uv.x * uAsp, uv.y);
  vec3 c = vec3(0.);
  vec2 q = p * 2.4 + vec2(uT * .006, -uT * .004);
  float n = fbm(q + fbm(q * 1.7 + uT * .01) * 1.3);
  float around = exp(-dot(p - uC, p - uC) * 2.6);
  c += mix(vec3(.010, .020, .050), vec3(.030, .034, .075), n) * smoothstep(.4, .9, n) * (.2 + around * .7) * smoothstep(uHz - .05, uHz + .2, uv.y);
  float dO = length(p - uO);
  c += vec3(1.1, .62, .22) * .07 * exp(-dO * dO * 40.) + vec3(.9, .5, .2) * .014 * exp(-dO * 4.);
  float keep = mix(.62, 1., smoothstep(.08, .55, uv.x));
  o = vec4(c, keep);
}`);
  }

  /* ---- the real ground under the sky: Mountain Home, Idaho, looking north-east at dusk ---- */
  function terrainCam(E, t, S, yh) {
    const fovT = E.aspect < 1 ? 1.0 : .62;
    const e0 = HF.world(.14, .93, 0);
    const gy = TER.hMesh(e0[0], e0[2]) + 140;
    const tgt = HF.world(.72, .24, 0);
    let dx = tgt[0] - e0[0], dz = tgt[2] - e0[2]; const l = Math.hypot(dx, dz); dx /= l; dz /= l;
    const yw = Math.sin(t * .071) * .012 + S.px * .01, cy = Math.cos(yw), sy = Math.sin(yw);
    const fx = dx * cy - dz * sy, fz = dx * sy + dz * cy;
    const tp = (yh - .5) * 2 * Math.tan(fovT / 2) + Math.sin(t * .053) * .002;
    const eye = [e0[0], gy, e0[2]];
    const view = E.M.look(eye, [eye[0] + fx * 1000, eye[1] + tp * 1000, eye[2] + fz * 1000], [0, 1, 0]);
    return { eye, vp: E.M.mul(E.M.persp(fovT, E.aspect, 20, 90000), view) };
  }

  /* ---- camera + unprojection ---- */
  function baseCam(E) {
    const proj = E.M.persp(FOV, E.aspect, 10, 6000);
    return proj;
  }
  /* screen px (relative to the pin) at depth z (world) -> world point, for the resting camera at (0,0,D) */
  function unproject(E, sx, sy, z) {
    const ty = Math.tan(FOV / 2), tx = ty * E.aspect, nx = sx / E.cssW * 2 - 1, ny = 1 - sy / E.cssH * 2, d = D - z;
    return [nx * tx * d, ny * ty * d, z];
  }
  function bez(a, b, c, d, t) { const u = 1 - t; return [0, 1, 2].map(i => u * u * u * a[i] + 3 * u * u * t * b[i] + 3 * u * t * t * c[i] + t * t * t * d[i]); }

  /* ---- layout: measure the heading, then find room for the cards ---- */
  function measure(E) {
    const pr = E.pin.getBoundingClientRect();
    const beat = E.root.querySelector(".lp-beat");
    const br = beat.getBoundingClientRect();
    /* the words, not the whole column: the widest line of the heading/paragraph */
    let right = br.left - pr.left;
    beat.querySelectorAll("h1, p").forEach(el => {
      const rg = document.createRange(); rg.selectNodeContents(el);
      [...rg.getClientRects()].forEach(r => { right = Math.max(right, r.right - pr.left); });
    });
    const nav = document.querySelector(".nav__chip");
    let navB = nav ? nav.getBoundingClientRect().bottom - (pr.top + scrollY) : 140;
    /* on phones the credit line sits under the nav: keep the cards below it too */
    const cr = E.root.querySelector(".lp-credit");
    if (cr && E.SMALL) { const r = cr.getBoundingClientRect(); if (r.height) navB = Math.max(navB, r.bottom - pr.top); }
    return { l: br.left - pr.left, r: right, t: br.top - pr.top, b: br.bottom - pr.top, navB };
  }

  const sigOf = (E, m) => [m.r, m.t, m.b, m.navB, E.cssW, E.cssH].map(v => Math.round(v)).join(",");
  function relayout(E) {
    const m = measure(E), W = E.cssW, H = E.cssH, SMALL = E.SMALL || W < 560;
    const marginR = SMALL ? 16 : 30, top = Math.max(m.navB + (SMALL ? 14 : 26), H * .08);
    const ox = SMALL ? W * .5 : m.r + 72, oy = SMALL ? m.t - 26 : (m.t + m.b) / 2;
    const avail = W - marginR - (ox + 56);
    let mode = SMALL ? "one" : avail >= 2 * 216 + 36 ? "grid" : avail >= 216 ? "col" : "one";
    const cw = mode === "grid" ? Math.min(250, Math.floor((avail - 40) / 2)) : mode === "col" ? Math.min(250, avail) : Math.min(SMALL ? 200 : 250, W - 2 * marginR);
    people.forEach(P => { P.el.firstChild.style.width = cw + "px"; });
    const hs = people.map(P => P.el.firstChild.offsetHeight || 90);
    const slots = [];
    if (mode === "grid") {
      const cxB = W - marginR - cw / 2, gapC = Math.min(96, avail - 2 * cw), cxA = cxB - cw - gapC;
      const bot = H * .78, band = bot - top, stag = Math.min(64, band * .11);
      const colA = [0, 2, 4].filter(i => i < people.length), colB = [1, 3, 5].filter(i => i < people.length);
      const jx = [[0, 40, 6], [0, 18, -8]];
      [[colA, cxA, 0, jx[0]], [colB, cxB, stag, jx[1]]].forEach(([ids, cx, off, jj]) => {
        const sum = ids.reduce((s, i) => s + hs[i], 0);
        const gapV = Math.max(28, Math.min(96, (band - stag - sum) / Math.max(1, ids.length - 1)));
        const tot = sum + gapV * (ids.length - 1);
        let y = top + Math.max(0, (band - stag - tot) / 2) + off;
        ids.forEach((i, k) => { const x = Math.min(W - marginR - cw / 2, cx + jj[k]); slots[i] = { cx: x, cy: y + hs[i] / 2, node: [x - cw / 2 - 7, y + hs[i] / 2] }; y += hs[i] + gapV; });
      });
    } else if (mode === "col") {
      const cx = W - marginR - cw / 2, bot = H * .8, band = bot - top, gapV = 26;
      for (let g = 0; g < people.length; g += 3) {
        const ids = [g, g + 1, g + 2].filter(i => i < people.length);
        const tot = ids.reduce((s, i) => s + hs[i], 0) + gapV * (ids.length - 1);
        let y = top + Math.max(0, (band - tot) / 2);
        ids.forEach((i, k) => { slots[i] = { cx: cx + (k % 2 ? 0 : -18), cy: y + hs[i] / 2, node: [cx + (k % 2 ? 0 : -18) - cw / 2 - 7, y + hs[i] / 2] }; y += hs[i] + gapV; });
      }
    } else {
      /* one at a time: a fan of nodes above the words; each card sits just above its node */
      const bandB = SMALL ? m.t - 40 : m.t - 30;
      const maxH = Math.max(...hs);
      const nodeY0 = Math.min(bandB - 20, top + maxH + 24);
      const n = people.length;
      people.forEach((P, i) => {
        const f = n > 1 ? i / (n - 1) : .5;
        const nx = W * (.14 + .72 * f), ny = nodeY0 + Math.sin(f * Math.PI) * -18 + (i % 2) * 22;
        const cx = Math.min(W - marginR - cw / 2, Math.max(marginR + cw / 2, nx));
        slots[i] = { cx, cy: ny - 12 - hs[i] / 2, node: [nx, ny] };
      });
    }
    /* world geometry for the resting camera */
    const R = E.rng(11);
    const O = unproject(E, ox, oy, 0);
    const curves = [];
    people.forEach((P, i) => {
      const s = slots[i], z = (R() - .5) * 180;
      const N = unproject(E, s.node[0], s.node[1], z);
      const dx = N[0] - O[0], dy = N[1] - O[1];
      /* leave the light rising a little, then sweep out to the person */
      const c1 = [O[0] + dx * .38, O[1] + dy * .05 + Math.abs(dx) * .12 + (SMALL ? Math.abs(dy) * .25 : 0), O[2] + 60 + z * .3];
      const c2 = [N[0] - dx * .32, N[1] - dy * .12, N[2] + 30];
      const pts = []; for (let k = 0; k <= SEG; k++) pts.push(bez(O, c1, c2, N, k / SEG));
      P.curve = pts; P.node = N; P.slot = s; P.cardOff = [s.cx - s.node[0], s.cy - s.node[1]]; P.h = hs[i];
    });
    TR.upload(people.map(P => P.curve));
    L = { mode, O, ox, oy, cw, m, top, hz: SMALL ? Math.min(.62, (oy + 8) / H) : .745 };
    lastSig = sigOf(E, m);
    E.root.dataset.trailsMode = mode;
  }

  /* pulses: when each trail's light leaves Alpine, and when each card is shown */
  function schedule(E, t, i) {
    const n = people.length, mode = L.mode, TRAVEL = 1.7;
    if (mode === "grid") {
      const period = 8.4, first = .6 + i * .5;
      const k = Math.floor(Math.max(0, t - first) / period), t0 = first + k * period;
      const ph = t < first ? -1 : (t - t0) / TRAVEL;
      const since = t - (t0 + TRAVEL);
      const hit = since >= 0 ? Math.exp(-since * 1.4) : (k > 0 ? Math.exp(-(since + period) * 1.4) : 0);
      const show = E.ease.smooth((t - (first + TRAVEL - .25)) / .6);
      return { ph: ph >= 0 && ph <= 1.1 ? ph : -1, hit, show, vis: 1 };
    }
    /* cycling: each group's light leaves Alpine, the cards open as it arrives and stay
       until the next group's light arrives, so there is always someone on screen */
    const per = mode === "col" ? 3 : 1, groups = Math.ceil(n / per), P = mode === "col" ? 11 : 6.2, cyc = groups * P;
    const g = Math.floor(i / per), k2 = i % per;
    const raw = t - .3 - g * P;
    if (raw < 0) return { ph: -1, hit: 0, show: 0, vis: 0 };
    const local = raw % cyc, launch = k2 * .45, arrive = launch + TRAVEL, end = P + TRAVEL - .8;   /* gone before the next card opens in this slot */
    const ph = local >= launch && local <= launch + TRAVEL * 1.1 ? (local - launch) / TRAVEL : -1;
    const show = E.ease.smooth((local - arrive + .2) / .45) * (1 - E.ease.smooth((local - end) / .4));
    const hit = local >= arrive ? Math.exp(-(local - arrive) * 1.4) : 0;
    const vis = E.ease.smooth((local - launch + .3) / .5) * (1 - E.ease.smooth((local - end) / .6));
    return { ph, hit, show, vis };
  }

  NS.scenes.trails = {
    still: 0,
    async init(E) {
      people = verified().map(P => Object.assign({}, P));
      if (!people.length) throw new Error("trails: no verified quotes found on the page");
      SEG = E.SMALL ? 56 : 72;
      people.forEach(P => {
        P.el = E.label(`<span><b>${esc(P.name)}</b>“…${esc(P.phrase)}”</span>`, "card gold tr-card");
      });
      originLab = E.label("<span>Alpine Aviation</span>", "gold tr-origin");
      HF = await K.heightfield(E, "living/data/mhome.png", "living/data/mhome.json", 1.6);
      TER = K.terrain(E, HF, { n: E.SMALL ? 200 : 300, contour: 400, major: 1200, shadows: 6 });
      SKY = K.sky(E);
      BG = overlay(E);
      TR = trailGeometry(E);
      const nd = (E.SMALL ? 22 : 36);
      SP = K.sprites(E, 2 + people.length * (1 + nd));
      SP.nd = nd;
      relayout(E);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { lastSig = "fonts"; });
      NS.debug = { get L() { return L; }, people: () => people.map(P => ({ name: P.name, mode: L.mode, rect: P.el.firstChild.getBoundingClientRect().toJSON(), o: P.el.style.opacity })) };
    },
    resize(E) { relayout(E); },
    frame(E, S) {
      const gl = E.gl, e = E.ease;
      const t = E.REDUCED ? 9.3 : S.t;
      /* fonts arriving late can reflow the heading: re-measure now and then */
      if ((frameN++ % 30) === 0 && sigOf(E, measure(E)) !== lastSig) relayout(E);
      /* camera: resting at (0,0,D), with a slow drift and a little pointer parallax */
      const yaw = Math.sin(t * .071) * .028 + S.px * .02, pit = Math.sin(t * .053) * .018 - S.py * .014;
      const eye = [Math.sin(yaw) * D, Math.sin(pit) * D, Math.cos(yaw) * Math.cos(pit) * D];
      const proj = baseCam(E);
      const view = E.M.look(eye, [0, 0, 0], [0, 1, 0]);
      const vp = E.M.mul(proj, view);

      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      /* dusk just after sunset: the sun is below the horizon behind the camera */
      const A = K.atmos({ sunAz: Math.PI * .97, sunEl: -.035, sun: [2.2, 1.05, .42], zenith: [.008, .014, .042], horizon: [.40, .22, .12] });
      const yh = L.hz;
      const TC = terrainCam(E, t, S, yh);
      SKY.draw(A, TC.vp, TC.eye, t, { stars: .75, cloud: .18 });
      const oq = E.M.project(vp, L.O[0], L.O[1], L.O[2]);
      const cx = (L.ox + E.cssW) / 2;
      gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.SRC_ALPHA);
      BG.use().f2("uO", oq.x / E.cssH, 1 - oq.y / E.cssH).f2("uC", cx / E.cssH, 1 - (E.cssH * .42) / E.cssH).f1("uT", t).f1("uAsp", E.aspect).f1("uHz", 1 - yh);
      E.tri();
      gl.disable(gl.BLEND); gl.depthMask(true);
      const AG = Object.assign({}, A, { sunCol: [.55, .28, .11] });
      TER.draw(AG, TC.vp, TC.eye, t, { fog: 26000, glow: .3, shadows: false });
      gl.clear(gl.DEPTH_BUFFER_BIT);

      /* pulses and card states */
      const n = people.length, ph = new Float32Array(6).fill(-1), hit = new Float32Array(6), vis = new Float32Array(6).fill(1);
      const st = people.map((P, i) => {
        let s = schedule(E, t, i);
        if (E.REDUCED) {
          /* one still frame: every card that fits is shown, a few lights mid-flight */
          const on = L.mode === "grid" || (L.mode === "col" ? i < 3 : i === 0);
          s = { ph: on ? [.55, -1, .8, -1, .35, -1][i] : -1, hit: 0, show: on ? 1 : 0, vis: on ? 1 : 0 };
        }
        ph[i] = s.ph; hit[i] = s.hit; vis[i] = s.vis; return s;
      });
      TR.draw(vp, { width: E.SMALL ? 2.1 : 2.4, t, intensity: .9, ph, hit, vis });

      /* lights: the origin, the person nodes, and dust flowing out along each trail */
      const pxs = K.pxScale(E, FOV);
      let k = 0;
      const put = (p, c, s) => { SP.pos.set(p, k * 3); SP.col.set(c, k * 3); SP.size[k] = s; k++; };
      const breathe = 1 + .06 * Math.sin(t * 1.3);
      put(L.O, [2.8, 1.7, .7], 18 * breathe);
      put(L.O, [1.1, .66, .28], 58 * breathe);
      people.forEach((P, i) => {
        const s = st[i], v = .25 + .75 * s.vis;
        put(P.node, [1.6 * v * (1 + s.hit * 1.5), 1.15 * v * (1 + s.hit * 1.3), .55 * v * (1 + s.hit)], 9 * (1 + s.hit * .8));
        for (let j = 0; j < SP.nd; j++) {
          const r = ((j * 0.61803 + i * .37) % 1), sp = .045 + r * .05;
          const a = (r + t * sp) % 1, fi = Math.min(SEG - 1, Math.floor(a * SEG)), fr = a * SEG - fi;
          const p0 = P.curve[fi], p1 = P.curve[fi + 1];
          const jit = Math.sin(j * 12.9898 + i) * 7, jit2 = Math.cos(j * 78.233 + i) * 7;
          const w = Math.sin(a * Math.PI) * v * .9;
          const gold = e.smooth((a - .7) / .3) + (1 - e.smooth(a / .15));
          put([p0[0] + (p1[0] - p0[0]) * fr + jit * a, p0[1] + (p1[1] - p0[1]) * fr + jit2 * a, p0[2] + (p1[2] - p0[2]) * fr],
            [e.mix(.3, 1.3, gold) * w, e.mix(.55, .8, gold) * w, e.mix(1.2, .35, gold) * w], 1.8 + (j % 3) * .7);
        }
      });
      SP.upload(k);
      SP.draw(vp, pxs, { min: 1.2, max: 140, core: .8 });

      /* cards follow their nodes */
      people.forEach((P, i) => {
        const s = st[i], q = E.M.project(vp, P.node[0], P.node[1], P.node[2]);
        let x = q.x + P.cardOff[0], y = q.y + P.cardOff[1];
        if (L.mode === "one") { const hw = L.cw / 2 + (E.SMALL ? 16 : 30); x = Math.min(E.cssW - hw, Math.max(hw, x)); }
        const o = Math.max(0, Math.min(1, s.show));
        if (o < .01) { if (P.el._o !== 0) { P.el.style.opacity = 0; P.el.style.visibility = "hidden"; P.el._o = 0; } }
        else {
          P.el.style.visibility = "visible"; P.el.style.opacity = o.toFixed(3); P.el._o = o;
          P.el.style.transform = `translate3d(${x.toFixed(1)}px,${(y + (1 - o) * 10).toFixed(1)}px,0)`;
        }
        P.el.classList.toggle("tr-hit", s.hit > .35);
      });
      /* the origin's own label */
      const oo = E.ease.smooth((t - .3) / .8);
      originLab.style.opacity = (E.REDUCED ? 1 : oo).toFixed(3);
      originLab.style.transform = `translate3d(${oq.x.toFixed(1)}px,${oq.y.toFixed(1)}px,0)`;
    }
  };
})();
