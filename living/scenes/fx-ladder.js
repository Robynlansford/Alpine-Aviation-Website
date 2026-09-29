/* =====================================================================
   LADDER — figure (index #training, flight-instruction)
   "Every rating, one runway." A learning graph drawn as flight paths:
   one runway at the base; the helicopter path lifts straight into a
   hover and climbs through a glowing gate for each rating; the airplane
   path rolls down the runway and climbs through its own gates. A light
   flies each path and every gate it passes flashes.

   Data from the page (attributes on the .fx element):
     data-heli="Private Pilot|Commercial Pilot|Certified Flight Instructor"
     data-plane="Private|Commercial"         (any number of steps)
   Labels are the page's own words. Geometry is a diagram, not a map.
   ===================================================================== */
(function () {
  "use strict";
  const NS = window.LivingFX = window.LivingFX || { scenes: {} };
  const K = window.LivingKit;

  /* Catmull-Rom through control points, sampled evenly */
  function curve(ctrl, n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1) * (ctrl.length - 1), k = Math.min(ctrl.length - 2, f | 0), t = f - k;
      const p0 = ctrl[Math.max(0, k - 1)], p1 = ctrl[k], p2 = ctrl[k + 1], p3 = ctrl[Math.min(ctrl.length - 1, k + 2)];
      const t2 = t * t, t3 = t2 * t;
      out.push([0, 1, 2].map(j => .5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
    }
    /* re-parameterise by arc length */
    const d = [0]; for (let i = 1; i < out.length; i++) d.push(d[i - 1] + Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1], out[i][2] - out[i - 1][2]));
    const L = d[d.length - 1];
    return { pts: out, at(s) { const x = s * L; let i = 1; while (i < d.length - 1 && d[i] < x) i++; const t = (x - d[i - 1]) / Math.max(1e-6, d[i] - d[i - 1]); return out[i - 1].map((v, j) => v + (out[i][j] - v) * t); }, len: L };
  }
  function ring(c, dir, r, n) {
    /* circle of radius r around c, facing along dir */
    const l = Math.hypot(...dir), a = dir.map(v => v / l), up = Math.abs(a[1]) < .9 ? [0, 1, 0] : [1, 0, 0];
    let u = [a[1] * up[2] - a[2] * up[1], a[2] * up[0] - a[0] * up[2], a[0] * up[1] - a[1] * up[0]]; const ul = Math.hypot(...u); u = u.map(v => v / ul);
    const w = [a[1] * u[2] - a[2] * u[1], a[2] * u[0] - a[0] * u[2], a[0] * u[1] - a[1] * u[0]];
    const pts = []; for (let i = 0; i <= n; i++) { const t = i / n * Math.PI * 2, cs = Math.cos(t), sn = Math.sin(t); pts.push([c[0] + (u[0] * cs + w[0] * sn) * r, c[1] + (u[1] * cs + w[1] * sn) * r, c[2] + (u[2] * cs + w[2] * sn) * r]); }
    return pts;
  }

  NS.scenes.ladder = {
    still: 5.2,
    async init(E) {
      const el = E.root;
      const heli = (el.dataset.heli || "Private|Commercial|Instructor").split("|");
      const plane = (el.dataset.plane || "Private|Commercial").split("|");
      /* paths */
      const H = curve([[-3.2, 0, .9], [-3.2, .35, .9], [-3.1, .9, .7], [-2.2, 2.0, .1], [-.4, 3.1, -.8], [1.6, 4.2, -1.3], [3.6, 5.3, -1.2]], 220);
      const P = curve([[-5.4, 0, -.7], [-2.0, 0, -.7], [.6, .05, -.7], [2.4, .8, -.4], [4.2, 2.0, .4], [5.6, 3.3, 1.4]], 220);
      /* gates along each path (helicopter's first gate sits at the hover) */
      const hs = heli.map((_, i) => heli.length === 1 ? .5 : .16 + (.95 - .16) * i / (heli.length - 1));
      const ps = plane.map((_, i) => plane.length === 1 ? .6 : .52 + (.95 - .52) * i / (plane.length - 1));
      const dirAt = (C, s) => { const a = C.at(Math.max(0, s - .01)), b = C.at(Math.min(1, s + .01)); return [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; };
      this.gates = [];
      hs.forEach((s, i) => this.gates.push({ path: 0, s, pos: H.at(s), name: heli[i], ring: ring(H.at(s), dirAt(H, s), .38, 48) }));
      ps.forEach((s, i) => this.gates.push({ path: 1, s, pos: P.at(s), name: plane[i], ring: ring(P.at(s), dirAt(P, s), .32, 48) }));
      this.H = H; this.P = P;
      this.paths = K.ribbons(E, [{ pts: H.pts, id: 0 }, { pts: P.pts, id: 1 }]);
      this.gateR = K.ribbons(E, this.gates.map((g, i) => ({ pts: g.ring, id: i })));
      /* runway: edges, dashed centre line, threshold bars */
      const rw = [[[-6.2, 0, -1.25], [6.2, 0, -1.25]], [[-6.2, 0, -.15], [6.2, 0, -.15]]];
      for (let x = -5.6; x < 5.6; x += .9) rw.push([[x, 0, -.7], [x + .45, 0, -.7]]);
      for (let k = 0; k < 6; k++) { const z = -1.1 + k * .17; rw.push([[-6, 0, z], [-5.7, 0, z]]); }
      this.runway = K.ribbons(E, rw);
      /* ground grid that fades out */
      const grid = [];
      for (let i = -8; i <= 8; i++) { grid.push([[i, 0, -6], [i, 0, 6]]); grid.push([[-8, 0, i * .75], [8, 0, i * .75]]); }
      this.grid = K.ribbons(E, grid);
      /* altitude ticks on a mast at the right: "the ladder" */
      this.lights = K.sprites(E, 64);
      /* labels: the page's words */
      this.gates.forEach(g => { g.el = E.label(g.name, g.path === 0 ? "" : "gold"); });
      this.kHeli = E.label(el.dataset.heliLabel || "Helicopter", ""); this.kPlane = E.label(el.dataset.planeLabel || "Fixed-wing", "gold");
      E.post.bloom = 1.0; E.post.threshold = .75;
    },
    frame(E, S) {
      const gl = E.gl, t = S.t, e = E.ease;
      const az = -.38 + Math.sin(t * .09) * .16 + S.px * .12, el = .3 + S.py * -.05;
      const R = 12.2, tgt = [0, 2.1, 0];
      const eye = [tgt[0] + Math.sin(az) * R * Math.cos(el), tgt[1] + Math.sin(el) * R, tgt[2] + Math.cos(az) * R * Math.cos(el)];
      const fov = E.aspect < 1 ? 1.05 : .72;
      const proj = E.M.persp(fov, E.aspect, .1, 100);
      const vp = E.M.mul(proj, E.M.look(eye, tgt, [0, 1, 0]));
      const pxs = K.pxScale(E, fov);
      /* the flights loop: helicopter then airplane, staggered */
      const period = 9;
      const sH = ((t / period) % 1), sP = (((t + period * .45) / period) % 1);
      const flyH = e.smooth(sH / .06) * (1 - e.smooth((sH - .94) / .06)), flyP = e.smooth(sP / .06) * (1 - e.smooth((sP - .94) / .06));
      this.grid.draw(vp, { width: 1, color: [.05, .09, .18], intensity: .9, fadeD: 16 });
      this.runway.draw(vp, { width: 1.6, color: [.55, .45, .3], intensity: .9, fadeD: 30 });
      this.paths.draw(vp, { width: 2.4, color: [.35, .7, 1.6], color2: [1.4, 1.25, 1.05], idMix: 1, intensity: .55, t, pulse: .11, pulseLen: .06 });
      /* gates flash cream as the light passes */
      this.gates.forEach((g, i) => {
        const s = g.path === 0 ? sH : sP, on = g.path === 0 ? flyH : flyP;
        const hit = Math.exp(-Math.pow((s - g.s) / .018, 2)) * on;
        g.lit = Math.max(hit, (g.lit || 0) * Math.exp(-S.dt * 1.4));
        g.passed = s > g.s && on > .5;
      });
      const col = this.gates.map(g => g.path === 0 ? [.35 + g.lit * 1.2, .7 + g.lit * .9, 1.6 + g.lit * .2] : [1.4 + g.lit * .4, .95 + g.lit * .6, .4 + g.lit * .9]);
      /* draw gate rings individually so each can carry its own flash */
      this.gates.forEach((g, i) => { g.draw = true; });
      this.gateR.draw(vp, { width: 2.2, color: [.9, .85, .8], intensity: .55 + .5 * Math.max(...this.gates.map(g => g.lit)) });
      /* lights: gate cores, the two aircraft, runway edge lights */
      let k = 0; const L = this.lights;
      const put = (p, c, s) => { L.pos.set(p, k * 3); L.col.set(c, k * 3); L.size[k] = s; k++; };
      this.gates.forEach((g, i) => put(g.pos, col[i].map(v => v * (.5 + g.lit * 1.4)), .22 + g.lit * .25));
      const aH = this.H.at(sH), aP = this.P.at(sP);
      put(aH, [2.2 * flyH, 2.6 * flyH, 3.2 * flyH], .3); put(aP, [3 * flyP, 2.7 * flyP, 2.2 * flyP], .28);
      for (let x = -6.2; x <= 6.2; x += 1.24) { put([x, .02, -1.25], [.9, .6, .25], .09); put([x, .02, -.15], [.9, .6, .25], .09); }
      L.upload(k); L.draw(vp, pxs, { min: 1.5, max: 60, core: 1.2 });
      /* labels */
      this.gates.forEach(g => E.place(g.el, vp, [g.pos[0] + (g.path === 0 ? -.55 : .55), g.pos[1] + .62, g.pos[2]], .55 + .45 * Math.min(1, g.lit * 2 + (g.passed ? .6 : 0)), g.lit > .3));
      E.place(this.kHeli, vp, [-3.25, -.45, 1.2], .9); E.place(this.kPlane, vp, [-5.4, -.45, -.7], .9);
    }
  };
})();
