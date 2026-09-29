/* =====================================================================
   CONTOURS — the quiet pages (news, gallery, liability-waiver,
   financial-options, instructing). One LIVE hero, no pin.

   A floating field of real terrain from Alpine's home country (the
   Oasis / Mountain Home, Idaho area), drawn only in light:
     - contour lines at real elevations that slowly "breathe" (the level
       set drifts a few metres up and down the slopes and back)
     - a soft band of light drifting across the field
     - now and then a pulse of light runs along one of the major lines
       (it follows the exact level set, computed on the CPU)
     - a few motes of light hang in the air over the field
   The field dissolves into the dusk at its edges, so each page shows
   one real piece of ground, seen from its own side.

   Per page:  data-tone = gold | ice | cream | dusk | slate
              data-seed = 1..5 picks the piece of ground + camera
   Test hooks: ?cs=<seed> ?ct=<tone> override both; ?cg=u,v,R,look,hc,back,minor tries a ground.

   REAL: terrain = USGS 3DEP (living/data/mhome.*), heights x2.
   ILLUSTRATIVE: the breathing, the band of light, the pulses, the motes.
   Cheap by design: one grid draw (4 texture reads per pixel, normals from
   screen derivatives), one sky pass, a handful of sprites, and the scene
   itself is redrawn at most 30 times a second. No shadows, no raymarching.
   ===================================================================== */
