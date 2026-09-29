/* =====================================================================
   FX-PATHS — financial-options.html, "Getting started" (figure)
   The page's own two ways in, drawn as two lit routes on a quiet
   contour ground:
     - "Apply with Stratus Financial": the direct route
     - "reach out to us first": the longer route, through a waypoint
   Both converge on "Getting started". The person (gold) sets out on
   both at once; each arrival lights the end point cream-white.
   Hovering or focusing either real button below brightens its route.
   Light roles: ice = the route, gold = the person, cream = the moment
   it works. Illustration: no amounts, no times, no steps invented.
   ===================================================================== */
(function () {
  "use strict";
  const NS = window.LivingFX = window.LivingFX || { scenes: {} };
  const K = window.LivingKit;

  const PERIOD = 6.2, T0 = 2.2, SPEED = 30;      /* world units per second, the same on both routes */
  let R, portrait = false, rA, rB, rings, GROUND, HEADS, NODES, lab = {}, pA, pB, S0, F0, W0;
  const hot = { a: 0, b: 0, ta: 0, tb: 0 };

  function bez(p0, p1, p2, p3, n) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
      out.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], .4, a * p0[2] + b * p1[2] + c * p2[2] + d * p3[2]]);
    }
    return out;
  }
  /* arc-length lookup so the light moves at an even pace */
  function measure(pts) {
    const d = [0]; for (let i = 1; i < pts.length; i++) d.push(d[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]));
    return { pts, d, L: d[d.length - 1] };
  }
  function along(P, u) {
    const s = Math.min(1, Math.max(0, u)) * P.L; let i = 1; while (i < P.d.length - 1 && P.d[i] < s) i++;
    const a = P.pts[i - 1], b = P.pts[i], k = (s - P.d[i - 1]) / Math.max(1e-6, P.d[i] - P.d[i - 1]);
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  }
  const rot = p => portrait ? [-p[2], p[1], p[0]] : p;          /* portrait: start at the top, end at the bottom */
  function ring(c, r) { const o = []; for (let i = 0; i <= 64; i++) { const a = i / 64 * Math.PI * 2; o.push([c[0] + Math.cos(a) * r, .3, c[2] + Math.sin(a) * r]); } return o; }

  /* one route in, a fork, two ways through, one route out */
  function build(E) {
    portrait = E.aspect < 1;
    const S = [-54, 0, 2], FK = [-31, 0, 2], J = [31, 0, 2], F = [54, 0, 2], W = [0, 0, 25];
    S0 = rot(S); F0 = rot(F); W0 = rot(W);
    const stemIn = bez(S, [-46, 0, 2], [-39, 0, 2], FK, 16), stemOut = bez(J, [39, 0, 2], [46, 0, 2], F, 16);
    const a = stemIn.concat(bez(FK, [-14, 0, -7], [14, 0, -7], J, 70).slice(1), stemOut.slice(1)).map(rot);
    const b = stemIn.concat(bez(FK, [-25, 0, 17], [-15, 0, 25], W, 40).slice(1), bez(W, [15, 0, 25], [25, 0, 17], J, 40).slice(1), stemOut.slice(1)).map(rot);
    pA = measure(a); pB = measure(b);
    rA = K.ribbons(E, [a]); rB = K.ribbons(E, [b]);
    rings = { s: K.ribbons(E, [ring(S0, 3.6)]), f: K.ribbons(E, [ring(F0, 4.2), ring(F0, 7.5)]), w: K.ribbons(E, [ring(W0, 2.6)]) };
  }

  NS.scenes["fx-paths"] = {
    still: 4.3,
    async init(E) {
      R = E;
      GROUND = E.program(`#version 300 es
precision highp float; in vec2 p; uniform mat4 uVP; out vec2 vW;
void main(){ vW = p * vec2(80., 56.); gl_Position = uVP * vec4(vW.x, 0., vW.y, 1.); }`, `#version 300 es
precision highp float; in vec2 vW; out vec4 o; uniform float uT, uA;
${K.GLSL.hash}
${K.GLSL.noise}
void main(){
  float h = fbm(vW * .014 + vec2(3.1, 7.7)) * 7.;
  float fw = max(length(vec2(dFdx(h), dFdy(h))), 1e-4);
  float d = abs(fract(h - .5) - .5) / fw;
  float line = (1. - smoothstep(.3, 1.2, d)) * (1. - smoothstep(.12, .4, fw));
  float r = length(vW / vec2(80., 56.));
  float fade = 1. - smoothstep(.35, .95, r);
  o = vec4(vec3(.075, .12, .22) * line * fade * uA, 1.);
}`);
      /* the ground quad is the engine's full-screen triangle, scaled in the vertex shader */
      HEADS = K.sprites(E, 14);
      NODES = K.sprites(E, 3);
      build(E);
      lab.a = E.label("Apply with Stratus Financial");
      lab.b = E.label("reach out to us first");
      lab.f = E.label("Getting started", "gold");
      /* the real buttons below the figure brighten their route */
      const sec = E.root.closest("section") || document;
      sec.querySelectorAll("a.btn").forEach(btn => {
        const k = /stratus/i.test(btn.href) ? "ta" : /contact/i.test(btn.getAttribute("href") || "") ? "tb" : null;
        if (!k) return;
        const on = () => { hot[k] = 1; }, off = () => { hot[k] = 0; };
        btn.addEventListener("pointerenter", on); btn.addEventListener("pointerleave", off);
        btn.addEventListener("focus", on); btn.addEventListener("blur", off);
      });
      E.post.threshold = .95; E.post.bloom = .72; E.post.edge = .12;
    },
    frame(E, S) {
      const gl = E.gl, t = S.t, e = E.ease;
      if ((E.aspect < 1) !== portrait) build(E);
      hot.a += (hot.ta - hot.a) * (1 - Math.exp(-S.dt * 6)); hot.b += (hot.tb - hot.b) * (1 - Math.exp(-S.dt * 6));
      if (E.REDUCED) { hot.a = hot.ta; hot.b = hot.tb; }

      /* camera: a low look across the ground, drifting a little */
      const sway = Math.sin(t * .17) * .06 + S.px * .05;
      const dist = portrait ? 126 : 100, height = portrait ? 96 : 59;
      const eye = [Math.sin(sway) * dist * .35, height - S.py * 4, Math.cos(sway) * dist];
      const FOV = portrait ? .78 : .52;
      const proj = E.M.persp(FOV, E.aspect, 1, 800);
      const view = E.M.look(eye, [portrait ? -3 : 0, 0, portrait ? 13 : 7], [0, 1, 0]);
      const vp = E.M.mul(proj, view);
      const pxs = K.pxScale(E, FOV);

      /* ground */
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
      GROUND.use().m4("uVP", vp).f1("uT", t).f1("uA", e.smooth(t / 1.4));
      E.tri();

      /* routes draw in, then stay lit */
      const rev = e.smooth((t - .3) / 1.7);
      const ice = [.32, .62, 1.35], gold = [1.5, .95, .38];
      const colA = ice.map((v, i) => e.mix(v, gold[i], hot.a * .6)), colB = ice.map((v, i) => e.mix(v, gold[i], hot.b * .6));
      rA.draw(vp, { width: 9, color: colA, intensity: .07 + hot.a * .08, reveal: rev });
      rB.draw(vp, { width: 9, color: colB, intensity: .07 + hot.b * .08, reveal: rev });
      rA.draw(vp, { width: 2 + hot.a, color: colA, intensity: .8 + hot.a * .6, reveal: rev, t, pulse: .16, pulseLen: .05 });
      rB.draw(vp, { width: 2 + hot.b, color: colB, intensity: .8 + hot.b * .6, reveal: rev, t, pulse: .12, pulseLen: .05 });
      const rk = e.smooth((t - 1.4) / .8);
      if (rk > .01) {
        rings.s.draw(vp, { width: 1.6, color: gold, intensity: rk * (.55 + .2 * Math.sin(t * 1.7)) });
        rings.w.draw(vp, { width: 1.3, color: ice, intensity: rk * .5 });
      }

      /* the person sets out on both routes at once; the direct one arrives first, the other a little later */
      let k = 0, flash = 0;
      const cyc = Math.floor((t - T0) / PERIOD);
      for (let c = Math.max(0, cyc - 1); c <= cyc; c++) {
        const dep = T0 + c * PERIOD;
        [pA, pB].forEach(P => {
          const dur = P.L / SPEED, u = (t - dep) / dur;
          const since = t - dep - dur;
          if (since > 0 && since < 1.8) flash = Math.max(flash, Math.exp(-since * 2.4));
          if (u < 0 || u > 1) return;
          const fade = e.smooth(u / .06) * (1 - e.smooth((u - .97) / .03));
          for (let j = 0; j < 7 && k < HEADS.n; j++) {
            const uj = u - j * .014; if (uj < 0) break;
            const q = along(P, uj);
            HEADS.pos.set([q[0], q[1] + .2, q[2]], k * 3);
            const b = fade * (j === 0 ? 1 : .55 * Math.pow(1 - j / 7, 1.6));
            HEADS.col.set([1.9 * b, 1.2 * b, .5 * b], k * 3); HEADS.size[k] = j === 0 ? 2.6 : 1.8; k++;
          }
        });
      }
      if (k) { HEADS.upload(k); HEADS.draw(vp, pxs, { min: 2, max: 22, core: 1.6 }); }

      /* nodes: you (gold), the waypoint (ice), getting started (cream, lights on arrival) */
      const nk = e.smooth((t - 1.2) / .9);
      NODES.pos.set([S0[0], .6, S0[2]], 0); NODES.col.set(gold.map(v => v * nk * 1.2), 0); NODES.size[0] = 4.2;
      NODES.pos.set([W0[0], .6, W0[2]], 3); NODES.col.set(ice.map(v => v * nk * .9), 3); NODES.size[1] = 2.4;
      const fc = (.9 + flash * 2.2) * nk;
      NODES.pos.set([F0[0], .6, F0[2]], 6); NODES.col.set([1.5 * fc, 1.38 * fc, 1.15 * fc], 6); NODES.size[2] = 5 + flash * 5;
      NODES.upload(3); NODES.draw(vp, pxs, { min: 3, max: 60, core: 1.8 });
      if (rk > .01) rings.f.draw(vp, { width: 1.6, color: [1.4, 1.3, 1.05], intensity: rk * (.5 + flash * 1.4) });

      /* labels: the page's own words */
      const lk = e.smooth((t - 1.6) / .9);
      E.place(lab.a, vp, rot(portrait ? [0, 1, -25] : [0, 1, -14]), lk, hot.a > .5);
      E.place(lab.b, vp, rot(portrait ? [0, 1, 43] : [0, 1, 34]), lk, hot.b > .5);
      E.place(lab.f, vp, rot(portrait ? [64, 1, 2] : [54, 1, 14]), lk, flash > .2);
    }
  };
})();
