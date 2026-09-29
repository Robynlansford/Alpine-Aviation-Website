/* =====================================================================
   HARVEST — agriculture-ranching.html (pinned scroll film)
   "Aerial support for growers and ranchers." One flight over one farm,
   a beat for each service the page explains, in the page's order:
     1  cherry drying: water sits in the bowl-like tops of the fruit; the
        helicopter passes low and its downwash (drawn as a radial flow
        field) blows the beads off as glittering spray
     2  crop pollination: along the seed rows; gold pollen lifted by the
        wash drifts across the rows and settles on the female plants,
        once the dew has left
     3  frost control: night, the growers' fires; the helicopter holds a
        steady airspeed and altitude and presses the rising heat back
        down into a warm layer near the surface while the frost retreats
     4  searching & herding: wide over the range, scattered livestock are
        found from above and gathered
     5  aerial surveys: a scan grid sweeps the whole property
   EVERYTHING HERE IS AN ILLUSTRATION: a flat procedural farm, stylised
   aircraft (not a specific airframe), compressed time, not to scale.
   The page says so in its .lp-credit.
   ===================================================================== */
(function () {
  "use strict";
  const NS = window.Living = window.Living || { scenes: {} };
  const K = window.LivingKit;
  const PI = Math.PI, TAU = PI * 2;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const sm = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const mix = (a, b, t) => a + (b - a) * t;
  const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
  const pulse = (x, a, b, c, d) => Math.min(sm((x - a) / (b - a)), 1 - sm((x - c) / (d - c)));
  const fract = x => x - Math.floor(x);
  const gf = v => { const s = String(Math.round(v * 1e4) / 1e4); return /[.e]/.test(s) ? s : s + "."; };

  /* ------------------------------------------------ the farm (metres; +X east, -Z north) */
  const OX0 = -85.5, ODX = 4.5, ONX = 39, OZ0 = -30, ODZ = 6, ONZ = 11, TREE_Y = 3.0, TREE_R = 2.05;
  const ORCH = [OX0 - 2.4, OZ0 - 2.4, OX0 + ODX * (ONX - 1) + 2.4, OZ0 + ODZ * (ONZ - 1) + 2.4];
  const CORN = [110, -170, 540, 170], CROP_H = 2.3, ROW = .9;
  const FROST = [150, -440, 470, -240];
  const PAST = [-760, -1560, 860, -560];
  const SURV = [-800, -1590, 900, 200];
  const LANE = 3;                                   /* the orchard aisle and the seed-row lane (z) */
  const FZ = -340, FX0 = 470, FX1 = 150;            /* the frost pass */
  const CORRAL = [190, -650];
  const TS = 40;                                    /* illustrated seconds per unit of scroll */
  const inR = (x, z, r, m) => { m = m || 0; return x > r[0] - m && x < r[2] + m && z > r[1] - m && z < r[3] + m; };

  const ATM = K.GLSL.atmos;   /* the kit's dusk atmosphere (its sideSun pow() is clamped since the lead's fix) */
  const FARM = `
const vec4 ORCHR = vec4(${ORCH.map(gf)});
const vec3 OGX = vec3(${gf(OX0)}, ${gf(ODX)}, ${gf(ONX)});
const vec3 OGZ = vec3(${gf(OZ0)}, ${gf(ODZ)}, ${gf(ONZ)});
const float TREE_Y = ${gf(TREE_Y)}, TREE_R = ${gf(TREE_R)};
const vec4 CORNR = vec4(${CORN.map(gf)});
const vec4 FROSTR = vec4(${FROST.map(gf)});
const vec4 PASTR = vec4(${PAST.map(gf)});
const vec4 SURVR = vec4(${SURV.map(gf)});
const float CROP_H = ${gf(CROP_H)}, ROW = ${gf(ROW)}, LANE = ${gf(LANE)};
float sdRect(vec2 p, vec4 r){ vec2 c = (r.xy + r.zw) * .5, h = (r.zw - r.xy) * .5; vec2 d = abs(p - c) - h; return length(max(d, 0.)) + min(max(d.x, d.y), 0.); }
/* antialiased line of half-width w (m) at distance d (m); fw = metres per pixel */
float lineAA(float d, float w, float fw){ float ww = max(w, fw * .8); return (1. - smoothstep(ww, ww + fw * 1.2, d)) * min(1., w / ww); }
/* a family of parallel lines, period P; fades out before it can alias */
float gridL(float x, float P, float w){ float fw = max(fwidth(x), 1e-4); float d = abs(fract(x / P - .5) - .5) * P; return lineAA(d, w, fw) * (1. - smoothstep(P * .06, P * .25, fw)); }
/* orchard canopy shadow: march toward the sun through the tree grid */
float orchShadow(vec3 p, vec3 L){
  if (L.y < .004) return 0.;
  float sh = 1.;
  for (int i = 0; i < 6; i++) {
    float y = 1.5 + float(i) * .72;
    if (y <= p.y - .2) continue;
    vec3 q = p + L * ((y - p.y) / L.y);
    if (q.x < ORCHR.x - 1. || q.x > ORCHR.z + 1. || q.z < ORCHR.y - 1. || q.z > ORCHR.w + 1.) continue;
    float ix = clamp(floor((q.x - OGX.x) / OGX.y + .5), 0., OGX.z - 1.);
    float iz = clamp(floor((q.z - OGZ.x) / OGZ.y + .5), 0., OGZ.z - 1.);
    vec3 c = vec3(OGX.x + ix * OGX.y, TREE_Y, OGZ.x + iz * OGZ.y);
    vec3 d = c - p; float t = dot(d, L);
    if (t < .2) continue;
    float r = sqrt(max(dot(d, d) - t * t, 0.));
    sh = min(sh, smoothstep(TREE_R * .5, TREE_R * 1.05, r));
  }
  return sh;
}`;
  /* the frost night: fire light, and the band where the heat is being held down */
  const NIGHT = `
uniform vec4 uFire[16]; uniform float uFireAmt; uniform vec4 uWarm; uniform float uFrost;
vec3 fireLight(vec3 p, vec3 n){
  vec3 s = vec3(0.);
  if (uFireAmt < .001) return s;
  for (int i = 0; i < 16; i++) {
    vec4 f = uFire[i];
    vec3 d = f.xyz + vec3(0., 1.4, 0.) - p; float l2 = dot(d, d);
    float nd = max(dot(n, d * inversesqrt(l2 + 1e-4)), 0.) * .75 + .25;
    s += f.w * nd / (1. + l2 * .006);
  }
  return s * vec3(1.9, .78, .24) * uFireAmt;
}
float warmBand(vec2 x){
  float a = min(uWarm.x, uWarm.y), b = max(uWarm.x, uWarm.y);
  float dx = max(max(a - x.x, x.x - b), 0.), dz = abs(x.y - uWarm.z);
  return 1. - smoothstep(60., 105., length(vec2(dx * 1.6, dz)));
}`;
  /* the same band on the CPU (for particles) */
  let WARM = [0, 0, FZ, 0];
  function warmBand(x, z) {
    const a = Math.min(WARM[0], WARM[1]), b = Math.max(WARM[0], WARM[1]);
    const dx = Math.max(a - x, x - b, 0), dz = Math.abs(z - WARM[2]);
    return 1 - sm((Math.hypot(dx * 1.6, dz) - 60) / 45);
  }
  function surfY(x, z) {
    if (inR(x, z, ORCH)) return Math.abs(z - LANE) < 1.3 ? .3 : 5.0;
    if (inR(x, z, CORN)) return CROP_H + .15;
    if (inR(x, z, FROST)) return 2.0;
    return .3;
  }

  /* ------------------------------------------------ the helicopter's route: [p, x, y, z] */
  const WP = [
    [-.08, -262, 10, 3], [0, -190, 10, 3], [.10, -100, 8.6, 3], [.205, -8, 7.3, 3], [.29, 72, 7.6, 3],
    [.345, 170, 6.8, 3], [.40, 285, 6.8, 3], [.455, 400, 6.8, 3],
    [.485, 468, 10, -12], [.51, 520, 14, -120], [.53, 540, 15, -250], [.545, 512, 15, -330],
    [.555, 470, 15, -340], [.58, 390, 15, -340], [.605, 310, 15, -340], [.63, 230, 15, -340], [.655, 150, 15, -340],
    [.675, 95, 28, -385], [.70, 190, 55, -620], [.725, -110, 60, -960], [.75, -140, 60, -1370], [.775, 260, 60, -1500],
    [.80, 630, 60, -1310], [.825, 540, 65, -930], [.852, 280, 90, -160], [.875, 60, 110, 150],
    [.98, 60, 110, -1520], [1.08, 60, 110, -1790]
  ];
  let ROUTE;
  function buildRoute() {
    const pts = WP.map(w => [w[1], w[2], w[3]]), N = 28, P = [], S = [0], key = [0];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      for (let j = i ? 1 : 0; j <= N; j++) {
        const u = j / N, u2 = u * u, u3 = u2 * u;
        const q = [0, 1, 2].map(k => .5 * (2 * p1[k] + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3));
        if (P.length) { const a = P[P.length - 1]; S.push(S[S.length - 1] + Math.hypot(q[0] - a[0], q[1] - a[1], q[2] - a[2])); }
        P.push(q);
      }
      key.push(S[S.length - 1]);
    }
    /* timing: distance flown as a function of scroll, through the keys, smoothed so the speed changes gently */
    const M = 3200, pa = WP[0][0], pb = WP[WP.length - 1][0], s0 = new Float32Array(M + 1);
    for (let m = 0; m <= M; m++) {
      const p = pa + (pb - pa) * m / M;
      let i = 0; while (i < WP.length - 2 && p > WP[i + 1][0]) i++;
      s0[m] = key[i] + (key[i + 1] - key[i]) * clamp((p - WP[i][0]) / (WP[i + 1][0] - WP[i][0]), 0, 1);
    }
    let src = s0; const R = Math.round(.007 / ((pb - pa) / M));
    for (let pass = 0; pass < 2; pass++) {
      const dst = new Float32Array(M + 1);
      for (let m = 0; m <= M; m++) { let s = 0; for (let k = -R; k <= R; k++) s += src[clamp(m + k, 0, M)]; dst[m] = s / (2 * R + 1); }
      src = dst;
    }
    return { P, S, sOf: src, pa, pb, M };
  }
  function sAt(p) { const R = ROUTE, f = clamp((p - R.pa) / (R.pb - R.pa), 0, 1) * R.M, i = Math.min(R.M - 1, f | 0), k = f - i; return R.sOf[i] + (R.sOf[i + 1] - R.sOf[i]) * k; }
  function posAt(s) {
    const { P, S } = ROUTE; s = clamp(s, 0, S[S.length - 1]);
    let lo = 0, hi = S.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; }
    const k = (s - S[lo]) / Math.max(1e-6, S[hi] - S[lo]), a = P[lo], b = P[hi];
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  }
  function headAt(s) { const a = posAt(s - 3), b = posAt(s + 3), dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; }
  const yawOf = d => Math.atan2(-d[0], -d[1]);
  function heliAt(p) {
    const s = sAt(p), pos = posAt(s), f = headAt(s), f2 = headAt(s + 45);
    const turn = Math.atan2(f[0] * f2[1] - f[1] * f2[0], f[0] * f2[0] + f[1] * f2[1]);
    const spd = (sAt(p + .002) - sAt(p - .002)) / .004;
    return { pos, fwd: f, yaw: yawOf(f), pitch: -.12 * sm(spd / 2500), roll: clamp(-turn * 1.4, -.45, .45), s, spd };
  }
  /* scroll position at which the helicopter first reaches x (orchard + seed rows, flying east) */
  let XT;
  function pAtX(x) {
    let lo = 0, hi = XT.length - 1;
    if (x <= XT[0][1]) return XT[0][0];
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (XT[m][1] <= x) lo = m; else hi = m; }
    const a = XT[lo], b = XT[hi]; return a[0] + (b[0] - a[0]) * clamp((x - a[1]) / Math.max(1e-6, b[1] - a[1]), 0, 1);
  }

  /* ------------------------------------------------ renderers local to this scene */
  let BP, SP;
  /* ray-traced sphere impostors: fruit, water beads, leaf clusters, stems */
  function ballProgram(E) {
    return E.program(`#version 300 es
precision highp float;
in vec2 aQ; in vec4 aC; in vec4 aK;
uniform mat4 uVP; uniform vec3 uEye; uniform float uT; uniform vec4 uWash;
out vec3 vW; out vec2 vQ; flat out vec4 vC; flat out vec4 vK;
void main(){
  vec3 c = aC.xyz; float r = aC.w;
  vK = aK;
  if (r <= 0.) { vW = vec3(0.); vQ = vec2(0.); vC = vec4(0.); gl_Position = vec4(0., 0., -2., 1.); return; }
  if (aK.x > 1.5 && aK.x < 3.5) {                                  /* leaves stir in the rotor wash */
    vec2 dd = c.xz - uWash.xz; float k = uWash.w * exp(-dot(dd, dd) / 60.);
    c += vec3(sin(uT * 11. + aK.y * 40.), .5 * sin(uT * 7. + aK.y * 23.), cos(uT * 9. + aK.y * 31.)) * .05 * k * r;
  }
  vec3 f = c - uEye; float d = length(f); f /= d;
  vec3 up = abs(f.y) < .98 ? vec3(0., 1., 0.) : vec3(1., 0., 0.);
  vec3 rt = normalize(cross(f, up)), u = cross(rt, f);
  float k = d / sqrt(max(d * d - r * r, r * r * .02)) * 1.04;
  vQ = aQ * k;
  vW = c + (rt * aQ.x + u * aQ.y) * r * k;
  vC = vec4(c, r);
  gl_Position = uVP * vec4(vW, 1.);
}`, `#version 300 es
precision highp float;
in vec3 vW; in vec2 vQ; flat in vec4 vC; flat in vec4 vK; out vec4 o;
uniform mat4 uVP; uniform vec3 uEye; uniform float uT, uFogD;
${K.GLSL.hash}
${K.GLSL.noise}
${ATM}
${FARM}
${NIGHT}
float vn3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
void main(){
  vec3 rd = normalize(vW - uEye), oc = uEye - vC.xyz; float r = vC.w;
  float b = dot(oc, rd), h = b * b - (dot(oc, oc) - r * r);
  float kind = vK.x, seed = vK.y;
  if (kind > 1.5 && kind < 3.5) {                                   /* ragged leafy outline */
    float q = sqrt(max(dot(oc, oc) - b * b, 0.)) / r, a = atan(vQ.y, vQ.x);
    float edge = .72 + .22 * vnoise(vec2(a * 3.2 + seed * 13., seed * 7.)) + .1 * vnoise(vec2(a * 11. + seed * 5., 3.));
    if (q > edge) discard;
  }
  if (h < 0.) discard;
  float t = -b - sqrt(h);
  if (t < 0.) discard;
  vec3 p = uEye + rd * t, n = (p - vC.xyz) / r;
  vec4 cp = uVP * vec4(p, 1.); gl_FragDepth = clamp(cp.z / cp.w * .5 + .5, 0., 1.);
  vec3 V = -rd, L = uSunDir;
  float sunUp = smoothstep(-.03, .05, L.y);
  vec3 H = normalize(L + V);
  vec3 c;
  if (kind < .5) {
    /* cherry: glossy dark red, a bowl around the stem, warm rim */
    vec3 top = vec3(vK.z, 0., vK.w); top.y = sqrt(max(0., 1. - dot(top.xz, top.xz)));
    float ct = dot(n, top);
    float bowl = smoothstep(.62, .95, ct);
    vec3 nb = normalize(mix(n, normalize(2. * top * ct - n), bowl * .6));
    vec3 alb = vec3(.20, .007, .014) * (1. - .5 * bowl) * (.9 + .2 * vn3(p * 260.));
    float sh = orchShadow(p + n * .03, L);
    float dif = max(dot(nb, L), 0.) * sh, nh = max(dot(nb, H), 0.);
    float spec = pow(nh, 140.) * 5. + pow(nh, 16.) * .12;
    float fr = pow(clamp(1. - dot(nb, V), 0., 1.), 3.);
    float sss = pow(max(dot(-V, L), 0.), 3.) * (1. - max(dot(n, V), 0.)) * sh;
    c = alb * (uSunCol * (dif * 1.1 + .1 * sunUp) + uZenith * 6.)
      + uSunCol * spec * sh * sunUp
      + vec3(.95, .3, .1) * fr * .32 * (.25 + .75 * sunUp)
      + skyCol(reflect(rd, nb)) * fr * .5
      + vec3(.7, .03, .03) * uSunCol * sss * .28;
    c += alb * fireLight(p, nb) * 3.;
  } else if (kind < 1.5) {
    /* a bead of water: sky and sun reflected, the fruit's red seen through it */
    float fr = .06 + .94 * pow(clamp(1. - dot(n, V), 0., 1.), 5.);
    vec3 refl = skyCol(reflect(rd, n));
    float nh = max(dot(n, H), 0.);
    float glint = pow(nh, 700.) * 70. + pow(nh, 60.) * .6;
    float caus = pow(max(dot(-n, L), 0.), 4.);
    vec3 thru = vec3(.30, .02, .03) * (uSunCol * .5 + uZenith * 8.) + vec3(1.6, .8, .5) * uSunCol * caus * .35;
    c = mix(thru, refl * 1.25 + vec3(.04, .05, .07), fr) + uSunCol * glint * sunUp;
  } else if (kind < 3.5) {
    /* leaf clusters (orchard canopies, young trees in the frost block) */
    vec3 lp = p * (kind < 2.5 ? 1. : 1.7);
    float l1 = vn3(lp * 4.3 + seed * 3.), l2 = vn3(lp * 11. + seed), l3 = vn3(lp * 29.);
    vec3 nn = normalize(n + (vec3(vn3(lp * 3.1 + 1.3), vn3(lp * 3.1 + 7.7), vn3(lp * 3.1 + 4.2)) - .5) * 1.3);
    float clump = smoothstep(.3, .78, l1 * .58 + l2 * .3 + l3 * .12);
    vec3 alb = vec3(.020, .034, .014) * (.4 + 1.2 * clump);
    float sh = kind < 2.5 ? orchShadow(p + n * .15, L) : 1.;
    float dif = max(dot(nn, L), 0.) * sh;
    float back = pow(max(dot(-V, L), 0.), 5.) * (.35 + .65 * (1. - max(dot(n, V), 0.))) * sh;
    float fr = pow(clamp(1. - dot(n, V), 0., 1.), 3.);
    c = alb * (uSunCol * (dif * 1.3 + .08 * sunUp) + uZenith * 5. + uHorizon * .2 * (nn.y * .5 + .5));
    c += vec3(.30, .34, .06) * uSunCol * back * (.25 + .75 * clump) * .22;
    c += uSunCol * vec3(.9, .7, .35) * fr * dif * .25;
    c += alb * fireLight(p, nn) * 2.6;
    if (kind > 2.5) {
      float wb = warmBand(p.xz) * uWarm.w;
      float fk = uFrost * (1. - wb);
      float up = smoothstep(-.3, .7, nn.y);
      c += vec3(.09, .18, .42) * fk * up * (.35 + .65 * l2) * .7;
      c += vec3(1.1, .45, .13) * wb * .05;
    }
  } else {
    /* stems and bark */
    vec3 alb = vK.z > .5 ? vec3(.05, .06, .018) : vec3(.035, .025, .018);
    float dif = max(dot(n, L), 0.) * orchShadow(p + n * .02, L);
    float fr = pow(clamp(1. - dot(n, V), 0., 1.), 3.);
    c = alb * (uSunCol * (dif * 1.2 + .06) + uZenith * 5.) + uSunCol * pow(max(dot(n, H), 0.), 30.) * .12 * vK.z + vec3(.8, .55, .25) * fr * .12 * sunUp;
    c += alb * fireLight(p, n) * 2.;
  }
  c = mix(c, fogCol(rd), 1. - exp(-t / uFogD));
  o = vec4(c, 1.);
}`, ["aQ", "aC", "aK"]);
  }
  function balls(E, n, dynamic) {
    const gl = E.gl, C = new Float32Array(n * 4), Kd = new Float32Array(n * 4);
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const qb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, qb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const cb = gl.createBuffer(), kb = gl.createBuffer();
    [[cb, C, 1], [kb, Kd, 2]].forEach(([buf, arr, loc]) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, arr.byteLength, dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(loc, 1);
    });
    gl.bindVertexArray(null);
    return {
      n, C, K: Kd, count: 0,
      set(i, x, y, z, r, kind, seed, a, b) { C[i * 4] = x; C[i * 4 + 1] = y; C[i * 4 + 2] = z; C[i * 4 + 3] = r; Kd[i * 4] = kind; Kd[i * 4 + 1] = seed; Kd[i * 4 + 2] = a || 0; Kd[i * 4 + 3] = b || 0; },
      upload(k, kOnly) {
        this.count = k == null ? n : k;
        gl.bindBuffer(gl.ARRAY_BUFFER, cb); gl.bufferSubData(gl.ARRAY_BUFFER, 0, C.subarray(0, this.count * 4));
        if (!kOnly) { gl.bindBuffer(gl.ARRAY_BUFFER, kb); gl.bufferSubData(gl.ARRAY_BUFFER, 0, Kd.subarray(0, this.count * 4)); }
      },
      draw() { if (!this.count) return; gl.bindVertexArray(vao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.count); gl.bindVertexArray(null); }
    };
  }
  /* motion-blurred glowing particles: a capsule from pos back along velocity */
  function streakProgram(E) {
    return E.program(`#version 300 es
precision highp float;
in vec2 aQ; in vec3 aP, aV, aC; in vec2 aS;
uniform mat4 uVP; uniform vec2 uRes; uniform float uPx, uMinW, uMaxW;
out vec3 vC; out vec2 vA; out float vLen, vW;
void main(){
  vec4 ch = uVP * vec4(aP, 1.), ct = uVP * vec4(aP - aV * aS.y, 1.);
  vC = vec3(0.); vA = vec2(0.); vLen = 0.; vW = 1.;
  if (ch.w < .02 || ct.w < .02 || aS.x <= 0.) { gl_Position = vec4(0., 0., -2., 1.); return; }
  vec2 hr = uRes * .5, sh = ch.xy / ch.w * hr, st = ct.xy / ct.w * hr;
  vec2 d = sh - st; float len = length(d);
  vec2 dir = len > 1e-3 ? d / len : vec2(1., 0.), nr = vec2(-dir.y, dir.x);
  float wt = aS.x * uPx / ch.w, w = clamp(wt, uMinW, uMaxW);
  float along = aQ.x * (len + 2. * w) - w;
  vec2 pp = st + dir * along + nr * aQ.y * w;
  float k = clamp(along / max(len, 1e-3), 0., 1.);
  float cw = mix(ct.w, ch.w, k), cz = mix(ct.z / ct.w, ch.z / ch.w, k);
  gl_Position = vec4(pp / hr * cw, cz * cw, cw);
  vC = aC * min(1., wt / uMinW); vA = vec2(along, aQ.y * w); vLen = len; vW = w;
}`, `#version 300 es
precision highp float;
in vec3 vC; in vec2 vA; in float vLen, vW; out vec4 o;
void main(){
  float dx = max(max(-vA.x, vA.x - vLen), 0.);
  float r = length(vec2(dx, vA.y)) / vW;
  if (r > 1.) discard;
  float g = exp(-r * r * 3.5) * mix(.3, 1., clamp(vA.x / max(vLen, 1e-3), 0., 1.));
  o = vec4(vC * g, 1.);
}`, ["aQ", "aP", "aV", "aC", "aS"]);
  }
  function streaks(E, n) {
    const gl = E.gl, data = new Float32Array(n * 11);
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const qb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, qb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 1, -1, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, ib); gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
    [[1, 3, 0], [2, 3, 12], [3, 3, 24], [4, 2, 36]].forEach(([loc, sz, off]) => { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, sz, gl.FLOAT, false, 44, off); gl.vertexAttribDivisor(loc, 1); });
    gl.bindVertexArray(null);
    let k = 0;
    return {
      n, get count() { return k; },
      begin() { k = 0; },
      push(px, py, pz, vx, vy, vz, r, g, b, w, len) {
        if (k >= n) return; const o = k * 11;
        data[o] = px; data[o + 1] = py; data[o + 2] = pz; data[o + 3] = vx; data[o + 4] = vy; data[o + 5] = vz;
        data[o + 6] = r; data[o + 7] = g; data[o + 8] = b; data[o + 9] = w; data[o + 10] = len; k++;
      },
      draw(vp, pxs, minW, maxW) {
        if (!k) return;
        gl.bindBuffer(gl.ARRAY_BUFFER, ib); gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, k * 11));
        gl.enable(gl.DEPTH_TEST); gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
        SP.use().m4("uVP", vp).f2("uRes", E.W, E.H).f1("uPx", pxs).f1("uMinW", (minW || 1) * E.scale).f1("uMaxW", (maxW || 8) * E.scale);
        gl.bindVertexArray(vao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, k); gl.bindVertexArray(null);
        gl.depthMask(true); gl.disable(gl.BLEND);
      }
    };
  }

  /* plain lit meshes: the stems and the twig of the hero cluster */
  function solidProgram(E) {
    return E.program(`#version 300 es
precision highp float;
in vec3 aP, aN; in float aK; uniform mat4 uVP; out vec3 vW, vN; out float vK;
void main(){ vW = aP; vN = aN; vK = aK; gl_Position = uVP * vec4(aP, 1.); }`, `#version 300 es
precision highp float;
in vec3 vW, vN; in float vK; out vec4 o;
uniform vec3 uEye; uniform float uFogD;
${ATM}
${FARM}
void main(){
  vec3 V = normalize(uEye - vW), n = normalize(vN); if (dot(n, V) < 0.) n = -n;
  vec3 L = uSunDir; float sunUp = smoothstep(-.03, .05, L.y);
  vec3 alb = vK > 1.5 ? vec3(.03, .06, .016) : vK > .5 ? vec3(.055, .065, .018) : vec3(.03, .022, .016);
  float sh = orchShadow(vW + n * .01, L);
  float dif = max(dot(n, L), 0.) * sh;
  float fr = pow(clamp(1. - dot(n, V), 0., 1.), 3.);
  vec3 H = normalize(L + V);
  float gloss = vK > 1.5 ? .35 : vK > .5 ? .12 : 0.;
  vec3 c = alb * (uSunCol * (dif * 1.2 + .06 * sunUp) + uZenith * 5.) + uSunCol * pow(max(dot(n, H), 0.), 40.) * gloss * sh + vec3(.8, .5, .22) * fr * .08 * sunUp;
  if (vK > 1.5) {
    float thru = max(-dot(n, L), 0.) * sh;
    float vein = 1. - smoothstep(.0, .12, abs(fract(dot(vW, vec3(37., 11., 23.))) - .5));
    c += vec3(.28, .42, .06) * uSunCol * thru * (.35 + .25 * vein) * .5;
  }
  o = vec4(mix(c, fogCol(-V), 1. - exp(-length(uEye - vW) / uFogD)), 1.);
}`, ["aP", "aN", "aK"]);
  }

  /* ------------------------------------------------ scene state */
  let SURVQ, SVP, SOLID, STEMS, E0, SKY, AC, GROUND, GP, CORNM, CP, RIDGE, RP, TREES, FRUIT, BEADS, WASH, SPRAY, POLLEN, EMBERS;
  let DOTS, TASSELS, FIRES, PUFFS, FROSTS, HERD, CORRALR, ROUTES, ALT;
  let beadSrc, spraySrc, pollenSrc, tassel, fires, puffSrc, frostSrc, herdSrc, groups, macro;
  const lab = {};

  /* golden hour (fruit, seed rows) -> night (frost) -> blue hour (range) -> sunrise (survey) */
  function atmosAt(p) {
    const set = sm((p - .445) / .085), blue = sm((p - .67) / .1), rise = sm((p - .85) / .15);
    const el = mix(mix(.055, .075, sm((p - .3) / .12)), -.22, set) + blue * .12 + rise * .13;
    const az = mix(PI * 1.3, PI * .08, sm((p - .55) / .12));
    const g = 1 - set;
    const sun = [0, 1, 2].map(i => [2.5, 1.2, .45][i] * g + [2.2, 1.05, .5][i] * rise * .75);
    let zenith = mix3([.010, .018, .05], [.004, .008, .024], set);
    zenith = mix3(zenith, [.02, .038, .09], blue); zenith = mix3(zenith, [.014, .024, .06], rise);
    let horizon = mix3([.46, .25, .11], [.035, .05, .11], set);
    horizon = mix3(horizon, [.15, .13, .22], blue); horizon = mix3(horizon, [.48, .28, .14], rise);
    return K.atmos({ sunAz: az, sunEl: el, sun, zenith, horizon });
  }

  /* camera: five shots, cross-faded */
  const axis = (yd, pd) => { const y = yd * PI / 180, q = pd * PI / 180; return [-Math.cos(y) * Math.cos(q), Math.sin(q), -Math.sin(y) * Math.cos(q)]; };
  function camAt(E, p, hs) {
    const SMALL = E.SMALL, hp = hs.pos, f = hs.fwd, sd = [-f[1], f[0]];
    /* A · on the crown of a cherry tree, looking down the rows at the approaching helicopter */
    const eA = [mix(-8.60, -8.635, sm(p / .22)), mix(5.36, 5.35, sm(p / .22)), mix(.66, .645, sm(p / .22))];
    const lift = pulse(p, .1, .165, .185, .205);
    const aA = axis(SMALL ? 22 : 8, (SMALL ? -21 : -14) + (SMALL ? 3 : 5) * lift);
    const tA = [eA[0] + aA[0] * 6, eA[1] + aA[1] * 6, eA[2] + aA[2] * 6];
    /* B · chase over the orchard, then swing round ahead of it to watch it come down the seed rows */
    const orbit = sm((p - .285) / .075), th = mix(PI, 0, orbit);
    const Rr = mix(21, 36, orbit), up = mix(5, 6.2, orbit);
    /* swing round on the south side, so the low sun stays behind the camera while it turns */
    const eB = [hp[0] + f[0] * Math.cos(th) * Rr + sd[0] * (Math.sin(th) * Rr * .8 + 7 * orbit), 0, hp[2] + f[1] * Math.cos(th) * Rr + sd[1] * (Math.sin(th) * Rr * .8 + 7 * orbit)];
    eB[1] = Math.max(hp[1] + up, inR(eB[0], eB[2], ORCH, 4) ? 9.5 : 4);
    const tgo = mix(26, -48, orbit);
    const tB = [hp[0] + f[0] * tgo, hp[1] - mix(3.5, 3.0, orbit) + 2.2 * Math.sin(orbit * PI), hp[2] + f[1] * tgo];
    /* C · the frost night, across the block */
    const kf = sm((p - .5) / .17);
    const eC = [mix(398, 356, kf), mix(36, 40, kf), mix(-204, -212, kf)];
    const tC = mix3([300, 2, -356], [hp[0], hp[1] - 12, hp[2]], .3 * pulse(p, .54, .58, .66, .7));
    /* D · wide over the range at blue hour */
    const kd = sm((p - .7) / .14);
    const eD = [mix(470, 430, kd), mix(560, 590, kd), mix(-250, -275, kd)];
    const tD = [mix(-190, -160, kd), 0, mix(-1170, -1150, kd)];
    /* E · the whole property from high above, sunrise behind it */
    const ke = sm((p - .86) / .14);
    const eE = [mix(1480, 1420, ke), mix(1250, 1360, ke), mix(460, 420, ke)];
    const tE = SMALL ? [60, 0, -700] : [-250, 0, -430];

    const wAB = sm((p - .236) / .06), wABy = sm((p - .228) / .035);
    const wBC = sm((p - .462) / .07), wCD = sm((p - .655) / .065), wDE = sm((p - .83) / .06);
    let eye = [mix(eA[0], eB[0], wAB), mix(eA[1], eB[1], wABy), mix(eA[2], eB[2], wAB)];
    let tgt = mix3(tA, tB, wAB);
    eye = mix3(eye, eC, wBC); tgt = mix3(tgt, tC, wBC);
    eye = mix3(eye, eD, wCD); tgt = mix3(tgt, tD, wCD);
    eye = mix3(eye, eE, wDE); tgt = mix3(tgt, tE, wDE);
    if (SMALL) { /* portrait: step back a little on the wide shots */
      const wide = Math.max(wCD, 0) ;
      const dx = eye[0] - tgt[0], dy = eye[1] - tgt[1], dz = eye[2] - tgt[2];
      const k = 1 + .18 * wide;
      eye = [tgt[0] + dx * k, tgt[1] + dy * k, tgt[2] + dz * k];
    }
    const near = p < .25 ? .012 : p < .32 ? mix(.012, .4, sm((p - .25) / .07)) : mix(.4, 6, sm((p - .66) / .08));
    return { eye, tgt, near };
  }

  NS.scenes.harvest = {
    still: .125,
    async init(E) {
      E0 = E;
      const gl = E.gl, SMALL = E.SMALL;
      ROUTE = buildRoute();
      XT = []; for (let i = 0; i <= 2400; i++) { const p = -.08 + .54 * i / 2400; XT.push([p, posAt(sAt(p))[0]]); }
      SKY = K.sky(E); AC = K.aircraft(E);
      SOLID = solidProgram(E);
      BP = ballProgram(E); SP = streakProgram(E);

      /* ---- ground ---- */
      const G = 40000;
      GROUND = K.vao(E, [[new Float32Array([-G, 0, -G, G, 0, -G, -G, 0, G, G, 0, G]), 3]], new Uint32Array([0, 2, 1, 1, 2, 3]));
      GP = E.program(`#version 300 es
precision highp float;
in vec3 aP; uniform mat4 uVP; out vec3 vW;
void main(){ vW = aP; gl_Position = uVP * vec4(aP, 1.); }`, `#version 300 es
precision highp float;
in vec3 vW; out vec4 o;
uniform vec3 uEye, uIce, uGold, uCream;
uniform float uT, uFogD, uInk;
uniform vec4 uScan, uSurv, uPing[5];
${K.GLSL.hash}
${K.GLSL.noise}
${ATM}
${FARM}
${NIGHT}
void main(){
  vec2 x = vW.xz;
  float dist = length(uEye - vW);
  vec3 V = (uEye - vW) / max(dist, 1e-3);
  float near = 1. - smoothstep(30., 300., dist);
  vec3 L = uSunDir;
  float sunUp = smoothstep(-.03, .05, L.y);
  /* patchwork of parcels around the farm */
  vec2 po = x + vec2(37., 11.), pc = floor(po / vec2(310., 230.));
  float h1 = hash12(pc), h2 = hash12(pc + 17.3);
  float big = fbm(x * .0035), mid = vnoise(x * .05), fine = vnoise(x * 1.1);
  vec3 soil = vec3(.050, .041, .033), sage = vec3(.028, .040, .028), straw = vec3(.074, .061, .040);
  vec3 alb = h1 < .3 ? soil : (h2 < .5 ? sage : straw);
  float grass = h1 < .3 ? .25 : 1.;
  float ang = floor(h2 * 4.) * .7853982;
  float fur = gridL(dot(x, vec2(cos(ang), sin(ang))), 3.5, .4);
  alb *= 1. - .3 * fur * step(h1, .66);
  alb *= .78 + .35 * big + .18 * mid;
  float fence = max(gridL(po.x, 310., .35), gridL(po.y, 230., .35));
  /* farm blocks */
  float dO = sdRect(x, ORCHR), dC = sdRect(x, CORNR), dF = sdRect(x, FROSTR), dP = sdRect(x, PASTR);
  float fO = max(fwidth(dO), 1e-3), fC = max(fwidth(dC), 1e-3), fF = max(fwidth(dF), 1e-3), fP = max(fwidth(dP), 1e-3);
  float inO = 1. - smoothstep(-fO, fO, dO), inF = 1. - smoothstep(-fF, fF, dF), inP = 1. - smoothstep(-fP, fP, dP), inC = 1. - smoothstep(-fC, fC, dC);
  fence *= 1. - max(max(inO, inF), max(inP, inC));
  float edges = max(max(lineAA(abs(dO), .5, fO), lineAA(abs(dC), .5, fC)), max(lineAA(abs(dF), .5, fF), lineAA(abs(dP), .7, fP)));
  fence = max(fence, edges * .3);
  /* a creek winding through the range, holding the sky */
  float cx = 150. + 170. * sin(x.y * .0042 + .7) + 55. * sin(x.y * .013 + 2.1);
  float dCr = abs(x.x - cx), fCr = max(fwidth(dCr), 1e-3);
  float creek = lineAA(dCr, 2.2, fCr) * inP * (1. - smoothstep(-40., 0., x.y + 600.));
  /* orchard floor: grass aisles, bare strips under the trees */
  float dzO = abs(fract((x.y - OGZ.x) / OGZ.y + .5) - .5) * OGZ.y;
  float strip = 1. - smoothstep(1.0, 1.7, dzO);
  vec3 oAlb = mix(sage * (.9 + .5 * mid + .5 * (fine - .5) * near), soil * .75, strip);
  alb = mix(alb, oAlb, inO); grass = mix(grass, mix(1., .35, strip), inO);
  /* frost block floor */
  float dzF = abs(fract((x.y - FROSTR.y) / 5.) - .5) * 5.;
  alb = mix(alb, mix(soil * .8, sage, smoothstep(.6, 1.3, dzF)) * (.85 + .3 * mid), inF);
  /* the range: dry grass */
  alb = mix(alb, straw * (.7 + .55 * big + .25 * mid + .3 * (fine - .5) * near), inP); grass = mix(grass, 1., inP);
  /* farm roads */
  float road = max(lineAA(abs(x.y - 46.), 1.8, max(fwidth(x.y), 1e-3)), lineAA(abs(x.x - 580.), 1.8, max(fwidth(x.x), 1e-3)) * step(x.y, 60.) * step(-1620., x.y));
  alb = mix(alb, vec3(.062, .056, .048), road);
  alb *= .92 + .16 * fine * near;
  alb *= 1. - .35 * lineAA(dCr, 7., fCr) * inP;
  /* light: grass blades catch a low sun */
  float sh = dO < 120. ? orchShadow(vW + vec3(0., .02, 0.), L) : 1.;
  float dif = mix(max(L.y, 0.) * 1.4, .36 * sunUp, grass);
  vec3 c = alb * (uSunCol * dif * sh * 1.3 + uZenith * 5. + uHorizon * .22);
  c += alb * fireLight(vW, vec3(0., 1., 0.)) * 1.6;
  /* frost night: a pale sheen of frost, pushed back where the heat is held down */
  float wb = warmBand(x) * uWarm.w, frostArea = 1. - smoothstep(0., 60., dF);
  c += vec3(.045, .085, .18) * uFrost * (1. - wb) * frostArea * (.45 + .55 * fine);
  c += vec3(.95, .40, .12) * wb * frostArea * .05;
  c = mix(c, fogCol(reflect(-V, vec3(0., 1., 0.))) * .75, creek * .9);
  /* ink: fence lines and block edges */
  float fade = exp(-dist / (uFogD * .7));
  c += mix(uIce, uGold, sunUp * .85) * fence * uInk * fade * .55;
  /* the search ring, and a ping where livestock is found */
  if (uScan.w > .001) {
    float d = length(x - uScan.xy);
    c += uIce * (lineAA(abs(d - uScan.z), 1.6, max(fwidth(d), 1e-3)) * 1.3 + (1. - smoothstep(uScan.z * .1, uScan.z, d)) * .1) * uScan.w;
  }
  for (int i = 0; i < 5; i++) {
    vec4 pg = uPing[i];
    if (pg.w > .001) { float d = length(x - pg.xy); c += uCream * lineAA(abs(d - pg.z), 1.8, max(fwidth(d), 1e-3)) * pg.w; }
  }
  c = mix(c, fogCol(-V), 1. - exp(-dist / uFogD));
  o = vec4(c, 1.);
}`, ["aP"]);

      /* ---- the seed-row block: one box, the rows are drawn on its top ---- */
      const cm = new K.Mesh().box([(CORN[0] + CORN[2]) / 2, CROP_H / 2, (CORN[1] + CORN[3]) / 2], [(CORN[2] - CORN[0]) / 2, CROP_H / 2, (CORN[3] - CORN[1]) / 2], 0);
      CORNM = cm.build(E);
      CP = E.program(`#version 300 es
precision highp float;
in vec3 aP, aN; in float aK; uniform mat4 uVP; out vec3 vW, vN;
void main(){ vW = aP; vN = aN; gl_Position = uVP * vec4(aP, 1.); }`, `#version 300 es
precision highp float;
in vec3 vW, vN; out vec4 o;
uniform vec3 uEye; uniform float uT, uFogD, uDew; uniform vec4 uPol;
${K.GLSL.hash}
${K.GLSL.noise}
${ATM}
${FARM}
void main(){
  vec3 n = normalize(vN);
  float dist = length(uEye - vW); vec3 V = (uEye - vW) / dist;
  vec3 L = uSunDir; float sunUp = smoothstep(-.03, .05, L.y);
  float rz = (vW.z - CORNR.y) / ROW, fw = max(fwidth(rz), 1e-4);
  vec3 c;
  if (n.y > .5) {
    float k = floor(rz), fr = fract(rz), edge = abs(fr - .5);
    float male = 1. - step(.5, mod(k, 5.));
    float gap = smoothstep(.33, .35 + fw * 1.5, edge);
    float far = smoothstep(.25, .7, fw);
    gap = mix(gap, .3, far);
    float lf = vnoise(vW.xz * vec2(1.7, 5.)) * .6 + vnoise(vW.xz * vec2(7., 19.)) * .4 * (1. - smoothstep(10., 60., dist));
    vec3 alb = mix(vec3(.030, .050, .020), vec3(.085, .066, .028), male * .8 * (1. - far)) * (.7 + .6 * lf);
    alb *= 1. - gap * .75;
    c = alb * (uSunCol * .42 * sunUp * (1. - gap * .6) * 1.35 + uZenith * 5. + uHorizon * .25);
    /* the female plants the pollen has reached */
    float lane = 1. - smoothstep(10., 14.5, abs(vW.z - LANE));
    float done = (1. - smoothstep(uPol.x - 40., uPol.x, vW.x)) * step(CORNR.x, vW.x);
    float fem = (1. - male) * (1. - gap);
    float row = mix(1. - smoothstep(0., .3, edge), .5, far);
    c += vec3(1.6, 1.3, .8) * fem * row * lane * done * uPol.y * .75;
    /* dew on the leaves, gone once the sun is up */
    if (uDew > .01 && dist < 70.) {
      vec2 g = vW.xz * 6., cell = floor(g); float hh = hash12(cell);
      vec2 ofs = fract(g) - .5 - (hash22(cell) - .5) * .6;
      float sp = step(.93, hh) * (1. - smoothstep(0., .09, length(ofs))) * (.5 + .5 * sin(uT * 3. + hh * 60.));
      c += vec3(1.3, 1.45, 1.7) * sp * uDew * 2.2 * (1. - smoothstep(30., 70., dist));
    }
  } else {
    float st = vnoise(vec2(dot(vW.xz, vec2(n.z, -n.x)) * 5., vW.y * .6));
    vec3 alb = vec3(.02, .032, .014) * (.6 + .8 * st) * smoothstep(0., CROP_H, vW.y + .3);
    c = alb * (uSunCol * (max(dot(n, L), 0.) * 1.2 + .1 * sunUp) + uZenith * 4.);
  }
  c = mix(c, fogCol(-V), 1. - exp(-dist / uFogD));
  o = vec4(c, 1.);
}`, ["aP", "aN", "aK"]);

      /* ---- distant ranges ringing the valley (illustration) ---- */
      {
        const n = 900, pos = [], vv = [], idx = [], rr = E.rng(11), ph = Array.from({ length: 8 }, () => rr() * TAU);
        for (let i = 0; i <= n; i++) {
          const a = i / n * TAU;
          let h = 0;
          [[3, 240], [7, 160], [13, 100], [29, 55], [61, 26], [127, 12], [251, 6]].forEach(([fq, amp], k) => h += Math.sin(a * fq + ph[k]) * amp);
          h = Math.max(70, 360 + h + 320 * Math.max(0, Math.sin(a + 1.9)));
          const R = 14000 + Math.sin(a * 5 + ph[7]) * 1500;
          pos.push(Math.cos(a) * R, -60, Math.sin(a) * R, Math.cos(a) * R, h, Math.sin(a) * R);
          vv.push(0, 1);
          if (i < n) { const b = i * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
        }
        RIDGE = { vao: K.vao(E, [[new Float32Array(pos), 3], [new Float32Array(vv), 1]], new Uint32Array(idx)), count: idx.length };
        RP = E.program(`#version 300 es
precision highp float;
in vec3 aP; in float aV; uniform mat4 uVP; out vec3 vW; out float vV;
void main(){ vW = aP; vV = aV; gl_Position = uVP * vec4(aP, 1.); }`, `#version 300 es
precision highp float;
in vec3 vW; in float vV; out vec4 o; uniform vec3 uEye;
${ATM}
void main(){
  vec3 rd = normalize(vW - uEye);
  vec3 c = vec3(.010, .011, .018) + (uSunCol * .05 + uHorizon * .3) * smoothstep(.9, 1., vV) * .5;
  o = vec4(mix(c, fogCol(rd), .6), 1.);
}`, ["aP", "aV"]);
      }

      /* ---- the survey: drawn as light just above the crop tops, so nothing hides it ---- */
      {
        const m = 60, y = 5.4;
        SURVQ = K.vao(E, [[new Float32Array([SURV[0] - m, y, SURV[1] - m, SURV[2] + m, y, SURV[1] - m, SURV[0] - m, y, SURV[3] + m, SURV[2] + m, y, SURV[3] + m]), 3]], new Uint32Array([0, 2, 1, 1, 2, 3]));
        SVP = E.program(`#version 300 es
precision highp float;
in vec3 aP; uniform mat4 uVP; out vec3 vW;
void main(){ vW = aP; gl_Position = uVP * vec4(aP, 1.); }`, `#version 300 es
precision highp float;
in vec3 vW; out vec4 o;
uniform vec3 uEye, uIce, uCream; uniform vec4 uSurv; uniform float uFogD;
${FARM}
void main(){
  vec2 x = vW.xz;
  float fade = exp(-length(uEye - vW) / (uFogD * .7));
  float dS = sdRect(x, SURVR), fS = max(fwidth(dS), 1e-3), inS = 1. - smoothstep(-fS, fS, dS);
  float cov = smoothstep(uSurv.x - 5., uSurv.x + 5., x.y) * inS;
  float g = max(gridL(x.x - SURVR.x, 50., .45), gridL(x.y - SURVR.y, 50., .45));
  float dO = sdRect(x, ORCHR), dC = sdRect(x, CORNR), dF = sdRect(x, FROSTR), dP = sdRect(x, PASTR);
  float fO = max(fwidth(dO), 1e-3), fC = max(fwidth(dC), 1e-3), fF = max(fwidth(dF), 1e-3), fP = max(fwidth(dP), 1e-3);
  float farm = step(min(min(dO, dC), min(dF, dP)), 0.);
  float edges = max(max(lineAA(abs(dO), .5, fO), lineAA(abs(dC), .5, fC)), max(lineAA(abs(dF), .5, fF), lineAA(abs(dP), .7, fP)));
  vec2 po = x + vec2(37., 11.);
  float fence = max(gridL(po.x, 310., .35), gridL(po.y, 230., .35)) * (1. - farm);
  vec3 gc = mix(uIce, uCream, uSurv.z);
  vec3 c = gc * (g * .6 + fence * .8 + edges * 2.2) * cov * uSurv.y * (.45 + .55 * fade);
  c += uIce * .02 * cov * uSurv.y * (1. - uSurv.z) + uCream * .035 * cov * uSurv.z;
  c += gc * lineAA(abs(dS), 1.2, fS) * cov * uSurv.y * 1.2;
  float qb = (x.y - uSurv.x) / 16.;
  c += uIce * exp(-qb * qb) * inS * uSurv.y * 1.3 * (1. - uSurv.z);
  c += uIce * smoothstep(uSurv.x - 220., uSurv.x, x.y) * (1. - cov) * inS * uSurv.y * .05;
  o = vec4(c, 1.);
}`, ["aP"]);
      }

      /* ---- the orchard ---- */
      const R = E.rng(21);
      const leaves = [], dots = [];
      for (let j = 0; j < ONZ; j++) for (let i = 0; i < ONX; i++) {
        const x = OX0 + i * ODX, z = OZ0 + j * ODZ;
        const nb = SMALL ? 3 : 5, bl = [[0, 0, 0, 1.45]];
        for (let k = 0; k < nb; k++) { const a = k / nb * TAU + R() * .8; bl.push([Math.cos(a) * .85, -.2 + R() * .55, Math.sin(a) * .85, 1.05 + R() * .22]); }
        bl.push([(R() - .5) * .4, .95, (R() - .5) * .4, .95 + R() * .15]);
        if (!SMALL) bl.push([(R() - .5) * 1.4, .5 + R() * .4, (R() - .5) * 1.4, .8]);
        bl.forEach(b => leaves.push([x + b[0], TREE_Y + b[1], z + b[2], b[3], 2, R()]));
        for (let k = 0; k < (SMALL ? 6 : 11); k++) {
          const a = R() * TAU, y = -.45 + R() * .8, rr = Math.sqrt(1 - y * y);
          dots.push([x + Math.cos(a) * rr * TREE_R * .98, TREE_Y + y * TREE_R * .9, z + Math.sin(a) * rr * TREE_R * .98]);
        }
      }
      /* young trees in the frost block */
      const young = [];
      for (let z = FROST[1] + 2.5; z < FROST[3]; z += 5) for (let x = FROST[0] + 2; x < FROST[2]; x += SMALL ? 7 : 3.5) young.push([x + (R() - .5) * .3, 1.25 + R() * .15, z + (R() - .5) * .3, .72 + R() * .22, 3, R()]);
      /* the hero cluster: cherries on short stems from one spur, water in their tops */
      macro = { spur: [-8.84, 5.275, .545] };
      const hero = [], stemMesh = new K.Mesh(), heroLeaves = [];
      {
        const Rh = E.rng(5), S0 = macro.spur, cs = [];
        let tries = 0;
        while (cs.length < 7 && tries++ < 400) {
          const a = Rh() * TAU, tilt = .25 + Rh() * .42, len = .034 + Rh() * .02, r = .0118 + Rh() * .0016;
          const d = [Math.sin(tilt) * Math.cos(a), -Math.cos(tilt), Math.sin(tilt) * Math.sin(a) * .8];
          const dl = Math.hypot(...d); d[0] /= dl; d[1] /= dl; d[2] /= dl;
          const c = [S0[0] + d[0] * (len + r), S0[1] + d[1] * (len + r), S0[2] + d[2] * (len + r)];
          if (cs.some(o => Math.hypot(o.c[0] - c[0], o.c[1] - c[1], o.c[2] - c[2]) < (o.r + r) * 1.08)) continue;
          cs.push({ c, r, top: [-d[0], -d[1], -d[2]], len });
        }
        cs.forEach(ch => {
          hero.push(ch);
          /* stem: a thin curved tube from the spur into the top of the fruit */
          const e = [ch.c[0] + ch.top[0] * ch.r * .75, ch.c[1] + ch.top[1] * ch.r * .75, ch.c[2] + ch.top[2] * ch.r * .75];
          let prev = S0;
          for (let k = 1; k <= 6; k++) { const u = k / 6, sag = Math.sin(u * PI) * .004; const q = [mix(S0[0], e[0], u), mix(S0[1], e[1], u) + sag, mix(S0[2], e[2], u)]; stemMesh.tube(prev, q, .0008, .0008, 1, 6); prev = q; }
        });
        /* the twig the spur grows from, disappearing into the leaves */
        const tw = [-9.16, 5.1, .34], tm = [-9.0, 5.22, .45];
        stemMesh.tube(S0, tm, .0045, .004, 0, 8); stemMesh.tube(tm, tw, .004, .0035, 0, 8);
        stemMesh.ellipsoid(S0, [.0055, .0055, .0055], 0, 8, 6);
      }
      {
        /* a rosette of leaves at the spur, none of them between the camera and the fruit */
        const Rl = E.rng(8), S0 = macro.spur, away = Math.atan2(-.105, -.24);
        const leaf = (base, ang, droop, len, wid, roll) => {
          const dir = [Math.cos(ang) * Math.cos(droop), -Math.sin(droop), Math.sin(ang) * Math.cos(droop)];
          let side = [-Math.sin(ang), 0, Math.cos(ang)];
          let nn = [dir[1] * side[2] - dir[2] * side[1], dir[2] * side[0] - dir[0] * side[2], dir[0] * side[1] - dir[1] * side[0]];
          if (nn[1] < 0) nn = nn.map(v => -v);
          const cr = Math.cos(roll), sr = Math.sin(roll);
          side = side.map((v, k) => v * cr + nn[k] * sr); nn = nn.map((v, k) => v * cr - side[k] * sr);
          const b = stemMesh.p.length / 3, N = 9;
          for (let i = 0; i <= N; i++) {
            const u = i / N, w = Math.sin(Math.pow(u, .75) * PI) * wid * (1 - .2 * u), bend = u * u * len * .18;
            const c = [base[0] + dir[0] * len * u - nn[0] * bend, base[1] + dir[1] * len * u - nn[1] * bend, base[2] + dir[2] * len * u - nn[2] * bend];
            for (const sgn of [-1, 1]) stemMesh.v(c[0] + side[0] * w * sgn + nn[0] * w * .22, c[1] + side[1] * w * sgn + nn[1] * w * .22, c[2] + side[2] * w * sgn + nn[2] * w * .22, nn[0] - side[0] * sgn * .25, nn[1] - side[1] * sgn * .25, nn[2] - side[2] * sgn * .25, 2);
            if (i < N) { const a = b + i * 2; stemMesh.i.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
          }
          stemMesh.tube(base, [base[0] + dir[0] * .012, base[1] + dir[1] * .012, base[2] + dir[2] * .012], .0009, .0008, 1, 5);
        };
        for (let k = 0; k < (SMALL ? 6 : 9); k++) {
          const ang = away + (k / ((SMALL ? 6 : 9) - 1) - .5) * 3.6 + (Rl() - .5) * .35;
          leaf([S0[0] + (Rl() - .5) * .01, S0[1] + .004, S0[2] + (Rl() - .5) * .01], ang, .15 + Rl() * .45, .085 + Rl() * .035, .026 + Rl() * .008, (Rl() - .5) * .8);
        }
        /* a second spur further back, so the leaves read as a branch, not a posy */
        const S1 = [S0[0] - .16, S0[1] - .05, S0[2] - .09];
        for (let k = 0; k < (SMALL ? 3 : 6); k++) leaf(S1, away + (Rl() - .5) * 4, .1 + Rl() * .5, .09 + Rl() * .03, .028, (Rl() - .5) * .8);
      }
      STEMS = stemMesh.build(E);
      /* cherries on the trees either side of the aisle near the camera */
      const fruit = [...hero.map(h => [h.c[0], h.c[1], h.c[2], h.r, 0, R(), h.top[0], h.top[2]])];
      const beadList = hero.map((h, i) => ({ c: h.c, r: h.r, top: h.top, br: .0044 + R() * .0012, hero: true, pL: .197 + i * .0024 + R() * .002, ts: 5,
        v: [(R() - .5) * 1.6, -1.2 - R() * 1.6, -2.2 - R() * 2.2] }));
      hero.forEach((h, i) => { if (i % 2 === 0) beadList.push({ c: h.c, r: h.r, top: [h.top[0] + .55, h.top[1] - .3, h.top[2] + .5], br: .0026, hero: true, pL: .199 + i * .002, ts: 5, v: [(R() - .5) * 1.4, -1.5 - R(), -2 - R() * 2] }); });
      for (let j = 5; j <= 6; j++) for (let i = 0; i < ONX; i++) {
        const x = OX0 + i * ODX, z = OZ0 + j * ODZ;
        if (Math.abs(x + 8) > 34) continue;
        const toward = Math.sign(LANE - z);
        for (let s = 0; s < (SMALL ? 5 : 10); s++) {
          const a = (R() - .5) * 2.4, y = -.35 + R() * .75, rr = Math.sqrt(1 - y * y);
          const dir = [Math.sin(a) * rr, y, (R() < .8 ? toward : -toward) * Math.cos(a) * rr];
          const sp = [x + dir[0] * TREE_R * .86, TREE_Y + dir[1] * TREE_R * .86, z + dir[2] * TREE_R * .86];
          if (Math.hypot(sp[0] - macro.spur[0], sp[1] - macro.spur[1], sp[2] - macro.spur[2]) < .5) continue;
          for (let k = 0; k < 2 + (R() < .5 ? 1 : 0); k++) {
            const aa = R() * TAU, tl = .2 + R() * .4, len = .035 + R() * .02, r = .0115 + R() * .002;
            const d = [Math.sin(tl) * Math.cos(aa) + dir[0] * .3, -Math.cos(tl), Math.sin(tl) * Math.sin(aa) + dir[2] * .3], dl = Math.hypot(...d);
            const c = [sp[0] + d[0] / dl * (len + r), sp[1] + d[1] / dl * (len + r), sp[2] + d[2] / dl * (len + r)];
            const top = [-d[0] / dl, -d[1] / dl, -d[2] / dl];
            fruit.push([c[0], c[1], c[2], r, 0, R(), top[0], top[2]]);
            beadList.push({ c, r, top, br: .004 + R() * .0015, hero: false, pL: pAtX(c[0]) - .0015 + R() * .004, ts: TS,
              v: [(R() - .5) * 2, .6 + R() * 1.6, Math.sign(c[2] - LANE) * (2.5 + R() * 3.5)] });
          }
        }
      }
      beadSrc = beadList;
      const all = [...leaves, ...young, ...heroLeaves.map(l => [l[0], l[1], l[2], l[3], 2, R()])];
      TREES = balls(E, all.length, false);
      all.forEach((b, i) => TREES.set(i, b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7]));
      TREES.upload();
      FRUIT = balls(E, fruit.length, false);
      fruit.forEach((b, i) => FRUIT.set(i, b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7]));
      FRUIT.upload();
      BEADS = balls(E, beadList.length, true);
      beadList.forEach((b, i) => { const c = beadPos(b); BEADS.set(i, c[0], c[1], c[2], b.br, 1, R(), 0, 0); });
      BEADS.upload();
      DOTS = K.sprites(E, dots.length);
      dots.forEach((d, i) => { DOTS.pos.set(d, i * 3); const k = .5 + R() * .5; DOTS.col.set([.34 * k, .03 * k, .03 * k], i * 3); DOTS.size[i] = .09; });
      DOTS.upload();

      /* ---- spray from the canopy tops along the pass ---- */
      spraySrc = [];
      for (let k = 0; k < (SMALL ? 900 : 1800); k++) {
        const j = R() < .5 ? 5 : 6, i = Math.floor(R() * ONX), x = OX0 + i * ODX, z = OZ0 + j * ODZ;
        const toward = Math.sign(LANE - z), a = (R() - .5) * 2.2, y = .3 + R() * .7, rr = Math.sqrt(1 - y * y);
        const s = [x + Math.sin(a) * rr * TREE_R * .95, TREE_Y + y * TREE_R * .95, z + toward * Math.abs(Math.cos(a)) * rr * TREE_R * .95];
        spraySrc.push({ s, pL: pAtX(s[0]) - .002 + R() * .006, life: .8 + R() * 1.1, tw: R() * 50,
          v: [(R() - .5) * 3, 1 + R() * 2.6, Math.sign(s[2] - LANE + 1e-3) * (3 + R() * 5)] });
      }
      SPRAY = streaks(E, spraySrc.length + beadList.length);
      WASH = streaks(E, SMALL ? 280 : 560);

      /* ---- seed rows: tassels on the male rows, pollen ---- */
      tassel = [];
      for (let k = 0; k < (CORN[3] - CORN[1]) / ROW; k++) {
        if (k % 5) continue;
        const z = CORN[1] + (k + .5) * ROW;
        if (Math.abs(z - LANE) > 16) continue;
        for (let x = CORN[0] + 1; x < CORN[2] - 1; x += SMALL ? 3.2 : 1.6) tassel.push([x + (R() - .5) * .5, CROP_H + .3 + R() * .2, z + (R() - .5) * .2, R()]);
      }
      TASSELS = K.sprites(E, tassel.length);
      tassel.forEach((q, i) => { TASSELS.pos.set([q[0], q[1], q[2]], i * 3); TASSELS.size[i] = .16; });
      pollenSrc = [];
      const males = [];
      for (let k = 0; k < (CORN[3] - CORN[1]) / ROW; k++) { if (k % 5) continue; const z = CORN[1] + (k + .5) * ROW; if (Math.abs(z - LANE) < 12) males.push(z); }
      for (let k = 0; k < (SMALL ? 1100 : 2200); k++) {
        const z = males[Math.floor(R() * males.length)], x = CORN[0] + 8 + R() * 300;
        const side = Math.sign(z - LANE + 1e-3) * (R() < .85 ? 1 : -1);
        pollenSrc.push({ s: [x, CROP_H + .35, z], pL: pAtX(x) + R() * .003, dur: 1.2 + R() * .9, side, up: 2 + R() * 3.2, land: 3 + R() * 11, along: (R() - .5) * 5, tw: R() * 40 });
      }
      POLLEN = streaks(E, pollenSrc.length);

      /* ---- frost night ---- */
      fires = [];
      [170, 232, 294, 356, 418, 462].forEach(x => { fires.push([x, -236]); fires.push([x - 16, -444]); });
      fires.push([214, -302], [336, -382], [404, -286], [262, -412]);
      FIRES = K.sprites(E, fires.length * 2);
      puffSrc = [];
      for (let k = 0; k < fires.length * (SMALL ? 8 : 13); k++) { const a = R() * TAU; puffSrc.push({ f: k % fires.length, h: R(), a, dx: Math.cos(a), dz: Math.sin(a), sp: .6 + R() * .8, ph: R() }); }
      PUFFS = K.sprites(E, puffSrc.length);
      frostSrc = [];
      for (let k = 0; k < (SMALL ? 1300 : 2600); k++) {
        const x = FROST[0] + R() * (FROST[2] - FROST[0]), z = FROST[1] + R() * (FROST[3] - FROST[1]);
        frostSrc.push([x, R() < .6 ? .9 + R() * 1.1 : .05, z, R()]);
      }
      FROSTS = K.sprites(E, frostSrc.length);
      frostSrc.forEach((q, i) => { FROSTS.pos.set([q[0], q[1], q[2]], i * 3); FROSTS.size[i] = .16; });
      EMBERS = streaks(E, fires.length * (SMALL ? 8 : 16));
      /* the steady line the helicopter holds over the block, with a tick every equal interval */
      const alt = [[[FX0 + 40, 15 + K.ROTOR_Y * .5, FZ], [FX1 - 40, 15 + K.ROTOR_Y * .5, FZ]]];
      for (let x = FX0; x >= FX1; x -= 20) alt.push([[x, 15 + K.ROTOR_Y * .5, FZ], [x, 15 + K.ROTOR_Y * .5 - 2.2, FZ]]);
      ALT = K.ribbons(E, alt);

      /* ---- livestock on the range ---- */
      groups = [{ c: [640, -1330], n: 38, r: 44 }, { c: [270, -1490], n: 26, r: 34 }, { c: [-120, -1410], n: 32, r: 40 }, { c: [-130, -1070], n: 20, r: 30 }, { c: [510, -900], n: 16, r: 26 }];
      groups.forEach(g => {
        g.found = .84;
        for (let i = 0; i <= 600; i++) { const p = .70 + .135 * i / 600, hp = posAt(sAt(p)); if (Math.hypot(hp[0] - g.c[0], hp[2] - g.c[1]) < 150 + g.r) { g.found = p; break; } }
      });
      herdSrc = [];
      let slot = 0;
      groups.forEach((g, gi) => {
        const mid = [(g.c[0] + CORRAL[0]) / 2, (g.c[1] + CORRAL[1]) / 2], dd = [CORRAL[0] - g.c[0], CORRAL[1] - g.c[1]], dl = Math.hypot(...dd);
        const ctrl = [mid[0] - dd[1] / dl * dl * .18, mid[1] + dd[0] / dl * dl * .18];
        g.ctrl = ctrl;
        for (let i = 0; i < g.n; i++) {
          const a = R() * TAU, rr = Math.sqrt(R()) * g.r;
          const sa = slot * 2.39996, sr = Math.sqrt(slot + .5) * 3.1; slot++;
          herdSrc.push({ g: gi, s: [g.c[0] + Math.cos(a) * rr, g.c[1] + Math.sin(a) * rr], e: [CORRAL[0] + Math.cos(sa) * sr, CORRAL[1] + Math.sin(sa) * sr], lag: R() * .018, w: (R() - .5) * 26, ph: R() * TAU });
        }
      });
      HERD = K.sprites(E, herdSrc.length);
      ROUTES = groups.map(g => { const pts = []; for (let i = 0; i <= 40; i++) { const u = i / 40, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u; pts.push([a * g.c[0] + b * g.ctrl[0] + c * CORRAL[0], 1.5, a * g.c[1] + b * g.ctrl[1] + c * CORRAL[1]]); } return K.ribbons(E, [pts]); });
      const cw = 30, chh = 22;
      CORRALR = K.ribbons(E, [[[CORRAL[0] - cw, .8, CORRAL[1] - chh], [CORRAL[0] + cw, .8, CORRAL[1] - chh], [CORRAL[0] + cw, .8, CORRAL[1] + chh], [CORRAL[0] - cw, .8, CORRAL[1] + chh], [CORRAL[0] - cw, .8, CORRAL[1] - chh]]]);

      /* ---- labels: the page's own words ---- */
      lab.tops = E.label("<span>Bowl-like tops</span>", "gold");
      lab.female = E.label("<span>To the female plants</span>", "gold");
      lab.fires = E.label("<span>Large fires</span>", "gold");
      lab.alt = E.label("<span>Controlled airspeed and altitude</span>");
      lab.surface = E.label("<span>Near the surface</span>", "gold");
      lab.find = E.label("<span>Locating livestock</span>", "gold");
      lab.heli = E.label("<span>R-22 or R-44</span>");

      NS.debug = { heliAt, posAt, sAt, pAtX, groups, beads: beadSrc, macro, camAt: p => camAt(E, p, heliAt(p)) };
    },

    frame(E, S) {
      const gl = E.gl, p = S.p, t = S.t, SMALL = E.SMALL;
      const OFF = (NS.debug && NS.debug.off) || {};
      const A = atmosAt(p);
      const hs = heliAt(p), hp = hs.pos;
      const cam = camAt(E, p, hs);
      let eye = cam.eye; const tgt = cam.tgt;
      /* a breath of handheld drift and pointer parallax, scaled to the shot */
      const span = Math.hypot(eye[0] - tgt[0], eye[1] - tgt[1], eye[2] - tgt[2]);
      const dr = Math.min(.03, span * .004) + (p > .3 ? span * .006 : 0);
      eye = [eye[0] + (Math.sin(t * .31) * .4 + S.px) * dr, eye[1] + (Math.sin(t * .23) * .3 - S.py * .5) * dr, eye[2] + Math.cos(t * .27) * .4 * dr];
      const FOV = E.aspect < 1 ? 1.2 : .9;
      const proj = E.M.persp(FOV, E.aspect, cam.near, 60000);
      if (SMALL) proj[9] = -.3; else proj[8] = -.24;
      const vp = E.M.mul(proj, E.M.look(eye, tgt, [0, 1, 0]));
      const pxs = K.pxScale(E, FOV);

      /* ---- the day: golden → night (frost) → first light (survey) ---- */
      const night = sm((p - .465) / .065) * (1 - sm((p - .85) / .12)), blueK = sm((p - .67) / .1);
      const fog = p < .3 ? mix(700, 1400, sm((p - .2) / .1)) : p < .6 ? mix(1400, 2600, sm((p - .4) / .15)) : mix(2600, 9000, sm((p - .66) / .2));
      const fireAmt = sm((p - .476) / .03) * (1 - sm((p - .7) / .06));
      const frost = sm((p - .5) / .04) * (1 - sm((p - .7) / .05));
      const pressed = sm((p - .556) / .015) * (1 - sm((p - .72) / .05));
      WARM = [FX0 + 60, clamp(hp[0], FX1, FX0), FZ, pressed];
      const FU = new Float32Array(64);
      fires.forEach((fi, i) => {
        const on = sm((p - .476 - i * .0018) / .02) * fireAmt;
        const fl = .78 + .14 * Math.sin(t * 13 + i * 1.7) * Math.sin(t * 7.3 + i * 2.1) + .08 * Math.sin(t * 23 + i);
        FU.set([fi[0], .4, fi[1], on * fl * 1.1], i * 4);
      });
      const setNight = P => P.v4("uFire", FU).f1("uFireAmt", fireAmt).v4("uWarm", WARM).f1("uFrost", frost);
      const wash = (p < .47 || (p > .55 && p < .66)) ? (1 - sm((hp[1] - surfY(hp[0], hp[2]) - 7) / 9)) : 0;
      const washAmt = wash * (p < .5 ? 1 : .6);

      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      if (!OFF.sky) SKY.draw(A, vp, eye, t, { stars: .08 + night * (.95 - .55 * blueK), cloud: .32 * (1 - night * .6) });

      /* ridges */
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
      RP.use().m4("uVP", vp).v3("uEye", eye); K.atmosUniforms(RP, A);
      if (!OFF.ridge) gl.bindVertexArray(RIDGE.vao), gl.drawElements(gl.TRIANGLES, RIDGE.count, gl.UNSIGNED_INT, 0); gl.bindVertexArray(null);

      /* ground */
      const ink = mix(.5, .8, sm((p - .66) / .1)) * (1 - .55 * night) * (1 - .6 * sm((p - .87) / .06));
      const scanOn = pulse(p, .7, .715, .81, .83);
      const surv = sm((p - .862) / .02), cream = sm((p - .955) / .04);
      const PG = new Float32Array(20);
      groups.forEach((g, i) => { const a = (p - g.found) * TS; PG.set([g.c[0], g.c[1], 12 + a * 55, a > 0 && a < 2.2 ? (1 - a / 2.2) * 1.2 * sm(a * 6) : 0], i * 4); });
      GP.use().m4("uVP", vp).v3("uEye", eye).f1("uT", t).f1("uFogD", fog).f1("uInk", ink)
        .v3("uIce", [.30, .58, 1.05]).v3("uGold", [.95, .6, .24]).v3("uCream", [1.3, 1.18, .95])
        .v4("uScan", [hp[0], hp[2], 130, scanOn * .9]).v4("uSurv", [hp[2], surv, cream, 0]).v4("uPing", PG);
      K.atmosUniforms(GP, A); setNight(GP);
      if (!OFF.ground) gl.bindVertexArray(GROUND), gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_INT, 0); gl.bindVertexArray(null);

      /* seed-row block */
      const polFront = p < .345 ? CORN[0] - 50 : pAtXinv(p) - 42;
      const dew = 1 - sm((p - .335) / .035);
      CP.use().m4("uVP", vp).v3("uEye", eye).f1("uT", t).f1("uFogD", fog).f1("uDew", dew * (1 - night))
        .v4("uPol", [polFront, sm((p - .35) / .02) * (1 - .55 * night), 0, 0]);
      K.atmosUniforms(CP, A);
      gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.frontFace(gl.CCW);
      if (!OFF.corn) CORNM.draw();
      gl.disable(gl.CULL_FACE);

      /* trees, fruit, beads (ray-traced spheres) */
      BP.use().m4("uVP", vp).v3("uEye", eye).f1("uT", t).f1("uFogD", fog).v4("uWash", [hp[0], 0, hp[2], washAmt]);
      K.atmosUniforms(BP, A); setNight(BP);
      gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.BLEND);
      if (!OFF.trees) TREES.draw();
      if (p < .5) {
        if (!OFF.fruit) FRUIT.draw();
        if (p < .3 && !OFF.stems) { SOLID.use().m4("uVP", vp).v3("uEye", eye).f1("uFogD", fog); K.atmosUniforms(SOLID, A); STEMS.draw(); BP.use(); }
        let nb = 0;
        beadSrc.forEach((b, i) => {
          const gone = p > b.pL;
          const c = beadPos(b);
          BEADS.C[i * 4] = c[0]; BEADS.C[i * 4 + 1] = c[1]; BEADS.C[i * 4 + 2] = c[2]; BEADS.C[i * 4 + 3] = gone ? 0 : b.br;
          nb++;
        });
        BEADS.upload(nb, true); if (!OFF.beads) BEADS.draw();
      }

      /* the helicopter */
      const d0 = Math.hypot(eye[0] - hp[0], eye[1] - hp[1], eye[2] - hp[2]);
      const scaleUp = clamp(d0 / 110, 1, 6);
      if (!OFF.heli) AC.draw(A, vp, eye, { M: E.M.trs(hp[0], hp[1], hp[2], hs.yaw, hs.pitch, hs.roll, scaleUp), kind: "heli", spin: t * 42 + p * 80, rate: 1, cabin: .9, t, fog: fog * 4, pxScale: pxs, lightSize: mix(.4, 1.1, sm(d0 / 45)) * Math.min(1.8, scaleUp) });

      /* ---------------- additive light ---------------- */
      const golden = 1 - night;
      if (p < .47 && !OFF.dots) { DOTS.draw(vp, pxs, { min: 1, max: 6, core: .6 }); }

      /* downwash: air pushed down through the rotor and out along the surface (ice-blue = air / aircraft) */
      WASH.begin();
      if (washAmt > .01) {
        /* each parcel of air: down through the disc (turning with the rotor), then out along the surface, curling up at the edge */
        const Rw = E.rng(77), top = hp[1] + K.ROTOR_Y * .9, nW = WASH.n, rate = .62;
        for (let i = 0; i < nW; i++) {
          const a0 = Rw() * TAU, r0 = .5 + Math.sqrt(Rw()) * 3.2, ph = fract(t * rate + Rw()), tw = Rw(), sw = .6 + Rw() * .8;
          const a = a0 + t * .15 + Math.min(ph, .36) * 1.6 * sw, ca = Math.cos(a), sa = Math.sin(a);
          const gy = surfY(hp[0] + ca * r0, hp[2] + sa * r0), fall = Math.max(1, top - gy);
          let r, y, vr, vy, vt;
          if (ph < .36) {
            const k = ph / .36; r = r0 * (1 + .12 * k); y = top - fall * Math.pow(k, 1.2) * .96;
            vr = r0 * .12 * rate / .36; vy = -fall * .96 * rate / .36 * 1.2 * Math.pow(Math.max(k, .05), .2); vt = r * 1.6 * sw * rate;
          } else {
            const k = (ph - .36) / .64; r = r0 * 1.12 + 2.5 + k * 16 * (1 - .4 * k); y = gy + .3 + k * k * k * 4;
            vr = 16 * (1 - .8 * k) * rate / .64; vy = 12 * k * k * rate / .64; vt = 0;
          }
          const x = hp[0] + ca * r, z = hp[2] + sa * r;
          const vx = ca * vr - sa * vt, vz = sa * vr + ca * vt;
          const fade = sm(ph / .1) * (1 - sm((ph - .66) / .34)) * washAmt;
          const I = .13 * fade * (.55 + .45 * tw);
          WASH.push(x, y, z, vx, vy, vz, .32 * I, .7 * I, 1.65 * I, .01, .035);
        }
      }
      if (!OFF.wash) WASH.draw(vp, pxs, 1, 3.5);

      /* spray: beads blown off the fruit, glittering */
      SPRAY.begin();
      if (p > .12 && p < .5) {
        const L = A.sunDir;
        spraySrc.forEach(q => {
          const a = (p - q.pL) * TS; if (a < 0 || a > q.life) return;
          const g = 3.9, x = q.s[0] + q.v[0] * a, y = q.s[1] + q.v[1] * a - g * a * a, z = q.s[2] + q.v[2] * a;
          const tw = .3 + .7 * Math.pow(.5 + .5 * Math.sin(t * 17 + q.tw + a * 9), 6);
          const I = Math.pow(1 - a / q.life, 1.4) * sm(a * 8) * tw * golden;
          SPRAY.push(x, y, z, q.v[0], q.v[1] - 2 * g * a, q.v[2], 2.2 * I, 2.0 * I, 1.7 * I, .02, .03);
        });
        beadSrc.forEach(b => {
          const a = (p - b.pL) * b.ts; if (a < 0 || a > 1.4) return;
          const c = beadPos(b), g = 4.9;
          const x = c[0] + b.v[0] * a, y = c[1] + b.v[1] * a - g * a * a, z = c[2] + b.v[2] * a;
          const I = (1 - a / 1.4) * sm(a * 20) * golden * (b.hero ? 1.6 : 1);
          SPRAY.push(x, y, z, b.v[0], b.v[1] - 2 * g * a, b.v[2], 1.6 * I, 1.45 * I, 1.25 * I, b.br * .9, b.hero ? .012 : .03);
        });
      }
      if (!OFF.spray) SPRAY.draw(vp, pxs, 1, 3.2);

      /* seed rows: tassels and pollen (gold = the grower's crop at work) */
      if (p > .3 && p < .56) {
        const hx = hp[0];
        tassel.forEach((q, i) => {
          const near = Math.exp(-Math.pow((q[0] - hx) / 16, 2)) * (Math.abs(q[2] - hp[2]) < 14 ? 1 : .3);
          const k = (.25 + 1.4 * near) * (1 - night) * (.8 + .2 * Math.sin(t * 3 + q[3] * 30));
          TASSELS.col.set([1.0 * k, .62 * k, .22 * k], i * 3);
        });
        TASSELS.upload();
        if (!OFF.tassels) TASSELS.draw(vp, pxs, { min: 1, max: 5, core: .8 });
        POLLEN.begin();
        pollenSrc.forEach(q => {
          const a = (p - q.pL) * TS; if (a < 0 || a > q.dur + .6) return;
          const u = Math.min(1, a / q.dur), u1 = 1 - u;
          const s = q.s, P1 = [s[0] + q.along * .5, s[1] + q.up, s[2] + q.side * q.land * .45], P2 = [s[0] + q.along, CROP_H + .08, s[2] + q.side * q.land];
          const x = u1 * u1 * s[0] + 2 * u * u1 * P1[0] + u * u * P2[0], y = u1 * u1 * s[1] + 2 * u * u1 * P1[1] + u * u * P2[1], z = u1 * u1 * s[2] + 2 * u * u1 * P1[2] + u * u * P2[2];
          const vx = (2 * u1 * (P1[0] - s[0]) + 2 * u * (P2[0] - P1[0])) / q.dur, vy = (2 * u1 * (P1[1] - s[1]) + 2 * u * (P2[1] - P1[1])) / q.dur, vz = (2 * u1 * (P1[2] - s[2]) + 2 * u * (P2[2] - P1[2])) / q.dur;
          const landed = sm((a - q.dur) / .15), I = sm(a * 5) * (1 - sm((a - q.dur) / .6)) * (1 - night) * (.7 + .3 * Math.sin(t * 9 + q.tw));
          const cr = mix(1.5, 1.6, landed), cg = mix(.95, 1.35, landed), cb = mix(.32, .9, landed);
          POLLEN.push(x, y, z, vx * (1 - landed), vy * (1 - landed), vz * (1 - landed), cr * I * 1.15, cg * I * 1.15, cb * I * 1.15, .035, .1);
        });
        if (!OFF.pollen) POLLEN.draw(vp, pxs, 1, 6);
      }

      /* frost night: fires, rising heat pressed down into a warm layer, frost crystals retreating */
      if (fireAmt > .01) {
        fires.forEach((fi, i) => {
          const I = FU[i * 4 + 3];
          FIRES.pos.set([fi[0], 1.1, fi[1]], i * 6); FIRES.col.set([3.2 * I, 1.3 * I, .32 * I], i * 6); FIRES.size[i * 2] = 2.2;
          FIRES.pos.set([fi[0], 2.0, fi[1]], i * 6 + 3); FIRES.col.set([.5 * I, .2 * I, .05 * I], i * 6 + 3); FIRES.size[i * 2 + 1] = 9;
        });
        FIRES.upload(); FIRES.draw(vp, pxs, { min: 2, max: 140, core: 1.4 });
        puffSrc.forEach((q, i) => {
          const fi = fires[q.f], on = FU[q.f * 4 + 3], ph = fract(t * .06 * q.sp + q.ph);
          const pr = warmBand(fi[0], fi[1]) * pressed;
          const ry = 1.5 + ph * 38, rx = fi[0] + q.dx * ph * 10 + ph * ph * 16, rz = fi[1] + q.dz * ph * 10;
          const ly = .9 + ph * 2.4 + .5 * Math.sin(ph * 5 + q.a), lr = 6 + ph * 52 * q.sp;
          const lx = fi[0] + q.dx * lr, lz = fi[1] + q.dz * lr;
          PUFFS.pos.set([mix(rx, lx, pr), mix(ry, ly, pr), mix(rz, lz, pr)], i * 3);
          const I = on * Math.sin(ph * PI) * mix(.055 * (1 - ph * .6), .085, pr);
          PUFFS.col.set([1.0 * I, .42 * I, .12 * I], i * 3);
          PUFFS.size[i] = mix(5 + ph * 16, 12 + ph * 18, pr);
        });
        PUFFS.upload(); PUFFS.draw(vp, pxs, { min: 2, max: 520, core: 0 });
        EMBERS.begin();
        const Re = E.rng(9);
        for (let k = 0; k < EMBERS.n; k++) {
          const f = k % fires.length, fi = fires[f], on = FU[f * 4 + 3], ph = fract(t * (.3 + Re() * .25) + Re()), dx = (Re() - .5) * 3, dz = (Re() - .5) * 3;
          const pr = warmBand(fi[0], fi[1]) * pressed, rise = 11 * (1 - pr * .8);
          const I = on * Math.pow(1 - ph, 2) * (.6 + .4 * Re());
          EMBERS.push(fi[0] + dx * ph * (1 + pr * 3), 1 + ph * rise, fi[1] + dz * ph * (1 + pr * 3), dx * (1 + pr * 3), rise, dz * (1 + pr * 3), 2.6 * I, .95 * I, .25 * I, .05, .08);
        }
        EMBERS.draw(vp, pxs, 1, 4);
      }
      if (frost > .01) {
        frostSrc.forEach((q, i) => {
          const k = frost * (1 - warmBand(q[0], q[2]) * pressed) * Math.pow(.5 + .5 * Math.sin(t * 2.2 + q[3] * 60), 3);
          FROSTS.col.set([.45 * k, .75 * k, 1.6 * k], i * 3);
        });
        FROSTS.upload(); FROSTS.draw(vp, pxs, { min: 1.2, max: 4, core: 1 });
      }
      const altK = pulse(p, .552, .565, .66, .69);
      if (altK > .01) ALT.draw(vp, { width: 2, color: [.35, .7, 1.6], intensity: altK * 1.2, reveal: clamp((FX0 + 40 - hp[0]) / (FX0 - FX1 + 80), 0, 1), t, pulse: .4, pulseLen: .04 });

      /* the range: livestock found from above and gathered */
      if (p > .66) {
        const liveK = sm((p - .675) / .03) * (1 - sm((p - .995) / .005) * 0);
        herdSrc.forEach((q, i) => {
          const g = groups[q.g], found = sm((p - g.found) / .006), gk = sm((p - g.found - .014 - q.lag) / .05);
          const u = gk, u1 = 1 - u;
          const cx = u1 * u1 * q.s[0] + 2 * u * u1 * (g.ctrl[0] + q.w) + u * u * q.e[0];
          const cz = u1 * u1 * q.s[1] + 2 * u * u1 * (g.ctrl[1] + q.w * .6) + u * u * q.e[1];
          const graze = (1 - u) * 1.2;
          HERD.pos.set([cx + Math.sin(t * .4 + q.ph) * graze, 1.2, cz + Math.cos(t * .33 + q.ph) * graze], i * 3);
          const home = sm((p - .88) / .08);
          const I = liveK * mix(.32, 1.05, found);
          HERD.col.set([mix(1.5, 1.45, home) * I, mix(.88, 1.3, home) * I, mix(.34, 1.0, home) * I], i * 3);
          HERD.size[i] = 6.5;
        });
        HERD.upload(); HERD.draw(vp, pxs, { min: 1.8, max: 10, core: 1 });
        groups.forEach((g, i) => {
          const gk = sm((p - g.found - .01) / .06);
          if (gk > .01) ROUTES[i].draw(vp, { width: 1.3, color: [1.3, .78, .3], intensity: .5 * (1 - sm((p - .845) / .05)), reveal: gk, t, pulse: .35, pulseLen: .08 });
        });
        const ck = sm((p - .75) / .03);
        if (ck > .01) CORRALR.draw(vp, { width: 1.4, color: [1.3, .9, .4], intensity: ck * mix(.5, .9, sm((p - .88) / .08)) });
      }
      if (surv > .001) {
        gl.enable(gl.DEPTH_TEST); gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
        SVP.use().m4("uVP", vp).v3("uEye", eye).f1("uFogD", fog).v3("uIce", [.30, .58, 1.05]).v3("uCream", [1.3, 1.18, .95]).v4("uSurv", [hp[2], surv, cream, 0]);
        gl.bindVertexArray(SURVQ); gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_INT, 0); gl.bindVertexArray(null);
        gl.depthMask(true); gl.disable(gl.BLEND);
      }

      /* ---------------- labels ---------------- */
      const hb = beadSrc[0], hc = beadPos(hb);
      E.place(lab.tops, vp, [hc[0], hc[1] + .008, hc[2]], pulse(p, .135, .15, .185, .197));
      const fx = Math.min(CORN[0] + 260, Math.max(CORN[0] + 20, polFront - 20));
      E.place(lab.female, vp, [fx, CROP_H + .2, LANE - 9], pulse(p, .395, .41, .455, .47) * (polFront > CORN[0] + 30 ? 1 : 0), { clamp: true });
      const fk = pulse(p, .515, .53, .555, .57);
      if (fk > .01) {
        let best = 4, bs = 1e9;
        fires.forEach((fi, i) => { const q = E.M.project(vp, fi[0], 4, fi[1]); if (q.w <= 0) return; const sc = Math.hypot(q.x / E.cssW - .7, q.y / E.cssH - .55); if (sc < bs) { bs = sc; best = i; } });
        E.place(lab.fires, vp, [fires[best][0], 4, fires[best][1]], fk);
      } else E.place(lab.fires, vp, [0, 0, 0], 0);
      E.place(lab.alt, vp, [hp[0], hp[1] + 6 * scaleUp, hp[2]], pulse(p, .57, .585, .615, .63), { clamp: true });
      E.place(lab.surface, vp, [clamp(hp[0] + 90, FX1, FX0), 3, FZ + 40], pulse(p, .625, .64, .665, .68), { clamp: true });
      const g0 = groups[0];
      E.place(lab.find, vp, [g0.c[0], 12, g0.c[1]], pulse(p, g0.found, g0.found + .012, g0.found + .045, g0.found + .058), { clamp: true });
      E.place(lab.heli, vp, [hp[0], hp[1] + 7 * scaleUp, hp[2]], pulse(p, .885, .9, .96, .975), { clamp: true });
    }
  };

  /* the pollinated front travels with the helicopter's x along the lane */
  function pAtXinv(p) { return posAt(sAt(p))[0]; }

  /* a bead sits in the bowl of its cherry until the wash takes it */
  function beadPos(b) {
    const tl = Math.hypot(...b.top), tp = [b.top[0] / tl, b.top[1] / tl, b.top[2] / tl];
    const k = b.r * .86;
    return [b.c[0] + tp[0] * k, b.c[1] + tp[1] * k, b.c[2] + tp[2] * k];
  }
})();
