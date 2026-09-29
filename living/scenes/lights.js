/* =====================================================================
   LIGHTS — christmas-lights-tours.html (live hero, no pin)
   "Boise's holiday lights, from above." Downtown Boise at night, seen
   from a helicopter on a slow orbit:
     - the real downtown street grid (OpenStreetMap) as warm glowing lines,
       the rest of the valley's major roads fading into the haze
     - strings of holiday lights (red / green / gold / cream) along the
       downtown streets, switching on from the centre outward, twinkling
     - the Boise River as a dark ribbon catching the city's reflections
     - the foothills behind, snow-dusted, faint contour lines
     - a low cloud deck lit by the city, gentle snowfall
     - another helicopter's navigation lights crossing the view

   REAL: street grid, river, major roads = OSM (living/data/downtown.json,
   boise_lines.json); terrain = USGS 3DEP (living/data/boise.*), heights x1.
   ILLUSTRATIVE: the holiday lights, the snow, the helicopter.
   ===================================================================== */
(function () {
  "use strict";
  const NS = window.Living = window.Living || { scenes: {} };
  const K = window.LivingKit;
  const EXAG = 1.0;
  const STILL_T = 13;          /* reduced motion: one frame at this clock time */
  const TAU = Math.PI * 2;

  let H, D, B, N, vh, GRID, TER, SKYP, RIV, STREETS, FAR, BULBS, SNOW, AC, glowTex, C, A;
  let tStart = null, nBulbs = 0, snowSeed, SMALLV = false;
  const lab = {};

  /* ---- night sky shared by sky, terrain haze and river reflections ---- */
  const NIGHT = `
uniform vec2 uCity;
vec3 nightSky(vec3 rd){
  float h = rd.y;
  vec2 hd = normalize(rd.xz + 1e-5);
  float toward = dot(hd, uCity) * .5 + .5;
  vec3 zen = vec3(.004, .0065, .017);
  vec3 hor = mix(vec3(.022, .026, .044), vec3(.075, .042, .03), toward * toward);   /* sodium dome over the city */
  float hh = clamp(h, 0., 1.);
  vec3 c = mix(hor, zen, smoothstep(0., .42, hh));
  c = mix(c, hor * .75, 1. - smoothstep(-.1, 0., h));
  return c;
}
vec3 fogNight(vec3 rd){ return nightSky(normalize(vec3(rd.x, max(rd.y, .012), rd.z))); }`;

  function hMesh(x, z) {
    const u = Math.min(.99999, Math.max(0, x / H.sizeX + .5)) * (N - 1), v = Math.min(.99999, Math.max(0, z / H.sizeZ + .5)) * (N - 1);
    const i = u | 0, j = v | 0, fx = u - i, fz = v - j;
    const a = vh[j * N + i], b = vh[j * N + i + 1], c = vh[(j + 1) * N + i], d = vh[(j + 1) * N + i + 1];
    const h = fx + fz <= 1 ? a + (b - a) * fx + (c - a) * fz : d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
    return h * H.range * H.exag;
  }

  NS.scenes.lights = {
    still: .5,
    async init(E) {
      const gl = E.gl;
      [H, D, B] = await Promise.all([
        K.heightfield(E, "living/data/boise.png", "living/data/boise.json", EXAG),
        E.loadJSON("living/data/downtown.json"),
        E.loadJSON("living/data/boise_lines.json")
      ]);
      const bb = H.meta.bounds, db = D.bbox;
      /* downtown uv -> terrain uv -> world */
      const toU = du => (db.west + du * (db.east - db.west) - bb.west) / (bb.east - bb.west);
      const toV = dv => (bb.north - (db.north - dv * (db.north - db.south))) / (bb.north - bb.south);
      const W = (u, v) => [(u - .5) * H.sizeX, (v - .5) * H.sizeZ];

      /* ---- terrain mesh ---- */
      N = E.SMALL ? 300 : 440;
      vh = new Float32Array(N * N);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) vh[j * N + i] = H.n(i / (N - 1), j / (N - 1));
      GRID = K.grid(E, N);

      /* centre of the orbit: the heart of the downtown grid */
      const cu = toU(.47), cv = toV(.45), cw = W(cu, cv);
      C = [cw[0], hMesh(cw[0], cw[1]), cw[1]];

      /* ---- city glow map: every road and street, blurred (lights the ground and the river) ---- */
      const GS = 1024, cv1 = document.createElement("canvas"); cv1.width = cv1.height = GS;
      const g1 = cv1.getContext("2d");
      g1.fillStyle = "#000"; g1.fillRect(0, 0, GS, GS); g1.globalCompositeOperation = "lighter"; g1.lineCap = "round";
      const stroke = (pts, style, w) => { g1.strokeStyle = style; g1.lineWidth = w; g1.beginPath(); pts.forEach((q, i) => i ? g1.lineTo(q[0] * GS, q[1] * GS) : g1.moveTo(q[0] * GS, q[1] * GS)); g1.stroke(); };
      const inDown = (u, v) => u > toU(0) && u < toU(1) && v > toV(0) && v < toV(1);
      const farLines = [];
      B.layers.roads.forEach(L => {
        const pts = []; for (let i = 0; i < L.length; i += 2) pts.push([L[i], L[i + 1]]);
        stroke(pts, "rgba(255,255,255,.34)", 1.3);
        const m = pts[pts.length >> 1];
        if (!inDown(m[0], m[1])) farLines.push(pts);
      });
      const streetLines = [];
      D.layers.streets.forEach((L, k) => {
        const pts = []; for (let i = 0; i < L.length; i += 2) pts.push([toU(L[i]), toV(L[i + 1])]);
        stroke(pts, "rgba(255,255,255,.28)", 1);
        streetLines.push(pts);
      });
      const cv2 = document.createElement("canvas"); cv2.width = cv2.height = GS;
      const g2 = cv2.getContext("2d"); g2.filter = "blur(3px)"; g2.drawImage(cv1, 0, 0); g2.filter = "none";
      g2.globalAlpha = .5; g2.drawImage(cv1, 0, 0);
      glowTex = E.texture(cv2);

      /* ---- terrain program (night: moonlit snow on the foothills, the city lighting the ground) ---- */
      TER = E.program(`#version 300 es
precision highp float;
in vec2 aUv; uniform mat4 uVP; uniform sampler2D uH; uniform vec2 uSize; uniform float uRange, uEx;
out vec2 vUv; out vec3 vW;
void main(){ vUv = aUv; float h = texture(uH, aUv).r * uRange * uEx;
  vec3 p = vec3((aUv.x-.5)*uSize.x, h, (aUv.y-.5)*uSize.y); vW = p; gl_Position = uVP * vec4(p, 1.); }`, `#version 300 es
precision highp float;
in vec2 vUv; in vec3 vW; out vec4 o;
uniform sampler2D uH, uGlow; uniform vec2 uSize, uTx; uniform float uRange, uEx, uHmin, uFogD;
uniform vec3 uEye, uMoon;
${K.GLSL.hash}
${K.GLSL.noise}
${NIGHT}
float Hw(vec2 uv){ return texture(uH, uv).r * uRange * uEx; }
void main(){
  float hc = Hw(vUv);
  float hx = Hw(vUv + vec2(uTx.x, 0.)) - Hw(vUv - vec2(uTx.x, 0.));
  float hz = Hw(vUv + vec2(0., uTx.y)) - Hw(vUv - vec2(0., uTx.y));
  vec3 n = normalize(vec3(-hx / (2.*uTx.x*uSize.x), 1., -hz / (2.*uTx.y*uSize.y)));
  float elev = uHmin + hc / uEx;
  float slope = 1. - n.y;
  float nz = fbm(vUv * 460.);
  float snow = smoothstep(850., 960., elev + (nz - .5) * 110.) * (1. - smoothstep(.22, .55, slope));
  vec3 alb = mix(vec3(.016, .018, .024) * (.7 + .6*nz), vec3(.30, .33, .40) * (.72 + .4*nz), snow);
  float dif = max(dot(n, uMoon), 0.);
  vec3 c = alb * (vec3(.13, .16, .24) * dif + vec3(.018, .022, .036));
  float g = texture(uGlow, vUv).r;
  c += alb * vec3(1., .55, .25) * g * 1.6;                  /* ground lit by the streets */
  c += vec3(.30, .14, .05) * g * g * .022;                  /* warm pool of light over the city */
  /* faint ice contour lines, only on the foothills */
  float lv = elev / 50., fw = max(fwidth(lv), 1e-4);
  float line = (1. - smoothstep(0., 1.3*fw, abs(fract(lv - .5) - .5))) * (1. - smoothstep(.1, .35, fw));
  float dist = length(uEye - vW);
  c += vec3(.22, .42, .9) * line * smoothstep(880., 990., elev) * .1 * exp(-dist / 11000.);
  vec3 rd = normalize(vW - uEye);
  c = mix(c, fogNight(rd), 1. - exp(-dist / uFogD));
  o = vec4(c, 1.);
}`, ["aUv"]);

      /* ---- sky: low cloud deck lit from below by the city ---- */
      SKYP = E.program(E.QV, `#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform mat4 uInvVP; uniform vec3 uEye; uniform float uT;
${K.GLSL.hash}
${K.GLSL.noise}
${NIGHT}
void main(){
  vec4 a = uInvVP * vec4(vUv*2.-1., 1., 1.); vec3 rd = normalize(a.xyz/a.w - uEye);
  vec3 c = nightSky(rd);
  if (rd.y > 0.) {
    vec2 cp = rd.xz / (rd.y + .05) * 1.2 + vec2(uT * .004, uT * .0015);
    float cl = fbm(cp * vec2(1., 1.5));
    float cov = smoothstep(.34, .78, cl) * smoothstep(0., .06, rd.y);
    float toward = dot(normalize(rd.xz + 1e-5), uCity) * .5 + .5;
    vec3 lit = mix(vec3(.022, .022, .036), vec3(.085, .045, .032), toward * (1. - smoothstep(.05, .5, rd.y)));
    c = mix(c, lit * (.55 + .7*cl), cov * .85);
    /* a few stars in the gaps */
    vec2 sp = rd.xz / (rd.y + .3) * 240.; vec2 cell = floor(sp); float r = hash12(cell);
    vec2 f = fract(sp) - .5 - (hash22(cell) - .5) * .6;
    c += vec3(.8, .85, 1.) * step(.9975, r) * (1. - cov) * smoothstep(.2, .6, rd.y) * (1. - smoothstep(0., .1, length(f))) * (1. + .5*sin(uT*2. + r*70.));
  }
  o = vec4(c, 1.);
}`);

      /* ---- the river: a dark ribbon that catches the reflections ---- */
      {
        const pos = [], acr = [], alo = [], idx = []; let base = 0;
        const RW = 21;                                    /* half width, m */
        D.layers.river.forEach(L => {
          const P = []; for (let i = 0; i < L.length; i += 2) P.push(W(toU(L[i]), toV(L[i + 1])));
          if (P.length < 2) return;
          let s = 0;
          for (let i = 0; i < P.length; i++) {
            const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
            let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
            if (i) s += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
            const nx = -tz, nz = tx;
            const w = L.length / 2 < 8 ? RW * .55 : RW;
            const y = Math.max(hMesh(P[i][0], P[i][1]), hMesh(P[i][0] + nx * w, P[i][1] + nz * w), hMesh(P[i][0] - nx * w, P[i][1] - nz * w)) + 1.2;
            for (const sd of [-1, 1]) { pos.push(P[i][0] + nx * w * sd, y, P[i][1] + nz * w * sd); acr.push(sd); alo.push(s); }
            if (i < P.length - 1) { const q = base + i * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
          }
          base += P.length * 2;
        });
        const vao = K.vao(E, [[new Float32Array(pos), 3], [new Float32Array(acr), 1], [new Float32Array(alo), 1]], new Uint32Array(idx));
        const P = E.program(`#version 300 es
precision highp float; in vec3 aP; in float aA, aL; uniform mat4 uVP; out vec3 vW; out float vA, vL;
void main(){ vW = aP; vA = aA; vL = aL; gl_Position = uVP * vec4(aP, 1.); }`, `#version 300 es
precision highp float; in vec3 vW; in float vA, vL; out vec4 o;
uniform sampler2D uGlow; uniform vec2 uSize; uniform vec3 uEye; uniform float uT, uFogD;
${K.GLSL.hash}
${K.GLSL.noise}
${NIGHT}
void main(){
  float edge = 1. - smoothstep(.55, 1., abs(vA));
  vec2 guv = vec2(vW.x / uSize.x + .5, vW.z / uSize.y + .5);
  float g = texture(uGlow, guv).r;
  vec3 c = vec3(.0015, .003, .008);
  vec3 V = normalize(uEye - vW);
  float fr = pow(clamp(1. - V.y, 0., 1.), 4.);
  c += nightSky(reflect(-V, vec3(0., 1., 0.))) * (.05 + .3 * fr);
  /* small glints drifting downstream where the city's light falls on the water */
  vec2 q = vec2(vL / 4.5 - uT * .45, (vA * .5 + .5) * 6.);
  vec2 cell = floor(q), f = fract(q) - .5 - (hash22(cell) - .5) * .5;
  float r = hash12(cell);
  float sp = step(.6, r) * (1. - smoothstep(0., .42, length(f * vec2(1., 2.8)))) * (.45 + .55 * sin(uT * 2.6 + r * 40.));
  c += vec3(1.2, .68, .3) * (g + .15) * sp * 2.4 * edge;
  c += vec3(.9, .5, .22) * g * .025 * edge;
  c *= mix(.4, 1., edge);
  float dist = length(uEye - vW);
  c = mix(c, fogNight(-V), 1. - exp(-dist / uFogD));
  o = vec4(c, 1.);
}`, ["aP", "aA", "aL"]);
        RIV = { P, vao, count: idx.length };
      }

      /* ---- streets: downtown in three rings (brighter at the heart), far roads dim ---- */
      const dC = pts => { const m = pts[pts.length >> 1]; const w = W(m[0], m[1]); return Math.hypot(w[0] - C[0], w[1] - C[2]); };
      const ring = [[], [], []];
      streetLines.forEach((pts, k) => { const d = dC(pts); ring[d < 750 ? 0 : d < 1500 ? 1 : 2].push({ pts, id: k }); });
      STREETS = ring.map(r => K.ribbons(E, r, { draped: H, lift: 6 }));
      FAR = K.ribbons(E, farLines.map((pts, k) => ({ pts, id: k })), { draped: H, lift: 8 });

      /* ---- holiday lights: strings along the downtown streets (illustrative) ---- */
      const MAX = E.SMALL ? 5200 : 10000;
      const bp = new Float32Array(MAX * 3), bc = new Float32Array(MAX * 3), bk = new Float32Array(MAX * 3);
      const R = E.rng(12);
      const PAL = { r: [2.6, .12, .08], g: [.14, 1.9, .42], au: [2.4, 1.4, .42], cr: [2.1, 1.9, 1.55] };
      const SCHEMES = [["r", "g", "au", "cr"], ["cr"], ["au"], ["r", "g"], ["au", "cr"], ["r", "cr"]];
      const order = streetLines.map((pts, k) => ({ pts, k, d: dC(pts) })).sort((a, b) => a.d - b.d);
      let n = 0;
      for (const L of order) {
        if (n >= MAX) break;
        const pr = L.d < 650 ? .86 : L.d < 1300 ? .55 : L.d < 2200 ? .26 : 0;
        if (R() > pr) continue;
        const r0 = R(), sch = SCHEMES[r0 < .44 ? 0 : r0 < .6 ? 1 : r0 < .7 ? 2 : r0 < .88 ? 3 : r0 < .94 ? 4 : 5];
        const chase = R() < (L.d < 800 ? .3 : .08) ? 1 : 0;
        const ph0 = R() * 100;
        const P = L.pts.map(q => W(q[0], q[1]));
        let carry = R() * 9, step = 8.5 + R() * 3, ci = 0;
        for (let i = 1; i < P.length && n < MAX; i++) {
          const ax = P[i - 1][0], az = P[i - 1][1], bx = P[i][0], bz = P[i][1];
          const seg = Math.hypot(bx - ax, bz - az);
          for (let s = carry; s < seg && n < MAX; s += step) {
            const f = s / seg, x = ax + (bx - ax) * f, z = az + (bz - az) * f;
            bp.set([x, hMesh(x, z) + 5 + R() * 1.5, z], n * 3);
            const col = PAL[sch[ci++ % sch.length]];
            const jit = .8 + R() * .4;
            bc.set([col[0] * jit, col[1] * jit, col[2] * jit], n * 3);
            const dd = Math.hypot(x - C[0], z - C[2]);
            bk.set([chase ? ph0 + ci * .9 : R() * 100, chase, dd / 1000 * 1.5 + R() * .25], n * 3);
            n++;
          }
          carry = Math.max(0, (carry + Math.ceil((seg - carry) / step) * step) - seg);
        }
      }
      nBulbs = n;
      {
        const vao = K.vao(E, [[bp.subarray(0, n * 3), 3], [bc.subarray(0, n * 3), 3], [bk.subarray(0, n * 3), 3]]);
        const P = E.program(`#version 300 es
precision highp float; in vec3 aP, aC, aK; uniform mat4 uVP; uniform float uScale, uMin, uMax, uT, uOn, uSize; out vec3 vC;
float h1(float n){ return fract(sin(n * 91.345) * 43758.5453); }
void main(){
  vec4 c = uVP * vec4(aP, 1.); gl_Position = c;
  float s = uSize * uScale / max(c.w, 1e-3);
  gl_PointSize = clamp(s, uMin, uMax);
  float tw = .62 + .38 * sin(uT * (1.1 + h1(aK.x) * 2.3) + aK.x * 6.2831);
  float ch = .22 + .95 * pow(.5 + .5 * sin(aK.x - uT * 3.2), 5.);
  float k = mix(tw, ch, aK.y);
  float sp = step(.992, h1(floor(uT * 5.) + aK.x * 13.1)) * 1.4;         /* the odd sparkle */
  float on = smoothstep(aK.z, aK.z + .45, uOn);                         /* switch on, centre first */
  float flash = exp(-(((uOn - aK.z - .3) * 4.)*((uOn - aK.z - .3) * 4.))) * 1.6;              /* each bulb flares as it comes on */
  vC = aC * (k + sp + flash) * on * min(1., s / max(uMin, 1e-3));
}`, `#version 300 es
precision highp float; in vec3 vC; out vec4 o;
void main(){ vec2 d = gl_PointCoord - .5; float r = length(d) * 2.; if (r > 1.) discard;
  float g = exp(-r*r*4.5) + .9 * exp(-r*r*38.); o = vec4(vC * g, 1.); }`, ["aP", "aC", "aK"]);
        BULBS = { P, vao };
      }

      /* ---- snow around the camera ---- */
      const NSN = E.SMALL ? 260 : 560;
      SNOW = K.sprites(E, NSN);
      const RS = E.rng(5);
      snowSeed = [];
      for (let i = 0; i < NSN; i++) snowSeed.push([RS(), RS(), RS(), RS(), RS()]);

      AC = K.aircraft(E);
      A = K.atmos({ sunAz: 2.3, sunEl: .7, sun: [.09, .10, .15], zenith: [.003, .005, .012], horizon: [.07, .045, .035] });

      lab.city = E.label("<span>Downtown Boise</span>", "gold");

      E.post.threshold = 1.0; E.post.knee = .5; E.post.bloom = .95; E.post.exposure = 1.0;
      E.post.vignette = .55; E.post.saturation = 1.12; E.post.ca = .003; E.post.warm = .06;
      NS.debug = { H, C, get bulbs() { return nBulbs; }, hMesh,
        heliAt: t => { const c = camera(E, t, 0, 0), p = heliPos(t), q = E.M.project(c.vp, p[0], p[1], p[2]); return [Math.round(q.x), Math.round(q.y), Math.round(q.w)]; } };
    },

    frame(E, S) {
      const gl = E.gl, e = E.ease;
      const t = E.REDUCED ? STILL_T : S.t;
      if (tStart == null) tStart = E.REDUCED ? -100 : t;
      const on = E.REDUCED ? 100 : t - tStart;

      /* ---- camera: a slow orbit over the downtown grid ---- */
      SMALLV = E.aspect < 1;
      const { eye, vp, FOV } = camera(E, t, S.px, S.py);
      const pxs = K.pxScale(E, FOV);
      const cd = [C[0] - eye[0], C[2] - eye[2]], cl = Math.hypot(cd[0], cd[1]);
      const city = [cd[0] / cl, cd[1] / cl];
      const FOG = 16000;

      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      /* sky */
      gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
      SKYP.use().m4("uInvVP", E.M.inv(vp)).v3("uEye", eye).f1("uT", t).f2("uCity", city[0], city[1]);
      E.tri();
      gl.depthMask(true);

      /* terrain */
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.BLEND);
      gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.frontFace(gl.CCW);
      E.bindTex(0, H.tex); E.bindTex(1, glowTex);
      TER.use().m4("uVP", vp).i1("uH", 0).i1("uGlow", 1).f2("uSize", H.sizeX, H.sizeZ).f2("uTx", 1 / H.w, 1 / H.h)
        .f1("uRange", H.range).f1("uEx", H.exag).f1("uHmin", H.meta.hmin).f1("uFogD", FOG).v3("uEye", eye)
        .v3("uMoon", [-.45, .62, -.64]).f2("uCity", city[0], city[1]);
      GRID.draw();
      gl.disable(gl.CULL_FACE);

      /* river */
      gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-2, -4);
      E.bindTex(0, glowTex);
      RIV.P.use().m4("uVP", vp).i1("uGlow", 0).f2("uSize", H.sizeX, H.sizeZ).v3("uEye", eye).f1("uT", t).f1("uFogD", FOG).f2("uCity", city[0], city[1]);
      gl.bindVertexArray(RIV.vao); gl.drawElements(gl.TRIANGLES, RIV.count, gl.UNSIGNED_INT, 0); gl.bindVertexArray(null);
      gl.disable(gl.POLYGON_OFFSET_FILL);

      /* the valley's roads, then downtown */
      const wake = e.smooth(on / 1.6);
      FAR.draw(vp, { width: 1.0, color: [.75, .38, .14], color2: [.8, .62, .4], idMix: .5, intensity: .26 * wake, fadeD: 9000 });
      const RI = [.38, .25, .17];
      STREETS.forEach((S2, i) => S2.draw(vp, { width: i ? 1.0 : 1.15, color: [.9, .46, .15], color2: [1.0, .74, .46], idMix: .55, intensity: RI[i] * wake, fadeD: 14000 }));

      /* holiday lights */
      gl.enable(gl.DEPTH_TEST); gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      BULBS.P.use().m4("uVP", vp).f1("uScale", pxs).f1("uMin", 2.1 * E.scale).f1("uMax", 22 * E.scale).f1("uT", t).f1("uOn", on - .6).f1("uSize", 4.6);
      gl.bindVertexArray(BULBS.vao); gl.drawArrays(gl.POINTS, 0, nBulbs); gl.bindVertexArray(null);
      gl.depthMask(true); gl.disable(gl.BLEND);

      /* another helicopter on its own tour, crossing the view */
      const hp = heliPos(t), hn = heliPos(t + .25);
      const dir = [hn[0] - hp[0], hn[2] - hp[2]], dl = Math.hypot(dir[0], dir[1]) || 1;
      const hd = Math.hypot(eye[0] - hp[0], eye[1] - hp[1], eye[2] - hp[2]);
      const sc = Math.min(2.6, Math.max(1, hd / 220));
      if (NS.debug) NS.debug.heli = E.M.project(vp, hp[0], hp[1], hp[2]);
      AC.draw(A, vp, eye, { M: E.M.trs(hp[0], hp[1], hp[2], Math.atan2(-dir[0] / dl, -dir[1] / dl), -.08, -.1, sc), kind: "heli", spin: t * 40, rate: 1, cabin: 1, rotorI: .3,
        cabinCol: [1.7, 1.05, .45], rim: [.6, .92, 1.7], t, fog: 50000, pxScale: pxs, lightSize: 1.7 * sc, scan: .4 });

      /* snow */
      const NSN = SNOW.n, BX = 96, BY = 70, BZ = 96;
      for (let i = 0; i < NSN; i++) {
        const q = snowSeed[i];
        const fall = .9 + q[3] * .8;
        let x = q[0] * BX + t * 1.4 + Math.sin(t * .4 + q[4] * 9) * 2.5 - eye[0];
        let y = q[1] * BY - t * fall - eye[1];
        let z = q[2] * BZ + t * .6 + Math.cos(t * .33 + q[4] * 7) * 2.5 - eye[2];
        x = ((x % BX) + BX) % BX - BX / 2; y = ((y % BY) + BY) % BY - BY / 2; z = ((z % BZ) + BZ) % BZ - BZ / 2;
        SNOW.pos.set([eye[0] + x, eye[1] + y, eye[2] + z], i * 3);
        const px = (.11 + q[3] * .1) * pxs / Math.max(1, Math.hypot(x, y, z));
        const b = (.62 + q[4] * .4) * Math.min(1, 4.5 / px);          /* big near flakes: soft, not bright */
        SNOW.col.set([b * 1.02, b * .96, b * .9], i * 3);
        SNOW.size[i] = .11 + q[3] * .1;
      }
      SNOW.upload();
      SNOW.draw(vp, pxs, { min: 1.2 * E.scale, max: 13 * E.scale, core: .25 });

      E.place(lab.city, vp, [C[0], C[1] + 300, C[2]], .95 * e.smooth((on - 1.1) / 1.));
    }
  };

  function camera(E, t, px, py) {
    const R = E.SMALL ? 1600 : 1600, HT = E.SMALL ? 600 : 580;
    const ang = 2.25 + t * (TAU / 340);
    let eye = [C[0] + Math.cos(ang) * R, C[1] + HT + Math.sin(t * .21) * 5, C[2] + Math.sin(ang) * R];
    eye = [eye[0] + px * 40 * Math.sin(ang), eye[1] - py * 25, eye[2] - px * 40 * Math.cos(ang)];
    const tgt = [C[0], C[1] + 30, C[2]];
    const FOV = E.aspect < 1 ? 1.12 : .78;
    const proj = E.M.persp(FOV, E.aspect, 20, 60000);
    if (E.SMALL) proj[9] = -.3; else proj[8] = -.22;
    const view = E.M.look(eye, tgt, [0, 1, 0]);
    return { eye, vp: E.M.mul(proj, view), FOV };
  }
  /* the other helicopter keeps pace on an inner orbit and drifts slowly back and forth across the view */
  function heliPos(t) {
    const a = 2.25 + t * (TAU / 340) - (SMALLV ? .02 + .05 * Math.sin(t * TAU / 64 - .6) : .085 + .1 * Math.sin(t * TAU / 64 - .6));
    const r = 1080 + 60 * Math.sin(t * TAU / 47);
    return [C[0] + Math.cos(a) * r, C[1] + 400 + 12 * Math.sin(t * TAU / 38), C[2] + Math.sin(a) * r];
  }
})();
