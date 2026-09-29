/* =====================================================================
   ASCENT — flight-instruction.html (pinned scroll film, the signature)
   "From first hover to career pilot." The page's own ladder, flown:
     0  a training helicopter on a dusk helipad; the rotor spins up
     1  first hover: rotor wash throws the desert dust into a gold ring   (PPL-H)
     2  climb-out over the real Mountain Home high desert; the wind drawn
        as glowing lines riding the terrain                              (CPL-H)
     3  a second helicopter joins: you, instructing; a gold trail follows (CFI-H)
     4  an airplane overtakes and peels away on its own trail             (fixed-wing)
     5  wide over the terrain at last light, every path still glowing    (start)

   REAL: terrain = USGS 3DEP (living/data/mhome.*), heights x1.6, contour
   lines at true 50 m / 250 m elevations. ILLUSTRATIVE: the aircraft
   (stylized, not a specific airframe), the pad, the wind field, the route.
   ===================================================================== */
(function () {
  "use strict";
  const NS = window.Living = window.Living || { scenes: {} };
  const K = window.LivingKit;
  const EXAG = 1.6;

  let H, T, SKY, AC, WIND, TRAILS, PAD, DUST, STARS, MS, path, fwd, P0;
  const lab = {};

  /* smooth terrain-following path, precomputed */
  function buildPath() {
    const u0 = 0.4564, v0 = 0.6132;                  /* near Mountain Home Municipal Airport (OSM) */
    const [x0, , z0] = H.world(u0, v0);
    /* heading toward the high country to the north-east */
    const tx = (0.80 - .5) * H.sizeX, tz = (0.34 - .5) * H.sizeZ;
    const d = Math.hypot(tx - x0, tz - z0); fwd = [(tx - x0) / d, (tz - z0) / d];
    const side = [-fwd[1], fwd[0]];
    P0 = [x0, T.hMesh(x0, z0), z0];
    /* ground track: gentle S-curve, 0 -> 21 km */
    const N = 700, pts = [];
    for (let i = 0; i < N; i++) {
      const s = i / (N - 1);
      const along = 21000 * Math.pow(s, 1.25);
      const lat = Math.sin(s * Math.PI * 1.3) * 2200 * s;
      const x = x0 + fwd[0] * along + side[0] * lat, z = z0 + fwd[1] * along + side[1] * lat;
      pts.push({ x, z, g: T.hMesh(x, z) });
    }
    /* smooth the ground under the track so the climb doesn't twitch over every ridge */
    const sm = pts.map((q, i) => { let s = 0, w = 0; for (let k = -18; k <= 18; k++) { const j = Math.min(N - 1, Math.max(0, i + k)); const ww = 1 - Math.abs(k) / 19; s += Math.max(pts[j].g, q.g) * ww; w += ww; } return s / w; });
    pts.forEach((q, i) => { const s = i / (N - 1); q.y = Math.max(sm[i], q.g) + 3.5 + 420 * Math.pow(Math.min(1, s * 1.6), 1.4) + 260 * s; });
    return pts;
  }
  /* position on the path, s in 0..1 */
  function onPath(s) {
    const N = path.length, f = Math.min(N - 1.001, Math.max(0, s * (N - 1))), i = f | 0, t = f - i;
    const a = path[i], b = path[i + 1];
    return [a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t];
  }
  function headingAt(s) { const a = onPath(Math.max(0, s - .004)), b = onPath(Math.min(1, s + .004)); const dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; }
  const yawOf = d => Math.atan2(-d[0], -d[1]);

  /* the flight's timeline on scroll progress p */
  const T_HOVER = .19, T_UP = .34, T_GO = .38;
  function pathS(p) { return p < T_GO ? 0 : Math.pow((p - T_GO) / (1 - T_GO), 1.15); }

  function heliState(E, p) {
    const e = E.ease;
    if (p < T_GO) {
      const lift = e.smooth((p - T_HOVER) / (T_UP - T_HOVER)) * 3.5;
      return { pos: [P0[0], P0[1] + lift, P0[2]], yaw: yawOf(fwd), pitch: 0, roll: 0, s: 0 };
    }
    const s = pathS(p), pos = onPath(s), h = headingAt(s), h2 = headingAt(Math.min(1, s + .02));
    const turn = Math.atan2(h[0] * h2[1] - h[1] * h2[0], h[0] * h2[0] + h[1] * h2[1]);
    const accel = e.smooth((p - T_GO) / .08);
    return { pos, yaw: yawOf(h), pitch: -.1 * accel, roll: Math.max(-.5, Math.min(.5, -turn * 9)), s };
  }

  function wind() {
    /* streamlines over the corridor: westerly wind projected onto the terrain surface */
    const lines = [], R = E0.rng(7);
    const cx = P0[0] + fwd[0] * 9000, cz = P0[2] + fwd[1] * 9000;
    for (let k = 0; k < (E0.SMALL ? 70 : 130); k++) {
      let x = cx + (R() - .5) * 30000, z = cz + (R() - .5) * 30000;
      const pts = [];
      for (let i = 0; i < 70; i++) {
        const [u, v] = H.uvOf(x, z);
        if (u < .01 || u > .99 || v < .01 || v > .99) break;
        pts.push([u, v]);
        const e = 420, gx = (H.hAt(x + e, z) - H.hAt(x - e, z)) / (2 * e), gz = (H.hAt(x, z + e) - H.hAt(x, z - e)) / (2 * e);
        /* wind from the west-south-west, deflected around rising ground */
        let wx = 1, wz = -.25;
        wx -= gx * 3.2; wz -= gz * 3.2;
        const l = Math.hypot(wx, wz) || 1; x += wx / l * 170; z += wz / l * 170;
      }
      if (pts.length > 12) lines.push({ pts, id: k });
    }
    return lines;
  }

  let E0;
  NS.scenes.ascent = {
    still: .46,
    async init(E) {
      E0 = E;
      H = await K.heightfield(E, "living/data/mhome.png", "living/data/mhome.json", EXAG);
      T = K.terrain(E, H, { contour: 100, major: 500 });
      SKY = K.sky(E);
      AC = K.aircraft(E);
      path = buildPath();
      WIND = K.ribbons(E, wind(), { draped: H, lift: 140 });

      /* trails: sampled from the flight paths */
      const lead = [], wing = [], plane = [];
      for (let i = 0; i <= 260; i++) {
        const p = T_GO + (1 - T_GO) * i / 260;
        lead.push(heliState(E, p).pos);
      }
      for (let i = 0; i <= 200; i++) { const p = .6 + .4 * i / 200; wing.push(studentPos(E, p)); }
      for (let i = 0; i <= 240; i++) { const p = .72 + .28 * i / 240; plane.push(planeState(E, p).pos); }
      TRAILS = {
        lead: K.ribbons(E, [lead]), wing: K.ribbons(E, [wing]), plane: K.ribbons(E, [plane])
      };
      /* helipad: a ring and an H laid on the ground */
      const pad = [], y = P0[1] + .06, r = 7.5, ring = [];
      for (let i = 0; i <= 64; i++) { const a = i / 64 * Math.PI * 2; ring.push([P0[0] + Math.cos(a) * r, y, P0[2] + Math.sin(a) * r]); }
      pad.push(ring);
      const f = fwd, sd = [-fwd[1], fwd[0]];
      const at = (a, b) => [P0[0] + f[0] * a + sd[0] * b, y, P0[2] + f[1] * a + sd[1] * b];
      pad.push([at(-2.6, -1.6), at(2.6, -1.6)], [at(-2.6, 1.6), at(2.6, 1.6)], [at(0, -1.6), at(0, 1.6)]);
      const ring2 = []; for (let i = 0; i <= 64; i++) { const a = i / 64 * Math.PI * 2; ring2.push([P0[0] + Math.cos(a) * (r + 3.5), y, P0[2] + Math.sin(a) * (r + 3.5)]); }
      pad.push(ring2);
      PAD = K.ribbons(E, pad);
      DUST = K.sprites(E, 420);
      /* runway-edge style lights around the pad */
      STARS = K.sprites(E, 16);
      for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; STARS.pos.set([P0[0] + Math.cos(a) * 13, P0[1] + .35, P0[2] + Math.sin(a) * 13], i * 3); STARS.col.set(i % 2 ? [1.6, 1.0, .35] : [.5, .9, 1.8], i * 3); STARS.size[i] = .5; }
      STARS.upload();

      NS.debug = { H, T, get P0() { return P0; }, heliState: p => heliState(E, p), studentPos: p => studentPos(E, p), planeState: p => planeState(E, p), onPath, fwd };
      lab.hover = E.label("<span>First hover</span>", "gold");
      lab.terrain = E.label("<span>Real terrain · Mountain Home, ID</span>");
      lab.wind = E.label("<span>Wind over the ridges</span>");
      lab.you = E.label("<span>You · instructing</span>", "gold");
      lab.student = E.label("<span>Your student</span>");
      lab.plane = E.label("<span>Fixed-wing</span>");
      /* the finale turns the flight into a map of the ladder: one beacon per rating */
      MS = K.sprites(E, 4);
      const msAt = [[P0[0], P0[1] + 4, P0[2]], heliState(E, .47).pos, heliState(E, .68).pos, planeState(E, .9).pos];
      msAt.forEach((w, i) => { MS.pos.set(w, i * 3); MS.col.set(i === 3 ? [1.6, 1.55, 1.45] : [1.7, 1.05, .4], i * 3); MS.size[i] = 150; });
      MS.upload();
      lab.ms = ["01 · Private", "02 · Commercial", "03 · Instructor", "Fixed-wing"].map((t, i) => ({ el: E.label("<span>" + t + "</span>", i === 3 ? "" : "gold"), w: [msAt[i][0], msAt[i][1] + 220, msAt[i][2]] }));
    },
    frame(E, S) {
      const gl = E.gl, e = E.ease, p = S.p, t = S.t;
      /* dusk deepens as you scroll */
      const A = K.atmos({ sunAz: Math.PI * .955, sunEl: e.mix(.075, -.015, e.smooth(p)), sun: [2.5, 1.2, .45].map(v => v * e.mix(1, .55, e.smooth((p - .6) / .4))),
        zenith: [.010, .018, .05], horizon: [.44, .24, .11].map(v => v * e.mix(1, .6, e.smooth((p - .5) / .5))) });

      const hs = heliState(E, p);
      const hp = hs.pos;
      /* ---- camera ---- */
      const hh = p < T_GO ? fwd : headingAt(hs.s);
      const sd = [-hh[1], hh[0]];
      /* pad cameras (world) */
      const padEye = [P0[0] - fwd[0] * 4 + sd[0] * 15.5, P0[1] + 2.1, P0[2] - fwd[1] * 4 + sd[1] * 15.5];
      const orbit = e.smooth((p - .12) / .28) * 1.05;
      const oc = Math.cos(orbit), os = Math.sin(orbit);
      const rel = [padEye[0] - P0[0], padEye[2] - P0[2]];
      const padEye2 = [P0[0] + rel[0] * oc - rel[1] * os, P0[1] + 2.1 + e.smooth((p - .2) / .15) * 1.2, P0[2] + rel[0] * os + rel[1] * oc];
      let eye = padEye2, tgt = [hp[0], hp[1] + 1.6, hp[2]];
      /* chase: behind, above, pulling back */
      const k1 = e.smooth((p - .36) / .12);
      if (k1 > 0) {
        /* chase through the climb, swing out beside the formation, then pull away for the airplane */
        const back = e.mix(24, 38, e.smooth((p - .38) / .18)) + e.mix(0, 12, e.smooth((p - .58) / .1)) + e.mix(0, 520, e.smooth((p - .845) / .1));
        const up = e.mix(6, 16, e.smooth((p - .38) / .18)) + e.mix(0, -4, e.smooth((p - .58) / .1)) + e.mix(0, 190, e.smooth((p - .845) / .1));
        const lat = e.mix(9, 20, e.smooth((p - .42) / .16)) + e.mix(0, 16, e.smooth((p - .58) / .1)) + e.mix(0, 160, e.smooth((p - .845) / .1));
        const ce = [hp[0] - hh[0] * back + sd[0] * lat, hp[1] + up, hp[2] - hh[1] * back + sd[1] * lat];
        eye = eye.map((v, i) => e.mix(v, ce[i], k1));
        /* aim at the helicopter (between the two while they fly together); the lens shift places it beside the words */
        const pair = e.pulse(p, .64, .69, .77, .81);
        const sp0 = p > .58 ? studentPos(E, p) : hp;
        const ct = [e.mix(hp[0], (hp[0] + sp0[0]) / 2, pair) + hh[0] * 8, e.mix(hp[1], (hp[1] + sp0[1]) / 2, pair) + 1, e.mix(hp[2], (hp[2] + sp0[2]) / 2, pair) + hh[1] * 8];
        const pl = e.pulse(p, .77, .8, .835, .86);
        if (pl > 0) { const pp = planeState(E, p).pos; for (let i = 0; i < 3; i++) ct[i] = e.mix(ct[i], (hp[i] + pp[i]) / 2, pl * .45); }
        tgt = tgt.map((v, i) => e.mix(v, ct[i], k1));
      }
      /* wide: the whole journey laid out */
      const k2 = e.smooth((p - .86) / .12);
      if (k2 > 0) {
        const mid = onPath(.55);
        const we = [P0[0] - fwd[0] * 5000 + sd[0] * -9000, P0[1] + 5200, P0[2] - fwd[1] * 5000 + sd[1] * -9000];
        const wt = [mid[0] + fwd[0] * 4000, mid[1] - 400, mid[2] + fwd[1] * 4000];
        const ww = e.smooth((p - .88) / .1);
        eye = eye.map((v, i) => e.mix(v, e.mix(v, we[i], ww), k2));
        tgt = tgt.map((v, i) => e.mix(v, e.mix(v, wt[i], ww), k2));
      }
      /* keep the camera above the ground */
      const gnd = T.hMesh(eye[0], eye[2]) + (p < T_GO ? 1.2 : 30);
      if (eye[1] < gnd) eye[1] = gnd;
      if (NS.debug && NS.debug.eyeLift) eye[1] += NS.debug.eyeLift;
      /* gentle handheld drift + pointer parallax */
      eye = [eye[0] + Math.sin(t * .31) * .15 + S.px * .6, eye[1] + Math.sin(t * .23) * .1 - S.py * .3, eye[2] + Math.cos(t * .27) * .15];

      const near = p < .45 ? .5 : e.mix(2, 20, e.smooth((p - .45) / .4));
      const FOV = E.aspect < 1 ? 1.22 : .9;
      const proj = E.M.persp(FOV, E.aspect, near, 90000);
      /* lens shift: aircraft sits right of the words (desktop) or above them (phone) */
      if (E.SMALL) proj[9] = -.34; else proj[8] = -.24;
      const view = E.M.look(eye, tgt, [0, 1, 0]);
      const vp = E.M.mul(proj, view);
      const pxs = K.pxScale(E, FOV);

      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      SKY.draw(A, vp, eye, t, { stars: e.smooth((p - .55) / .4) * .9 + .1, cloud: .32 });
      T.draw(A, vp, eye, t, { fog: e.mix(9000, 42000, e.smooth((p - .3) / .5)), glow: e.mix(.35, .7, e.smooth((p - .36) / .3)) + .45 * e.smooth((p - .86) / .1), shadows: true });

      /* wind lines */
      const wk = e.smooth((p - .39) / .1) * (1 - e.smooth((p - .95) / .05) * .4);
      if (wk > .01) WIND.draw(vp, { width: 1.5, color: [.16, .36, .8], intensity: wk * .8, t, pulse: .05, pulseLen: .22, fadeD: 32000, nearD: 900 });

      /* pad */
      const padK = 1 - e.smooth((p - .55) / .2);
      if (padK > .01) {
        PAD.draw(vp, { width: 2.2, color: [1.3, .78, .3], intensity: padK * (.9 + .15 * Math.sin(t * 2)) });
        STARS.draw(vp, pxs, { min: 2, max: 28 });
      }
      /* rotor wash dust: a ring blown outward while the rotor is at speed near the ground */
      const agl = hp[1] - P0[1];
      const dustK = e.smooth((p - .1) / .08) * (1 - e.smooth((p - .4) / .06)) * (agl < 25 ? 1 : 0);
      if (dustK > .01) {
        const R = E.rng(3); let k = 0;
        for (let i = 0; i < DUST.n; i++) {
          const a = R() * Math.PI * 2, sp = 3 + R() * 7, life = 1.6 + R() * 1.4, ph = (t * .9 + R() * life) % life, age = ph / life;
          const r = 2.5 + sp * ph * (1 - age * .35);
          DUST.pos.set([hp[0] + Math.cos(a) * r, P0[1] + .15 + age * age * 1.8 + R() * .3, hp[2] + Math.sin(a) * r], k * 3);
          const b = (1 - age) * (1 - age) * dustK * (.6 + R() * .6);
          DUST.col.set([1.1 * b, .66 * b, .3 * b], k * 3); DUST.size[k] = .10 + R() * .16; k++;
        }
        DUST.upload(k);
        DUST.draw(vp, pxs, { min: 1.2, core: .4 });
      }
      /* trails */
      const trailFade = e.smooth((p - .5) / .1);
      if (p > T_GO) {
        const rev = (p - T_GO) / (1 - T_GO);
        TRAILS.lead.draw(vp, { width: e.mix(2.4, 3.2, k2), color: [.35, .7, 1.6], intensity: .75 * trailFade + .1, reveal: rev, t, pulse: .25, pulseLen: .05 });
      }
      if (p > .6) TRAILS.wing.draw(vp, { width: e.mix(2, 3, k2), color: [1.6, .95, .35], intensity: .85, reveal: (p - .6) / .4, t, pulse: .3, pulseLen: .05 });
      if (p > .72) TRAILS.plane.draw(vp, { width: e.mix(2, 3, k2), color: [1.4, 1.35, 1.25], intensity: .7, reveal: (p - .72) / .28, t, pulse: .3, pulseLen: .05 });

      /* aircraft */
      const spin = t * e.mix(1.5, 42, e.smooth((p - .03) / .14)) + p * 20;
      const rate = e.smooth((p - .04) / .14);
      const dist = Math.hypot(eye[0] - hp[0], eye[1] - hp[1], eye[2] - hp[2]);
      const scaleUp = Math.min(5, Math.max(1, dist / 260));          /* far away: keep the aircraft readable as a glowing mark */
      const M = E.M.trs(hp[0], hp[1], hp[2], hs.yaw, hs.pitch, hs.roll, scaleUp);
      AC.draw(A, vp, eye, { M, kind: "heli", spin, rate, cabin: .35 + .65 * e.smooth((p - .55) / .1), t, fog: 60000, pxScale: pxs, lightSize: 1.1 * Math.min(1.8, scaleUp) });
      if (p > .58) {
        const sp = studentPos(E, p), sh = headingAt(Math.max(0, hs.s - .01));
        const d2 = Math.hypot(eye[0] - sp[0], eye[1] - sp[1], eye[2] - sp[2]), sc2 = Math.min(5, Math.max(1, d2 / 260));
        AC.draw(A, vp, eye, { M: E.M.trs(sp[0], sp[1], sp[2], yawOf(sh), -.08, hs.roll * .8, sc2), kind: "heli", spin: spin * .97 + 1.3, rate: 1, cabin: 1, cabinCol: [1.4, .85, .35], rim: [1.0, .7, .35], t: t + .4, fog: 60000, pxScale: pxs, lightSize: 1.1 * Math.min(1.8, sc2) });
        place(E, lab.student, vp, [sp[0], sp[1] + 3 * sc2, sp[2]], e.pulse(p, .62, .66, .74, .78));
      }
      if (p > .72) {
        const ps = planeState(E, p);
        const d3 = Math.hypot(eye[0] - ps.pos[0], eye[1] - ps.pos[1], eye[2] - ps.pos[2]), sc3 = Math.min(5, Math.max(1, d3 / 220));
        AC.draw(A, vp, eye, { M: E.M.trs(ps.pos[0], ps.pos[1], ps.pos[2], ps.yaw, ps.pitch, ps.roll, sc3), kind: "plane", spin: t * 60, rate: 1, cabin: .8, rim: [.9, .95, 1.1], t, fog: 60000, pxScale: pxs, lightSize: 1.2 * Math.min(1.8, sc3) });
        place(E, lab.plane, vp, [ps.pos[0], ps.pos[1] + 4.5 * sc3, ps.pos[2]], e.pulse(p, .785, .8, .845, .87));
      }

      /* the ladder as a map */
      const msK = e.smooth((p - .9) / .06);
      if (msK > .01) {
        for (let i = 0; i < 4; i++) MS.size[i] = 150 * (1 + .12 * Math.sin(t * 2.4 + i));
        MS.upload(); MS.draw(vp, pxs, { min: 3, core: 1.4 });
        lab.ms.forEach(m => place(E, m.el, vp, m.w, msK));
      } else lab.ms.forEach(m => place(E, m.el, vp, m.w, 0));
      /* labels */
      place(E, lab.hover, vp, [hp[0], hp[1] + 4.2, hp[2]], e.pulse(p, .22, .26, .33, .37));
      const mt = H.world(.72, .30, 60);
      place(E, lab.terrain, vp, mt, e.pulse(p, .44, .48, .56, .6));
      const wl = onPath(.36); place(E, lab.wind, vp, [wl[0] + sd[0] * 1600, H.hAt(wl[0] + sd[0] * 1600, wl[2] + sd[1] * 1600) + 200, wl[2] + sd[1] * 1600], e.pulse(p, .5, .53, .58, .61));
      place(E, lab.you, vp, [hp[0], hp[1] + 3.6 * scaleUp, hp[2]], e.pulse(p, .62, .66, .74, .78));
    }
  };
  function place(E, el, vp, w, o) { E.place(el, vp, w, o); }

  /* the student flies in close formation behind and beside the lead */
  function studentPos(E, p) {
    const e = E.ease, hs = heliState(E, Math.max(p, T_GO + .001));
    const hh = headingAt(hs.s), sd = [-hh[1], hh[0]], hp = hs.pos;
    const join = e.smooth((p - .575) / .075);
    const back = e.mix(420, 30, join), side = e.mix(-260, -22, join), up = e.mix(70, -3, join);
    return [hp[0] - hh[0] * back + sd[0] * side, hp[1] + up, hp[2] - hh[1] * back + sd[1] * side];
  }
  /* the airplane comes up from behind the camera, passes the formation, then banks away to the right and climbs */
  const PLANE = [{ p: .70, v: [-700, 80, 24] }, { p: .765, v: [-60, 64, 20] }, { p: .80, v: [34, 58, 18] }, { p: .835, v: [110, 66, 24] }, { p: .88, v: [760, 460, 110] }, { p: .94, v: [2400, 1700, 210] }, { p: 1, v: [4400, 3300, 280] }];
  function planeState(E, p) {
    const hs = heliState(E, p), h = headingAt(hs.s), sd = [-h[1], h[0]];
    const at = q => { const k = E.spline(PLANE, Math.min(1, Math.max(.7, q))); return [hs.pos[0] + h[0] * k[0] + sd[0] * k[1], hs.pos[1] + k[2], hs.pos[2] + h[1] * k[0] + sd[1] * k[1]]; };
    const pos = at(p), nx = at(p + .004);
    const dx = nx[0] - pos[0], dz = nx[2] - pos[2], l = Math.hypot(dx, dz) || 1;
    const bank = E.ease.pulse(p, .835, .86, .93, .98);
    return { pos, yaw: Math.atan2(-dx / l, -dz / l), pitch: .06, roll: -.55 * bank };
  }
})();
