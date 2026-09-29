/* =====================================================================
   WORKING — commercial-services.html (live hero, no pin)
   "Working aircraft, working country." Dusk over the real Mountain Home
   high desert: a working helicopter orbits low over the flats, its
   rotor wash throwing up a ring of dust; wind streams across the desert
   in the last light; and the page's own four services stand as four lit
   waypoints on one glowing flight line draped over the terrain. A light
   pulse runs the line and each waypoint flares as it passes.

   Layout: the waypoints are placed where they should appear on screen
   (beside the headline on desktop, above it on phones) and raycast onto
   the real terrain, so the composition holds on any screen.

   REAL: terrain = USGS 3DEP (living/data/mhome.*), heights x1.6, contour
   lines at true 100 m / 500 m elevations. ILLUSTRATIVE: the helicopter
   (stylized), dust and wind, and the flight line + waypoints, which are a
   schematic (not a route, not real locations of the work).
   ===================================================================== */
(function () {
  "use strict";
  const NS = window.Living = window.Living || { scenes: {} };
  const K = window.LivingKit;
  const EXAG = 1.6;

  /* the four services, named exactly as on the page, in the page's order */
  const SERVICES = ["Helicopter Tours", "Flight Instruction/Training", "Agriculture & Ranching", "Pest Control / Livestock Management"];
  /* where each waypoint and the helicopter's work circle should sit on screen (NDC, y up) */
  const LAYOUT = {
    wide: { wp: [[.12, -.36], [.36, -.15], [.57, -.02], [.79, .08]], orb: [.36, -.74], alt: 650, pitch: .135 },
    tall: { wp: [[-.42, -.04], [.36, .08], [-.22, .2], [.38, .31]], orb: [.08, -.34], alt: 800, pitch: .2 }
  };

  let H, T, SKY, AC, LINE, RINGS, MARK, BEAMS, DUST, WIND, lineUV, wpAlong, ORB, wpW, wpD, L, EYE0, DIR0;
  const lab = [];
  let labSch, schW;

  function cr(pts, N) {
    const out = [], n = pts.length;
    for (let i = 0; i < N; i++) {
      const f = i / (N - 1) * (n - 1), k = Math.min(n - 2, f | 0), t = f - k;
      const p0 = pts[Math.max(0, k - 1)], p1 = pts[k], p2 = pts[k + 1], p3 = pts[Math.min(n - 1, k + 2)];
      const t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map(j => .5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
    }
    return out;
  }

  /* the camera: from the south-west over the flats, looking north-east toward the mountains,
     drifting a little from side to side */
  function camera(E, t, px, py) {
    const sw = Math.sin(t * .05), side = [-DIR0[1], DIR0[0]];
    const a = sw * .035, c = Math.cos(a), s = Math.sin(a);
    const d = [DIR0[0] * c - DIR0[1] * s, DIR0[0] * s + DIR0[1] * c];
    const eye = [EYE0[0] + side[0] * sw * 140 + px * 40, EYE0[1] - py * 30, EYE0[2] + side[1] * sw * 140];
    const cp = Math.cos(L.pitch), sp = Math.sin(L.pitch);
    const tgt = [eye[0] + d[0] * cp * 1000, eye[1] - sp * 1000, eye[2] + d[1] * cp * 1000];
    const FOV = E.aspect < 1 ? 1.15 : .86;
    const proj = E.M.persp(FOV, E.aspect, 4, 140000);
    if (E.SMALL) proj[9] = -.3; else proj[8] = -.25;
    const vp = E.M.mul(proj, E.M.look(eye, tgt, [0, 1, 0]));
    return { eye, vp, FOV };
  }
  /* screen point -> where that ray meets the real terrain */
  function pick(E, cam, nx, ny) {
    const inv = E.M.inv(cam.vp);
    const X = (x, y, z) => { const w = inv[3] * x + inv[7] * y + inv[11] * z + inv[15]; return [(inv[0] * x + inv[4] * y + inv[8] * z + inv[12]) / w, (inv[1] * x + inv[5] * y + inv[9] * z + inv[13]) / w, (inv[2] * x + inv[6] * y + inv[10] * z + inv[14]) / w]; };
    const a = X(nx, ny, -1), b = X(nx, ny, 1), l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const dir = [(b[0] - a[0]) / l, (b[1] - a[1]) / l, (b[2] - a[2]) / l];
    let lo = 0, hi = 0;
    for (let s = 20; s < 60000; s *= 1.03) { const p = [a[0] + dir[0] * s, a[1] + dir[1] * s, a[2] + dir[2] * s]; if (p[1] < T.hMesh(p[0], p[2])) { hi = s; break; } lo = s; }
    if (!hi) hi = lo;
    for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2, p = [a[0] + dir[0] * m, a[1] + dir[1] * m, a[2] + dir[2] * m]; if (p[1] < T.hMesh(p[0], p[2])) hi = m; else lo = m; }
    const p = [a[0] + dir[0] * hi, 0, a[2] + dir[2] * hi]; p[1] = T.hMesh(p[0], p[2]);
    return p;
  }

  NS.scenes.working = {
    still: 0,
    async init(E) {
      H = await K.heightfield(E, "living/data/mhome.png", "living/data/mhome.json", EXAG);
      T = K.terrain(E, H, { contour: 100, major: 500 });
      SKY = K.sky(E);
      AC = K.aircraft(E);
      L = E.SMALL || E.aspect < 1 ? LAYOUT.tall : LAYOUT.wide;

      EYE0 = H.world(.4, .8, 0); EYE0[1] = T.hMesh(EYE0[0], EYE0[2]) + L.alt;
      const look = H.world(.56, .5, 0), dl = Math.hypot(look[0] - EYE0[0], look[2] - EYE0[2]);
      DIR0 = [(look[0] - EYE0[0]) / dl, (look[2] - EYE0[2]) / dl];
      const cam0 = camera(E, 0, 0, 0);

      /* waypoints on the terrain where the layout wants them */
      wpW = L.wp.map(([x, y]) => pick(E, cam0, x, y));
      wpD = wpW.map(w => Math.hypot(w[0] - EYE0[0], w[1] - EYE0[1], w[2] - EYE0[2]));
      const WPUV = wpW.map(w => H.uvOf(w[0], w[2]));
      const oc = pick(E, cam0, L.orb[0], L.orb[1]);
      ORB = { c: [oc[0], oc[2]], r: Math.hypot(oc[0] - EYE0[0], oc[2] - EYE0[2]) * (E.SMALL ? .16 : .24) };

      /* one flight line through the four waypoints, running on past each end */
      const a = WPUV[0], b = WPUV[1], y = WPUV[3], z = WPUV[2];
      const ext0 = [a[0] - (b[0] - a[0]) * .95, a[1] - (b[1] - a[1]) * .95], ext1 = [y[0] + (y[0] - z[0]) * 1.2, y[1] + (y[1] - z[1]) * 1.2];
      const ctrl = [ext0, ...WPUV, ext1];
      lineUV = cr(ctrl, 500);
      const d = [0]; for (let i = 1; i < lineUV.length; i++) d.push(d[i - 1] + Math.hypot((lineUV[i][0] - lineUV[i - 1][0]) * H.sizeX, (lineUV[i][1] - lineUV[i - 1][1]) * H.sizeZ));
      const tot = d[d.length - 1];
      wpAlong = WPUV.map((_, k) => d[Math.round((k + 1) / (ctrl.length - 1) * 499)] / tot);
      LINE = K.ribbons(E, [lineUV], { draped: H, lift: 40 });

      /* each waypoint: two rings on the ground, a lit marker, a short beam; sized to its distance */
      const rings = [];
      WPUV.forEach(([u, v], i) => [1, 1.9].forEach(r => {
        const R = wpD[i] * .045 * r, ring = [];
        for (let k = 0; k <= 72; k++) { const an = k / 72 * Math.PI * 2; ring.push([u + Math.cos(an) * R / H.sizeX, v + Math.sin(an) * R / H.sizeZ]); }
        rings.push(ring);
      }));
      RINGS = K.ribbons(E, rings, { draped: H, lift: 8 });
      BEAMS = K.ribbons(E, wpW.map((w, i) => ({ pts: [[w[0], w[1] + wpD[i] * .012, w[2]], [w[0], w[1] + wpD[i] * .06, w[2]], [w[0], w[1] + wpD[i] * .1, w[2]]], id: i })));
      MARK = K.sprites(E, 8);
      wpW.forEach((w, i) => {
        MARK.pos.set([w[0], w[1] + wpD[i] * .012, w[2]], i * 3); MARK.size[i] = wpD[i] * .05;
        MARK.pos.set([w[0], w[1] + wpD[i] * .012, w[2]], (i + 4) * 3); MARK.size[i + 4] = wpD[i] * .016;
      });

      DUST = K.sprites(E, E.SMALL ? 220 : 420);
      WIND = K.sprites(E, E.SMALL ? 280 : 560);

      SERVICES.forEach((name, i) => lab.push({ el: E.label("<span>" + name.replace(/&/g, "&amp;") + "</span>", "gold"), w: [wpW[i][0], wpW[i][1] + wpD[i] * .1, wpW[i][2]] }));
      labSch = E.label("<span>Schematic · not a route</span>");
      /* the "schematic" note sits just under the line, between the second and third waypoints */
      const sm = lineUV[Math.round(((wpAlong[1] + wpAlong[2]) / 2) * 499)], sw0 = H.world(sm[0], sm[1], 0);
      schW = [sw0[0] + (EYE0[0] - sw0[0]) * .1, 0, sw0[2] + (EYE0[2] - sw0[2]) * .1]; schW[1] = T.hMesh(schW[0], schW[2]);
      NS.debug = { H, T, wpW, ORB, wpD };
    },

    frame(E, S) {
      const gl = E.gl, e = E.ease, t = S.t;
      const A = K.atmos({ sunAz: Math.PI * 1.06, sunEl: .045, sun: [2.3, 1.1, .42], zenith: [.011, .019, .052], horizon: [.44, .23, .11] });

      /* ---- helicopter: a low working orbit, dipping close to the ground on one side ---- */
      /* an ellipse stretched across the view, so the aircraft sweeps side to side at a steady distance */
      const ang = t * .2 + 2.2, sd = [-DIR0[1], DIR0[0]], ca = Math.cos(ang), sa = Math.sin(ang);
      const hx = ORB.c[0] + sd[0] * ca * ORB.r + DIR0[0] * sa * ORB.r * .3, hz = ORB.c[1] + sd[1] * ca * ORB.r + DIR0[1] * sa * ORB.r * .3;
      const low = Math.pow(.5 + .5 * Math.sin(ang - 1.1), 3);             /* 0 high .. 1 lowest */
      const hd = Math.hypot(EYE0[0] - hx, EYE0[2] - hz), SC = Math.min(9, Math.max(1, hd / 150));
      const agl = e.mix(26, 1.6, low) * SC;                               /* in model heights: ~26 m high, skimming low */
      const hp = [hx, T.hMesh(hx, hz) + agl, hz];
      const tv = [-sd[0] * sa + DIR0[0] * ca * .3, -sd[1] * sa + DIR0[1] * ca * .3], tl = Math.hypot(tv[0], tv[1]);
      const tan = [tv[0] / tl, tv[1] / tl];                                /* direction of travel */
      const yaw = Math.atan2(-tan[0], -tan[1]);

      const { eye, vp, FOV } = camera(E, t, S.px, S.py);
      const pxs = K.pxScale(E, FOV);

      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      SKY.draw(A, vp, eye, t, { stars: .25, cloud: .4 });
      T.draw(A, vp, eye, t, { fog: 32000, glow: .42, shadows: true });

      /* flight line: a pulse runs out along it; each waypoint flares as the pulse reaches it */
      const PS = .05, ph = (t * PS) % 1;
      LINE.draw(vp, { width: 2.6, color: [.34, .68, 1.55], intensity: .8, t, pulse: PS, pulseLen: .06, fadeD: 90000 });
      const flare = wpAlong.map(a => { const dd = ((ph - a) % 1 + 1) % 1; return dd < .5 ? Math.exp(-dd * 12) : 0; });
      RINGS.draw(vp, { width: 1.5, color: [1.3, .82, .36], intensity: .42, t, pulse: .12, pulseLen: .25 });
      BEAMS.draw(vp, { width: 1.8, color: [1.3, .85, .4], intensity: .5, t, pulse: .4, pulseLen: .3 });
      for (let i = 0; i < 4; i++) {
        const f = flare[i];
        MARK.col.set([1.5 + f * 1.4, .95 + f * 1.3, .45 + f * 1.2], i * 3);
        MARK.col.set([1.6 + f, 1.55 + f, 1.4 + f], (i + 4) * 3);
        MARK.size[i] = wpD[i] * .05 * (1 + .08 * Math.sin(t * 2 + i) + f * .6);
      }
      MARK.upload(); MARK.draw(vp, pxs, { min: 3, max: 40, core: 1.4 });

      /* wind: dust motes streaming across the flats from the west-south-west, catching the low sun */
      {
        const R = E.rng(21), n = WIND.n, span = ORB.r * 16, wdir = [.93, -.36];
        const cx = (ORB.c[0] + wpW[1][0]) / 2, cz = (ORB.c[1] + wpW[1][2]) / 2;
        for (let i = 0; i < n; i++) {
          const ox = (R() - .5) * span, oz = (R() - .5) * span, sp = 60 + R() * 80, life = span / sp;
          const ag = ((t + R() * life) % life) / life;
          const x = cx + ox + wdir[0] * (ag - .5) * span * .8, z = cz + oz + wdir[1] * (ag - .5) * span * .8;
          WIND.pos.set([x, T.hMesh(x, z) + 4 + R() * 40 + Math.sin(t * .8 + i) * 4, z], i * 3);
          const b = Math.sin(Math.PI * ag) * (.3 + R() * .45);
          WIND.col.set([1.2 * b, .7 * b, .32 * b], i * 3); WIND.size[i] = 3 + R() * 5;
        }
        WIND.upload(); WIND.draw(vp, pxs, { min: .9, max: 4, core: .4 });
      }
      /* rotor wash: a ring of dust thrown out when the helicopter works low */
      const dk = e.smooth((low - .4) / .4);
      if (dk > .01) {
        const R = E.rng(3); let k = 0;
        for (let i = 0; i < DUST.n; i++) {
          const a = R() * Math.PI * 2, sp = 6 + R() * 12, life = 1.4 + R() * 1.4, age = ((t * .9 + R() * life) % life) / life;
          const r = (5 + sp * age * life * (1 - age * .3)) * SC;
          const x = hp[0] + Math.cos(a) * r, z = hp[2] + Math.sin(a) * r;
          DUST.pos.set([x, T.hMesh(x, z) + (.6 + age * age * 6 + R() * 1.5) * SC, z], k * 3);
          const b = (1 - age) * (1 - age) * dk * (.25 + R() * .3);
          DUST.col.set([1.2 * b, .72 * b, .34 * b], k * 3); DUST.size[k] = (1.1 + R() * 1.4) * SC; k++;
        }
        DUST.upload(k); DUST.draw(vp, pxs, { min: 1, max: 10, core: .35 });
      }

      /* the helicopter: ice-blue airframe, warm cabin (someone at work), banked into its turn */
      const dist = Math.hypot(eye[0] - hp[0], eye[1] - hp[1], eye[2] - hp[2]);
      const sc = Math.min(9, Math.max(1, dist / 150));             /* far away: keep it readable as a glowing mark */
      AC.draw(A, vp, eye, { M: E.M.trs(hp[0], hp[1], hp[2], yaw, -.07, .3, sc), kind: "heli", spin: t * 44, rate: 1, cabin: 1, cabinCol: [1.6, .95, .4], rim: [.5, .9, 1.7], rotorI: 1.4, t, fog: 80000, pxScale: pxs, lightSize: 1.3 * Math.min(3, sc) });

      /* labels */
      lab.forEach((l, i) => E.place(l.el, vp, l.w, .8 + .2 * flare[i], { clamp: true }));
      E.place(labSch, vp, schW, .75);
    }
  };
})();