(function () {
  "use strict";
  const NS = window.Living = window.Living || { scenes: {} };
  const K = window.LivingKit;
  const EXAG = 2;

  /* pieces of ground (uv centre in mhome, radius km), camera bearing (0 = looking north,
     PI/2 = east), camera height and back-distance in km, contour interval in metres */
  const GROUND = {
    1: { c: [.62, .30], R: 13, look: .95, hc: 6.2, back: 13.5, minor: 40 },   /* escarpment rising into the mountains */
    2: { c: [.80, .42], R: 11, look: -.35, hc: 5.6, back: 12, minor: 50 },   /* ridges and spurs, high relief */
    3: { c: [.45, .87], R: 12, look: 1.45, hc: 4.2, back: 12.5, minor: 8 },  /* the Snake River canyon */
    4: { c: [.36, .22], R: 12, look: -.4, hc: 5, back: 12, minor: 25 },      /* the foothills north of Oasis */
    5: { c: [.85, .21], R: 10, look: 2.6, hc: 5.2, back: 11, minor: 50 }     /* high mountains, looking south */
  };

  /* palettes (HDR; >1 blooms). lo/hi grade the minor lines by elevation. */
  const TONES = {
    gold:  { lo: [.34, .24, .12], hi: [.62, .42, .18], major: [1.35, .84, .34], band: [1.5, 1.3, 1.0], pulse: [2.6, 1.8, .9],
             zen: [.005, .008, .022], hor: [.022, .024, .040], haze: [.05, .03, .014], ground: [.020, .024, .038], key: [.9, .6, .3], mote: [1.3, .9, .5], stars: .35 },
    ice:   { lo: [.10, .20, .42], hi: [.22, .40, .72], major: [.45, .82, 1.65], band: [1.2, 1.4, 1.7], pulse: [1.5, 2.1, 2.8],
             zen: [.004, .008, .024], hor: [.016, .026, .050], haze: [.014, .03, .06], ground: [.016, .024, .042], key: [.5, .7, 1.0], mote: [.8, 1.1, 1.6], stars: .6 },
    cream: { lo: [.26, .24, .20], hi: [.46, .42, .34], major: [1.25, 1.12, .88], band: [1.6, 1.45, 1.15], pulse: [2.4, 2.1, 1.5],
             zen: [.005, .008, .022], hor: [.022, .025, .038], haze: [.04, .034, .024], ground: [.017, .019, .028], key: [.8, .72, .56], mote: [1.2, 1.05, .8], stars: .3 },
    dusk:  { lo: [.12, .18, .42], hi: [.70, .40, .20], major: [1.1, .8, .75], band: [1.5, 1.25, 1.1], pulse: [2.5, 1.7, 1.0],
             zen: [.004, .007, .024], hor: [.022, .020, .044], haze: [.05, .024, .03], ground: [.020, .020, .040], key: [.9, .55, .45], mote: [1.2, .85, .8], stars: .55 },
    slate: { lo: [.10, .13, .20], hi: [.20, .25, .36], major: [.55, .66, .92], band: [1.1, 1.15, 1.3], pulse: [1.6, 1.8, 2.3],
             zen: [.005, .009, .022], hor: [.020, .026, .042], haze: [.03, .04, .06], ground: [.018, .022, .034], key: [.6, .65, .8], mote: [.8, .9, 1.1], stars: .3 }
  };

  const SKY_GLSL = `
uniform vec3 uZen, uHor, uHaze;
vec3 skyCol(vec3 rd){
  float h = rd.y;
  vec3 c = mix(uHor, uZen, smoothstep(-.02, .55, h));
  c += uHaze * exp(-abs(h + .015) * 16.);
  c = mix(c, uHor * .45, 1. - smoothstep(-.35, -.02, h));
  return c;
}`;

  const STILL_T = 11.5;                    /* reduced motion: the frame at this second */
  const NP = 4, TRAIL = 6;                 /* live pulses x trail points */
  const PULSE_EVERY = 3.1, PULSE_LIFE = 7.5, PULSE_SPEED = 560, TRAIL_DT = .26;

  let H, G, TONE, GR, C0, SKY, FIELD, HEADS, MOTES, E0, seed = 1, cam = null;
  const pulses = new Map();

  const smoothT = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
  const breath = t => Math.sin(t * Math.PI * 2 / 17) * .42;          /* in units of the minor interval */
  const bandPos = t => -1.4 + ((t / 46 + .37 + seed * .173) % 1) * 2.8;

  /* cubic B-spline height (the same smoothing the shader uses for the lines), metres above sea level */
  function elevAt(x, z) {
    const w = H.w, h = H.h, d = H.data;
    const fx0 = (x / H.sizeX + .5) * w - .5, fz0 = (z / H.sizeZ + .5) * h - .5;
    const ix = Math.floor(fx0), iz = Math.floor(fz0), fx = fx0 - ix, fz = fz0 - iz;
    const wx = bs(fx), wz = bs(fz);
    let s = 0;
    for (let j = 0; j < 4; j++) {
      const row = Math.min(h - 1, Math.max(0, iz - 1 + j)) * w;
      let r = 0;
      for (let i = 0; i < 4; i++) r += d[row + Math.min(w - 1, Math.max(0, ix - 1 + i))] * wx[i];
      s += r * wz[j];
    }
    return H.meta.hmin + s * H.range;
  }
  function bs(f) { const f2 = f * f, f3 = f2 * f; return [(1 - 3 * f + 3 * f2 - f3) / 6, (4 - 6 * f2 + 3 * f3) / 6, (1 + 3 * f + 3 * f2 - 3 * f3) / 6, f3 / 6]; }
  function gradAt(x, z) { const e = 45; return [(elevAt(x + e, z) - elevAt(x - e, z)) / (2 * e), (elevAt(x, z + e) - elevAt(x, z - e)) / (2 * e)]; }

  /* walk along a level set: Newton back onto the level, then step along the tangent */
  function onLevel(p, L) {
    for (let k = 0; k < 4; k++) {
      const g = gradAt(p[0], p[1]), g2 = g[0] * g[0] + g[1] * g[1];
      if (g2 < 1e-6) return false;
      const e = elevAt(p[0], p[1]) - L;
      let sx = -e * g[0] / g2, sz = -e * g[1] / g2; const s = Math.hypot(sx, sz);
      if (s > 160) { sx *= 160 / s; sz *= 160 / s; }
      p[0] += sx; p[1] += sz;
    }
    return Math.abs(elevAt(p[0], p[1]) - L) < 2;
  }

  function makePulse(k, vp) {
    const R = E0.rng(seed * 7919 + k * 104729 + 17);
    const s0 = k * PULSE_EVERY + (R() - .5) * 1.4;
    const major = GR.minor * 5;
    const small = E0.SMALL;
    for (let tries = 0; tries < 40; tries++) {
      const a = R() * Math.PI * 2, r = Math.sqrt(R()) * GR.Rm * .78;
      const p = [C0[0] + Math.cos(a) * r, C0[1] + Math.sin(a) * r];
      const g = gradAt(p[0], p[1]); if (Math.hypot(g[0], g[1]) < .035) continue;
      /* start on screen, away from the words */
      const q = E0.M.project(vp, p[0], H.hAt(p[0], p[1]), p[1]);
      if (q.z < 0 || q.z > 1) continue;
      const fx = q.x / E0.cssW, fy = q.y / E0.cssH;
      if (small ? (fx < .1 || fx > .9 || fy < .2 || fy > .56) : (fx < .5 || fx > .95 || fy < .3 || fy > .9)) continue;
      const off = breath(s0) * GR.minor;
      const L0 = Math.round((elevAt(p[0], p[1]) - off) / major) * major;
      if (!onLevel(p, L0 + off)) continue;
      const dir = R() < .5 ? 1 : -1, pts = [], N = Math.ceil(PULSE_LIFE * 30) + 2;
      let ok = true;
      for (let i = 0; i < N; i++) {
        const tt = s0 + i / 30;
        if (!onLevel(p, L0 + breath(tt) * GR.minor)) { ok = false; break; }
        pts.push(p[0], p[1]);
        const g2 = gradAt(p[0], p[1]), gl = Math.hypot(g2[0], g2[1]) || 1;
        p[0] += dir * -g2[1] / gl * PULSE_SPEED / 30; p[1] += dir * g2[0] / gl * PULSE_SPEED / 30;
        if (Math.hypot(p[0] - C0[0], p[1] - C0[1]) > GR.Rm * .9) break;
      }
      if (!ok || pts.length < 60) continue;
      return { s0, L0, pts, n: pts.length / 2 };
    }
    return { s0, L0: 0, pts: [], n: 0 };
  }
  function pulseAt(P, age) {
    const f = Math.min(P.n - 1.001, Math.max(0, age * 30)), i = f | 0, u = f - i;
    return [P.pts[i * 2] + (P.pts[i * 2 + 2] - P.pts[i * 2]) * u, P.pts[i * 2 + 1] + (P.pts[i * 2 + 3] - P.pts[i * 2 + 1]) * u];
  }

  function buildCamera(E, t) {
    const drift = Math.sin(t * .019) * .05 + (E.REDUCED ? 0 : S_px * .03);
    const b = GR.look + drift;
    const fwd = [Math.sin(b), -Math.cos(b)];
    const back = GR.back * 1000 * (1 + Math.sin(t * .013 + 1) * .025);
    const ground = GR.base;
    const eye = [C0[0] - fwd[0] * back, ground + GR.hc * 1000 + Math.sin(t * .023) * 60 - (E.REDUCED ? 0 : S_py * 120), C0[1] - fwd[1] * back];
    const tgt = [C0[0] + fwd[0] * GR.Rm * .12, ground, C0[1] + fwd[1] * GR.Rm * .12];
    const FOV = E.aspect < 1 ? 1.06 : .78;
    const proj = E.M.persp(FOV, E.aspect, 200, 90000);
    if (E.SMALL) proj[9] = -.3; else proj[8] = -.26;
    const view = E.M.look(eye, tgt, [0, 1, 0]);
    return { eye, vp: E.M.mul(proj, view), FOV };
  }
  let S_px = 0, S_py = 0, lastT = null, tick = 0;

  NS.scenes.contours = {
    still: 0,
    async init(E) {
      E0 = E;
      const Q = new URLSearchParams(location.search);
      seed = parseInt(Q.get("cs") || E.root.dataset.seed || "1", 10) || 1;
      const toneName = Q.get("ct") || E.root.dataset.tone || "gold";
      TONE = TONES[toneName] || TONES.gold;
      GR = Object.assign({}, GROUND[((seed - 1) % 5 + 5) % 5 + 1]);
      if (Q.get("cg")) { const v = Q.get("cg").split(",").map(Number); GR = { c: [v[0], v[1]], R: v[2], look: v[3], hc: v[4], back: v[5], minor: v[6] }; }

      H = await K.heightfield(E, "living/data/mhome.png", "living/data/mhome.json", EXAG);
      GR.Rm = GR.R * 1000;
      C0 = [(GR.c[0] - .5) * H.sizeX, (GR.c[1] - .5) * H.sizeZ];
      /* elevation range inside the disc, for the colour grade and the camera base */
      let lo = 1e9, hi = -1e9, sum = 0, cnt = 0;
      for (let j = 0; j < 40; j++) for (let i = 0; i < 40; i++) {
        const x = C0[0] + (i / 39 - .5) * 2 * GR.Rm, z = C0[1] + (j / 39 - .5) * 2 * GR.Rm;
        if (Math.hypot(x - C0[0], z - C0[1]) > GR.Rm) continue;
        const e = elevAt(x, z); lo = Math.min(lo, e); hi = Math.max(hi, e); sum += H.hAt(x, z); cnt++;
      }
      GR.elo = lo; GR.ehi = hi; GR.base = sum / cnt;
      const u0 = GR.c[0] - GR.Rm / H.sizeX, v0 = GR.c[1] - GR.Rm / H.sizeZ;
      GR.win = [u0, v0, 2 * GR.Rm / H.sizeX, 2 * GR.Rm / H.sizeZ];

      G = K.grid(E, E.SMALL ? 120 : 176);
      SKY = E.program(E.QV, `#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform mat4 uInvVP; uniform vec3 uEye; uniform float uT, uStars;
${K.GLSL.hash}
${SKY_GLSL}
void main(){
  vec4 a = uInvVP * vec4(vUv*2.-1., 1., 1.); vec3 rd = normalize(a.xyz/a.w - uEye);
  vec3 c = skyCol(rd);
  if (rd.y > .02) {
    vec2 sp = rd.xz / (rd.y + .3) * 210.;
    vec2 cell = floor(sp); float r = hash12(cell);
    vec2 f = fract(sp) - .5 - (hash22(cell) - .5) * .6;
    float st = step(.9975, r) * smoothstep(.04, .3, rd.y) * uStars;
    c += vec3(.85, .9, 1.) * st * (1. - smoothstep(0., .08, length(f))) * (1. + .6*sin(uT*.9 + r*90.));
  }
  o = vec4(c, 1.);
}`);
      FIELD = E.program(`#version 300 es
precision highp float;
in vec2 aUv; uniform mat4 uVP; uniform sampler2D uH; uniform vec2 uSize; uniform float uRange, uEx; uniform vec4 uWin;
out vec2 vT; out vec3 vW;
void main(){
  vec2 t = uWin.xy + aUv * uWin.zw;
  float h = texture(uH, t).r * uRange * uEx;
  vec3 p = vec3((t.x-.5)*uSize.x, h, (t.y-.5)*uSize.y);
  vT = t; vW = p; gl_Position = uVP * vec4(p, 1.);
}`, `#version 300 es
precision highp float;
in vec2 vT; in vec3 vW; out vec4 o;
uniform sampler2D uH; uniform vec2 uSize, uTx, uC, uBandDir, uRes; uniform float uRange, uEx, uHmin, uR, uMinor, uOff, uGlow, uBandPos, uBandW, uBandI, uElo, uEhi, uFogD, uPR, uSmall;
uniform vec3 uEye, uLo, uHi, uMajor, uBand, uPulse, uGround, uKey, uKeyDir;
uniform vec4 uPT[${NP * TRAIL}];
${SKY_GLSL}
float Hw(vec2 t){ return texture(uH, t).r * uRange * uEx; }
/* cubic B-spline from four bilinear taps: smooth, flowing level sets instead of texel kinks */
float Hs(vec2 uv){
  vec2 sz = 1. / uTx, st = uv * sz - .5, i = floor(st), f = st - i, f2 = f*f, f3 = f2*f;
  vec2 w0 = (1. - 3.*f + 3.*f2 - f3) / 6., w1 = (4. - 6.*f2 + 3.*f3) / 6., w2 = (1. + 3.*f + 3.*f2 - 3.*f3) / 6., w3 = f3 / 6.;
  vec2 g0 = w0 + w1, g1 = w2 + w3;
  vec2 p0 = (i - 1. + w1 / g0 + .5) * uTx, p1 = (i + 1. + w3 / g1 + .5) * uTx;
  return g0.y * (g0.x * texture(uH, p0).r + g1.x * texture(uH, vec2(p1.x, p0.y)).r)
       + g1.y * (g0.x * texture(uH, vec2(p0.x, p1.y)).r + g1.x * texture(uH, p1).r);
}
void main(){
  float hn = Hs(vT);
  float elev = uHmin + hn * uRange;
  /* normal from screen derivatives of the smooth surface: no extra texture reads */
  vec3 sp = vec3(vW.x, hn * uRange * uEx, vW.z);
  vec3 n = normalize(cross(dFdx(sp), dFdy(sp))); if (n.y < 0.) n = -n;
  float dist = length(uEye - vW);
  vec3 rd = (vW - uEye) / dist;
  /* the field dissolves at its edge */
  float rr = length(vW.xz - uC) / uR;
  float isl = 1. - smoothstep(.55, 1., rr);
  /* dark relief, barely lit: enough to read the shape of the land */
  float dif = max(dot(n, uKeyDir), 0.);
  vec3 c = uGround * (.45 + .55*n.y) + uGround * uKey * dif * 1.6;
  /* the drifting band of light */
  float bd = (dot(vW.xz - uC, uBandDir) / uR - uBandPos) / uBandW;
  float band = exp(-bd*bd) * uBandI;
  c += uBand * band * (.006 + .026*dif);
  /* contour lines at real elevations, drifting with the breath */
  float lv = (elev - uOff) / uMinor;
  float fw = max(length(vec2(dFdx(lv), dFdy(lv))), 1e-5);          /* contour intervals per pixel */
  float dmin = abs(fract(lv - .5) - .5) / fw, dmaj = abs(fract(lv * .2 - .5) - .5) / (fw * .2);
  float line = 1. - smoothstep(.3, 1.15, dmin);
  float major = 1. - smoothstep(.45, 1.45, dmaj) + exp(-dmaj * .5) * .16;
  line *= 1. - smoothstep(.07, .26, fw);                             /* crowded (far, grazing): let them go */
  major *= 1. - smoothstep(.09, .34, fw * .2);
  /* on near-flat ground a level set is noise, not landform: let those lines go */
  float slope = sqrt(max(1. - n.y*n.y, 0.)) / max(n.y, .05) / uEx;
  float relief = smoothstep(.006, .03, slope);
  line *= relief; major *= mix(.25, 1., relief);
  /* keep the ground under the words quiet */
  vec2 fc = gl_FragCoord.xy / uRes;
  float words = uSmall > .5 ? smoothstep(.22, .58, fc.y) : smoothstep(.3, .62, fc.x);
  float quiet = mix(.28, 1., words);
  float g = clamp((elev - uElo) / max(uEhi - uElo, 1.), 0., 1.);
  vec3 lc = mix(uLo, uHi, smoothstep(.1, .9, g));
  float near = exp(-dist / (uFogD * .75));
  vec3 L = (lc * line * (1. - min(major, 1.)) + uMajor * major) * uGlow * near * quiet;
  L *= 1. + band * .75;
  L += uBand * band * (line * .16 + major * .42) * near * quiet;
  c += L;
  /* pulses of light running along the major lines */
  float fe = max(length(vec2(dFdx(elev), dFdy(elev))), 1e-3), pul = 0.;
  for (int i = 0; i < ${NP * TRAIL}; i++) {
    vec4 q = uPT[i];
    if (q.w <= 0.) continue;
    float m = 1. - smoothstep(.5, 1.9, abs(elev - q.z) / fe);
    if (m <= 0.) continue;
    vec2 d = vW.xz - q.xy;
    pul += m * q.w * exp(-dot(d, d) * uPR);
  }
  c += uPulse * pul * near;
  /* haze, then the edge */
  float fog = 1. - exp(-dist / uFogD);
  vec3 sc = skyCol(rd);
  c = mix(c, sc, clamp(fog * .6, 0., 1.));
  c = mix(sc, c, isl);
  o = vec4(c, 1.);
}`, ["aUv"]);

      HEADS = K.sprites(E, NP);
      const NM = E.SMALL ? 40 : 80;
      MOTES = K.sprites(E, NM);
      const R = E.rng(seed * 31 + 5);
      MOTES.seed = [];
      for (let i = 0; i < NM; i++) {
        const a = R() * Math.PI * 2, r = Math.sqrt(R()) * GR.Rm * .8;
        MOTES.seed.push({ x: C0[0] + Math.cos(a) * r, z: C0[1] + Math.sin(a) * r, y: 250 + R() * 1600, ph: R() * 6.28, sp: .4 + R() * .6, s: 16 + R() * 26 });
      }

      E.post.threshold = .95; E.post.knee = .6; E.post.bloom = .85; E.post.vignette = .6; E.post.ca = .005; E.post.saturation = 1.05;
      NS.contours = { GR, H, pulses, elevAt, seed, tone: toneName };
    },
    frame(E, S) {
      /* a calm scene needs no more than 30 new frames a second: on alternate frames the engine
         re-finishes the last one (same target, unchanged), which halves the cost on a laptop GPU */
      const T = E.target();
      if (!E.REDUCED && T === lastT && (++tick & 1)) return;
      lastT = T;
      const gl = E.gl, t = E.REDUCED ? STILL_T : S.t;
      S_px = S.px; S_py = S.py;
      const C = buildCamera(E, t); cam = C;
      const vp = C.vp, eye = C.eye;

      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      /* sky */
      gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.BLEND);
      SKY.use().m4("uInvVP", E.M.inv(vp)).v3("uEye", eye).f1("uT", t).f1("uStars", TONE.stars)
        .v3("uZen", TONE.zen).v3("uHor", TONE.hor).v3("uHaze", TONE.haze);
      E.tri();
      gl.depthMask(true);

      /* pulses alive now: trail points on their level sets */
      const PT = new Float32Array(NP * TRAIL * 4);
      const kNow = Math.floor(t / PULSE_EVERY);
      let slot = 0;
      HEADS.count = 0;
      const off = breath(t) * GR.minor;
      for (let k = kNow - Math.ceil(PULSE_LIFE / PULSE_EVERY) - 1; k <= kNow + 1 && slot < NP; k++) {
        if (k < -3) continue;
        if (E.SMALL && k % 3 === 1) continue;
        let P = pulses.get(k);
        if (!P) { P = makePulse(k, vp); pulses.set(k, P); }
        const age = t - P.s0;
        if (!P.n || age < 0 || age > PULSE_LIFE) continue;
        const env = smoothT(age / .9) * (1 - smoothT((age - (PULSE_LIFE - 1.6)) / 1.6));
        if (env < .01) continue;
        for (let j = 0; j < TRAIL; j++) {
          const a2 = age - j * TRAIL_DT; if (a2 < 0) break;
          const p = pulseAt(P, a2), o4 = (slot * TRAIL + j) * 4;
          PT[o4] = p[0]; PT[o4 + 1] = p[1]; PT[o4 + 2] = P.L0 + off; PT[o4 + 3] = env * (j === 0 ? 2.4 : 1.5 * Math.pow(1 - j / TRAIL, 1.5));
        }
        const hp = pulseAt(P, age);
        HEADS.pos.set([hp[0], H.hAt(hp[0], hp[1]) + 40, hp[1]], slot * 3);
        HEADS.col.set(TONE.pulse.map(v => v * env * .9), slot * 3);
        HEADS.size[slot] = 70;
        slot++;
      }
      for (const k of pulses.keys()) if (k < kNow - 6) pulses.delete(k);

      /* field */
      const bdA = GR.look + 1.05;
      const kd = [Math.sin(GR.look + 2.2) * .8, .45, -Math.cos(GR.look + 2.2) * .8];
      const kl = Math.hypot(...kd);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.BLEND);
      E.bindTex(0, H.tex);
      FIELD.use().m4("uVP", vp).i1("uH", 0).f2("uSize", H.sizeX, H.sizeZ).f2("uTx", 1 / H.w, 1 / H.h).f1("uRange", H.range).f1("uEx", H.exag)
        .v4("uWin", GR.win).f1("uHmin", H.meta.hmin).v3("uEye", eye).f2("uC", C0[0], C0[1]).f1("uR", GR.Rm)
        .f1("uMinor", GR.minor).f1("uOff", off).f1("uGlow", .95 + .12 * Math.sin(t * Math.PI * 2 / 17 + .6))
        .f2("uBandDir", Math.cos(bdA), Math.sin(bdA)).f1("uBandPos", bandPos(t)).f1("uBandW", .24).f1("uBandI", 1)
        .f2("uRes", E.W, E.H).f1("uSmall", E.SMALL ? 1 : 0).f1("uElo", GR.elo).f1("uEhi", GR.ehi).f1("uFogD", GR.Rm * 2.2).f1("uPR", 1 / (170 * 170))
        .v3("uLo", TONE.lo).v3("uHi", TONE.hi).v3("uMajor", TONE.major).v3("uBand", TONE.band).v3("uPulse", TONE.pulse)
        .v3("uGround", TONE.ground).v3("uKey", TONE.key).v3("uKeyDir", kd.map(v => v / kl))
        .v3("uZen", TONE.zen).v3("uHor", TONE.hor).v3("uHaze", TONE.haze)
        .v4("uPT", PT);
      G.draw();

      const pxs = K.pxScale(E, C.FOV);
      if (slot) { HEADS.upload(slot); HEADS.draw(vp, pxs, { min: 2.5, max: 12, core: 2.2 }); }

      /* motes: drifting, lit by the band as it passes */
      const bp = bandPos(t), bc = Math.cos(bdA), bs = Math.sin(bdA);
      for (let i = 0; i < MOTES.seed.length; i++) {
        const m = MOTES.seed[i];
        const x = m.x + Math.sin(t * .05 * m.sp + m.ph) * 400, z = m.z + Math.cos(t * .04 * m.sp + m.ph * 1.3) * 400;
        const y = H.hAt(x, z) + m.y + Math.sin(t * .2 * m.sp + m.ph) * 60;
        const rr = Math.hypot(x - C0[0], z - C0[1]) / GR.Rm;
        const bd = (((x - C0[0]) * bc + (z - C0[1]) * bs) / GR.Rm - bp) / .22;
        const k = (.12 + .9 * Math.exp(-bd * bd)) * (1 - smoothT((rr - .5) / .4)) * (.6 + .4 * Math.sin(t * .7 * m.sp + m.ph * 3));
        MOTES.pos.set([x, y, z], i * 3); MOTES.col.set(TONE.mote.map(v => v * k), i * 3); MOTES.size[i] = m.s;
      }
      MOTES.upload(); MOTES.draw(vp, pxs, { min: 1.2, max: 8, core: .6 });
    }
  };
})();
