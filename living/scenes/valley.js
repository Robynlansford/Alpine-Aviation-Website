/* =====================================================================
   VALLEY — helicopter-tours.html (pinned scroll film)
   "See Idaho from the air." A sightseeing flight over the real Boise
   foothills, from golden hour into the night:
     0  north along the foothills at golden hour; ridges catch the last light
     1  the experience: the tour swings west, toward the sun and the river
     2  year-round: the sun goes down over the valley, blue hour
     3  tour options: night; the city's roads light up, ring by ring,
        outward from downtown
     4  photo flight: the view from the open right-hand door, a viewfinder
        frames the lit city and locks (a soft shutter flash)
     5  wide over the valley at night: the city, the river, the landmarks,
        and the route just flown, still glowing

   REAL: terrain = USGS 3DEP (living/data/boise.*), heights x1.5, contour
   lines at true 50 m / 250 m elevations; Boise River + major roads =
   OpenStreetMap (living/data/boise_lines.json); landmarks = boise.json.
   ILLUSTRATIVE: the helicopter (stylized), the route (not a real tour
   route), which roads light up and when.
   ===================================================================== */
(function () {
  "use strict";
  const NS = window.Living = window.Living || { scenes: {} };
  const K = window.LivingKit;
  const EXAG = 1.5;

  let E0, H, T, SKY, AC, RIVER, TRAIL, LIGHTS, APRON, DOWNTOWN, LM, path, sWP;
  let ROADS = [];
  let lightIgn, lightPh, lightBase;
  const lab = {};
  let vf, flash;

  /* the illustrative loop (uv): north along the foothills, west over the north
     end, down to the river, then east along the north edge of downtown (the
     right-hand door faces the city) and on toward Table Rock */
  const WP = [
    [0.585, 0.600], [0.585, 0.470], [0.560, 0.340], [0.470, 0.280], [0.360, 0.330],
    [0.290, 0.430], [0.320, 0.520], [0.370, 0.555], [0.450, 0.565], [0.530, 0.620],
    [0.600, 0.700]
  ];
  /* distance bands (km from the Capitol) that light up in turn */
  const BANDS = [1.3, 2.6, 4.2, 6.2, 9, 13, 1e9];

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

  function buildPath() {
    const NC = (WP.length - 1) * 120 + 1;
    const uv = cr(WP, NC);
    const raw = uv.map(([u, v]) => ({ x: (u - .5) * H.sizeX, z: (v - .5) * H.sizeZ }));
    const d = [0]; for (let i = 1; i < raw.length; i++) d.push(d[i - 1] + Math.hypot(raw[i].x - raw[i - 1].x, raw[i].z - raw[i - 1].z));
    const tot = d[d.length - 1];
    sWP = WP.map((_, k) => d[k * 120] / tot);
    /* resample evenly by arc length */
    const N = 1200, res = []; let j = 0;
    for (let i = 0; i < N; i++) {
      const s = i / (N - 1) * tot; while (j < d.length - 2 && d[j + 1] < s) j++;
      const f = (s - d[j]) / Math.max(1e-6, d[j + 1] - d[j]), a = raw[j], b = raw[j + 1];
      const x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f;
      res.push({ x, z, g: T.hMesh(x, z) });
    }
    /* altitude: a smoothed ceiling over the ground ahead and behind, plus clearance */
    const W = 50;
    const sm = res.map((q, i) => { let m = 0; for (let k = -W; k <= W; k++) { const r = res[Math.min(N - 1, Math.max(0, i + k))]; m = Math.max(m, r.g * (1 - Math.abs(k) / (W + 1) * .4)); } return m; });
    const sm2 = sm.map((q, i) => { let s = 0, w = 0; for (let k = -30; k <= 30; k++) { const ww = 1 - Math.abs(k) / 31; s += sm[Math.min(N - 1, Math.max(0, i + k))] * ww; w += ww; } return s / w; });
    res.forEach((q, i) => { const s = i / (N - 1); q.y = Math.max(sm2[i], q.g) + 320 - 80 * E0.ease.smooth((s - .42) / .2); });
    return res;
  }
  function onPath(s) {
    const N = path.length, f = Math.min(N - 1.001, Math.max(0, s * (N - 1))), i = f | 0, t = f - i;
    const a = path[i], b = path[i + 1];
    return [a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t];
  }
  function headingAt(s) { const a = onPath(Math.max(0, s - .008)), b = onPath(Math.min(1, s + .008)); const dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; }
  const yawOf = d => Math.atan2(-d[0], -d[1]);
  /* eased key-to-key blend (no overshoot, unlike a spline through uneven keys) */
  function keyLerp(keys, p, e) {
    let i = 0; while (i < keys.length - 2 && p > keys[i + 1].p) i++;
    const a = keys[i], b = keys[i + 1], u = e.smooth((p - a.p) / (b.p - a.p));
    return a.v.map((v, j) => v + (b.v[j] - v) * u);
  }

  /* scroll progress -> distance along the loop (C1 spline through the beats) */
  let SK;
  function pathS(p) { return E0.spline(SK, Math.min(1, Math.max(0, p)))[0]; }

  /* split OSM uv polylines at the map edge */
  function clipLines(arrs) {
    const out = [];
    arrs.forEach(l => {
      let cur = [];
      for (let i = 0; i < l.length; i += 2) {
        const u = l[i], v = l[i + 1];
        if (u > .003 && u < .997 && v > .003 && v < .997) cur.push([u, v]);
        else { if (cur.length > 1) out.push(cur); cur = []; }
      }
      if (cur.length > 1) out.push(cur);
    });
    return out;
  }

  /* a wide ground plane under and around the map, fogged into the sky, so the
     edge of the terrain data never reads as a cliff on the horizon */
  function apron(E) {
    const gl = E.gl, R = 120000;
    const vao = K.vao(E, [[new Float32Array([-R, 0, -R, R, 0, -R, R, 0, R, -R, 0, R]), 3]], new Uint32Array([0, 2, 1, 0, 3, 2]));
    const P = E.program(`#version 300 es
precision highp float; in vec3 aP; uniform mat4 uVP; uniform float uY; out vec3 vW;
void main(){ vW = vec3(aP.x, uY, aP.z); gl_Position = uVP * vec4(vW, 1.); }`, `#version 300 es
precision highp float; in vec3 vW; out vec4 o; uniform vec3 uEye; uniform float uFogD;
${K.GLSL.atmos}
void main(){ vec3 rd = normalize(vW - uEye); float d = length(vW - uEye);
  vec3 c = vec3(.03, .03, .032) * (uZenith * 5. + uSunCol * max(uSunDir.y, 0.) * 1.2);
  c = mix(c, fogCol(rd), 1. - exp(-d / uFogD)); o = vec4(c, 1.); }`, ["aP"]);
    return {
      draw(A, vp, eye, y, fog) {
        gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
        P.use().m4("uVP", vp).f1("uY", y).v3("uEye", eye).f1("uFogD", fog); K.atmosUniforms(P, A);
        gl.bindVertexArray(vao); gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_INT, 0); gl.bindVertexArray(null);
      }
    };
  }

  NS.scenes.valley = {
    still: .6,
    async init(E) {
      E0 = E;
      const [hf, lines, downtown] = await Promise.all([
        K.heightfield(E, "living/data/boise.png", "living/data/boise.json", EXAG),
        E.loadJSON("living/data/boise_lines.json"),
        E.loadJSON("living/data/downtown.json")
      ]);
      H = hf;
      T = K.terrain(E, H, { contour: 50, major: 250 });
      SKY = K.sky(E);
      AC = K.aircraft(E);
      APRON = apron(E);
      path = buildPath();
      /* beats -> where the helicopter is on the loop */
      const lw = (a, b, f) => sWP[a] + (sWP[b] - sWP[a]) * f;
      SK = [
        { p: 0, v: [.012] }, { p: .15, v: [sWP[1]] }, { p: .31, v: [lw(2, 3, .75)] }, { p: .48, v: [lw(4, 5, .75)] },
        { p: .67, v: [lw(6, 7, .45)] }, { p: .8, v: [lw(7, 8, .5)] }, { p: .88, v: [lw(7, 8, .85)] }, { p: 1, v: [lw(8, 9, .6)] }
      ];
      SK.linear = true;

      /* river */
      const river = clipLines(lines.layers.river);
      RIVER = K.ribbons(E, river.map((pts, i) => ({ pts, id: i })), { draped: H, lift: 5 });

      /* roads, grouped by distance from the Capitol so they light up ring by ring */
      const cap = H.meta.points.find(q => /Capitol/.test(q.name)).uv;
      const kmU = H.sizeX / 1000, kmV = H.sizeZ / 1000;
      const roads = clipLines(lines.layers.roads);
      const groups = BANDS.map(() => []);
      roads.forEach((pts, i) => {
        let cu = 0, cv = 0; pts.forEach(q => { cu += q[0]; cv += q[1]; }); cu /= pts.length; cv /= pts.length;
        const dk = Math.hypot((cu - cap[0]) * kmU, (cv - cap[1]) * kmV);
        groups[BANDS.findIndex(b => dk < b)].push({ pts, id: i });
      });
      ROADS = groups.map(g => g.length ? K.ribbons(E, g, { draped: H, lift: 4 }) : null);
      /* downtown streets (denser OSM extract), mapped into this terrain's uv */
      const B = H.meta.bounds, db = downtown.bbox;
      const du0 = (db.west - B.west) / (B.east - B.west), du1 = (db.east - B.west) / (B.east - B.west);
      const dv0 = (B.north - db.north) / (B.north - B.south), dv1 = (B.north - db.south) / (B.north - B.south);
      const streets = downtown.layers.streets.map(l => { const o = []; for (let i = 0; i < l.length; i += 2) o.push(du0 + l[i] * (du1 - du0), dv0 + l[i + 1] * (dv1 - dv0)); return o; });
      const dt = clipLines(streets);
      DOWNTOWN = K.ribbons(E, dt.map((pts, i) => ({ pts, id: i })), { draped: H, lift: 3 });

      /* street lights: points sampled along the roads */
      const L = [], R = E.rng(11);
      const sample = (set, max, minStep) => {
        let total = 0; set.forEach(pts => { for (let i = 1; i < pts.length; i++) total += Math.hypot((pts[i][0] - pts[i - 1][0]) * H.sizeX, (pts[i][1] - pts[i - 1][1]) * H.sizeZ); });
        const step = Math.max(minStep, total / max), n0 = L.length;
        set.forEach(pts => {
          let acc = R() * step;
          for (let i = 1; i < pts.length && L.length - n0 < max; i++) {
            const a = pts[i - 1], b = pts[i], seg = Math.hypot((b[0] - a[0]) * H.sizeX, (b[1] - a[1]) * H.sizeZ);
            while (acc < seg && L.length - n0 < max) { const f = acc / seg; L.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]); acc += step; }
            acc -= seg;
          }
        });
      };
      sample(dt, E.SMALL ? 1500 : 3000, 30);
      sample(roads, E.SMALL ? 3500 : 7000, 60);
      LIGHTS = K.sprites(E, L.length);
      lightIgn = new Float32Array(L.length); lightPh = new Float32Array(L.length); lightBase = new Float32Array(L.length * 3);
      L.forEach(([u, v], i) => {
        const w = H.world(u, v); w[1] = T.hMesh(w[0], w[2]) + 6;
        LIGHTS.pos.set(w, i * 3);
        const dk = Math.hypot((u - cap[0]) * kmU, (v - cap[1]) * kmV);
        lightIgn[i] = .45 + Math.min(1, dk / 14) * .19 + R() * .015;
        lightPh[i] = R() * 6.283;
        const k = R();
        const c = k < .64 ? [1.6, .74, .26] : k < .9 ? [1.5, 1.1, .6] : [1.15, 1.2, 1.35];
        lightBase.set(c, i * 3);
        LIGHTS.size[i] = 6 + R() * 5;
      });
      LIGHTS.upload();

      /* the illustrative route, revealed as it is flown (evenly spaced in s) */
      const sEnd = SK[SK.length - 1].v[0], tr = [];
      for (let i = 0; i <= 400; i++) { const q = onPath(sEnd * i / 400); tr.push([q[0], q[1] - 2.5, q[2]]); }
      TRAIL = K.ribbons(E, [tr]);
      TRAIL.sEnd = sEnd;

      /* landmarks from boise.json */
      LM = H.meta.points.map(q => { const w = H.world(q.uv[0], q.uv[1]); w[1] = T.hMesh(w[0], w[2]); return { name: q.name, w }; });
      lab.lm = LM.map(q => ({ el: E.label("<span>" + q.name + "</span>", /Capitol/.test(q.name) ? "gold" : ""), w: [q.w[0], q.w[1] + 70, q.w[2]] }));
      lab.ridge = E.label("<span>Boise foothills · real terrain</span>");
      lab.river = E.label("<span>Boise River</span>");
      lab.route = E.label("<span>Route illustrative</span>");
      lab.you = E.label("<span>You</span>", "gold");

      /* viewfinder for the photo flight (DOM; styled by the page) */
      vf = document.createElement("div"); vf.className = "vl-vf"; vf.innerHTML = "<i></i><i></i><i></i><i></i><em></em><b></b>";
      E.labels.appendChild(vf);
      flash = document.createElement("div"); flash.className = "vl-flash"; E.labels.appendChild(flash);

      NS.debug = { H, T, path, onPath, pathS, headingAt, LM, sWP };
    },

    frame(E, S) {
      const gl = E.gl, e = E.ease, p = S.p, t = S.t;

      /* ---- time of day: golden hour -> sunset -> blue hour -> night ---- */
      const dusk = e.smooth((p - .28) / .2);           /* 0 golden, 1 the sun is gone */
      const night = e.smooth((p - .44) / .2);          /* 0 blue hour, 1 night */
      const sunEl = e.mix(.085, -.07, e.smooth((p - .04) / .46));
      const sunK = 1 - e.smooth((p - .34) / .14);
      const A = K.atmos({
        sunAz: Math.PI * 1.04, sunEl,
        /* the sun fades as it sets (also keeps the kit's fog from painting a pillar under a horizon sun) */
        sun: [2.6, 1.28, .48].map(v => v * sunK * e.mix(1, .06, e.smooth((p - .19) / .12))),
        zenith: [e.mix(.012, .007, night), e.mix(.022, .013, night), e.mix(.058, .042, night)],
        horizon: [e.mix(e.mix(.48, .30, dusk), .034, night), e.mix(e.mix(.26, .14, dusk), .04, night), e.mix(e.mix(.11, .2, dusk), .09, night)]
      });

      /* ---- the helicopter ---- */
      const s = pathS(p), hp = onPath(s), hh = headingAt(s), h2 = headingAt(Math.min(1, s + .03));
      const turn = Math.atan2(hh[0] * h2[1] - hh[1] * h2[0], hh[0] * h2[0] + hh[1] * h2[1]);
      const sd = [-hh[1], hh[0]];
      const photo = e.pulse(p, .70, .745, .855, .89);  /* the doors-off view */
      const roll = Math.max(-.4, Math.min(.4, -turn * 5)) * (1 - photo) - photo * .26;
      const yaw = yawOf(hh);

      /* ---- camera: beside and behind the helicopter ---- */
      const CK = [                                   /* back, lat(+ right), up, ahead, drop (m) */
        { p: 0, v: [34, -12, 7, 9, 3.5] },
        { p: .15, v: [40, -16, 9, 12, 5] },
        { p: .31, v: [48, 18, 12, 22, 12] },
        { p: .47, v: [80, 34, 30, 30, 26] },
        { p: .58, v: [820, -300, 540, 2100, 800] },
        { p: .7, v: [860, -320, 580, 2300, 860] },
        { p: 1, v: [860, -320, 580, 2300, 860] }
      ];
      const c = keyLerp(CK, p, e);
      let eye = [hp[0] - hh[0] * c[0] + sd[0] * c[1], hp[1] + c[2], hp[2] - hh[1] * c[0] + sd[1] * c[1]];
      let tgt = [hp[0] + hh[0] * c[3], hp[1] + 1.5 - c[4], hp[2] + hh[1] * c[3]];
      /* over the city: look at the lights, not past them */
      const cityK = e.smooth((p - .5) / .08);
      if (cityK > 0) { const cw = H.world(.36, .6, 0); tgt = tgt.map((v, i) => e.mix(v, cw[i], cityK * .75)); }

      /* photo flight: from the open right-hand door, looking out and down */
      if (photo > 0) {
        const M0 = E.M.trs(hp[0], hp[1], hp[2], yaw, -.04, roll, 1);
        const de = AC.at(M0, 1.25, 1.6, -.3);
        /* the photographer keeps the Capitol in frame as the helicopter moves */
        const cp = LM[0].w, pan = (p - .8) * 900;
        const out = [cp[0] + hh[0] * pan, cp[1] + 40, cp[2] + hh[1] * pan];
        eye = eye.map((v, i) => e.mix(v, de[i], photo));
        tgt = tgt.map((v, i) => e.mix(v, out[i], photo));
      }
      /* wide: the whole valley at night */
      const k2 = e.smooth((p - .875) / .11);
      if (k2 > 0) {
        const we = H.world(.21, .985, 0); we[1] = 6200;
        const wt = H.world(.47, .56, 0);
        eye = eye.map((v, i) => e.mix(v, we[i], k2));
        tgt = tgt.map((v, i) => e.mix(v, wt[i], k2));
      }
      const gnd = T.hMesh(eye[0], eye[2]) + 25; if (eye[1] < gnd) eye[1] = gnd;
      const jig = 1 - photo * .8;
      eye = [eye[0] + (Math.sin(t * .31) * .25 + S.px * 1.2) * jig, eye[1] + (Math.sin(t * .23) * .15 - S.py * .6) * jig, eye[2] + Math.cos(t * .27) * .25 * jig];

      const FOV = (E.aspect < 1 ? 1.2 : .92) * e.mix(1, .5, photo);
      const near = e.mix(1.5, .2, photo) + k2 * 40;
      const proj = E.M.persp(FOV, E.aspect, near, 120000);
      /* lens shift: subject right of the words (desktop) / above them (phone); in the
         photo flight the subject sits in the viewfinder's focus box */
      /* beat 1 (toward the low sun) puts its words on the right, so the aircraft crosses to the left, against the glow */
      const flip = e.pulse(p, .135, .17, .31, .345);
      if (E.SMALL) proj[9] = e.mix(-.3, -.27, photo); else proj[8] = e.mix(e.mix(-.24, .22, flip), -.39, photo);
      const view = E.M.look(eye, tgt, [0, 1, 0]);
      const vp = E.M.mul(proj, view);
      const pxs = K.pxScale(E, FOV);
      const fogD = e.mix(e.mix(21000, 15000, e.smooth((p - .33) / .1)), 24000, night);

      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      SKY.draw(A, vp, eye, t, { stars: .06 + .9 * e.smooth((p - .42) / .3), cloud: .36 * (1 - night * .5) });
      APRON.draw(A, vp, eye, 25, fogD);
      T.draw(A, vp, eye, t, { fog: fogD, glow: e.mix(e.mix(.42, .7, dusk), .3, night) + .08 * k2, shadows: sunK > .05 });

      /* river: warm in the low sun, ice-blue after dark */
      const rk = e.smooth((p - .1) / .12);
      if (rk > .01) RIVER.draw(vp, { width: e.mix(1.7, 2.4, k2), color: [e.mix(1.4, .28, dusk), e.mix(.9, .6, dusk), e.mix(.5, 1.45, dusk)], intensity: rk * e.mix(.55, .8, night), t, pulse: .05, pulseLen: .3, fadeD: 30000 });

      /* roads light up outward from downtown */
      ROADS.forEach((R, k) => {
        if (!R) return;
        const a = .46 + k * .028, ik = e.smooth((p - a) / .05);
        if (ik > .01) R.draw(vp, { width: e.mix(1.1, 1.3, k2), color: [1.3, .6, .21], intensity: ik * (.34 + .18 * night), t, fadeD: 30000, pulse: .03, pulseLen: .04 });
      });
      const dk = e.smooth((p - .445) / .05);
      if (dk > .01) DOWNTOWN.draw(vp, { width: e.mix(1, 1.4, photo), color: [1.35, .82, .38], intensity: dk * (.3 + .12 * night + .2 * photo), t, fadeD: 30000 });
      /* street lights */
      if (p > .44) {
        const col = LIGHTS.col;
        for (let i = 0; i < LIGHTS.n; i++) {
          const ik = e.smooth((p - lightIgn[i]) / .03);
          const tw = ik * (.84 + .16 * Math.sin(t * 1.7 + lightPh[i]));
          col[i * 3] = lightBase[i * 3] * tw; col[i * 3 + 1] = lightBase[i * 3 + 1] * tw; col[i * 3 + 2] = lightBase[i * 3 + 2] * tw;
        }
        LIGHTS.upload();
        LIGHTS.draw(vp, pxs, { min: 1.4, max: 7, core: 1.3 });
      }

      /* the route behind the helicopter */
      /* only once the camera is high above it: a ribbon passing behind the eye breaks its screen-space width */
      const trK = e.smooth((k2 - .45) / .4);
      if (trK > .01) TRAIL.draw(vp, { width: 2.6, color: [.38, .72, 1.6], intensity: .9 * trK, reveal: Math.min(1, s / TRAIL.sEnd), t, pulse: .2, pulseLen: .04, nearD: 1500 });

      /* the aircraft (not drawn while we look out of its door) */
      const dist = Math.hypot(eye[0] - hp[0], eye[1] - hp[1], eye[2] - hp[2]);
      const scaleUp = Math.min(6, Math.max(1, dist / 240));
      const spin = t * 42 + p * 30;
      if (photo < .5) AC.draw(A, vp, eye, { M: E.M.trs(hp[0], hp[1], hp[2], yaw, -.08, roll, scaleUp), kind: "heli", spin, rate: 1, cabin: .75, cabinCol: [1.5, .9, .38], t, fog: 60000, pxScale: pxs, lightSize: 1.1 * Math.min(2.2, scaleUp) });

      /* ---- labels ---- */
      E.place(lab.you, vp, [hp[0], hp[1] + 3.8 * scaleUp, hp[2]], e.pulse(p, .03, .07, .13, .16));
      /* the ridge label rides a real slope ahead and to the right of the aircraft */
      const rx = hp[0] + hh[0] * 520 + sd[0] * 260, rz = hp[2] + hh[1] * 520 + sd[1] * 260;
      E.place(lab.ridge, vp, [rx, T.hMesh(rx, rz) + 4, rz], e.pulse(p, .05, .09, .14, .17), { clamp: true });
      E.place(lab.river, vp, H.world(.265, .43, 30), e.pulse(p, .22, .26, .33, .37));
      const capK = e.pulse(p, .785, .8, .845, .87);                  /* named when it is the subject of the photo */
      lab.lm.forEach((m, i) => E.place(m.el, vp, m.w, i === 0 ? Math.max(capK, k2) : k2));
      const rl = onPath(.2); E.place(lab.route, vp, [rl[0], rl[1] + 40, rl[2]], k2);

      /* viewfinder + shutter */
      vf.style.opacity = e.pulse(p, .735, .765, .845, .87).toFixed(3);
      vf.classList.toggle("lock", p > .782);
      const fl = e.pulse(p, .776, .781, .783, .79);
      flash.style.opacity = (fl * .5).toFixed(3);
    }
  };
})();
