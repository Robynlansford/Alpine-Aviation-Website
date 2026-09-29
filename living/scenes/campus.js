/* =====================================================================
   CAMPUS — student-housing.html (live hero, no pin)
   "Live where you train." Dusk on the airfield: a row of lodge-style
   homes with warm windows, a glowing footpath from their doorsteps to
   the flight line, a training helicopter idling on its pad in front of
   the hangar, runway edge lights reaching into the last light, the first
   stars. A light walks the path from the doors to the pad, over and over.

   Page words used in the scene: "On-field housing", "just steps",
   "flight instruction facilities".
   ILLUSTRATION: everything here (no photo of the real housing exists on
   the page); not a map of the real field.
   ===================================================================== */
(function () {
  "use strict";
  const NS = window.Living = window.Living || { scenes: {} };
  const K = window.LivingKit;
  const STILL_T = 9.5;

  let SKY, AC, A, GROUND, RIDGE, HOUSE, HANGAR, LIGHTS, STARS, starDir, groundVAO, ridgeVAO, ridgeCount;
  let tStart = null;
  const lab = {};

  /* ---- layout (metres; x east, z south; the camera looks north toward the flight line) ---- */
  const HOUSES = [0, 1, 2, 3].map(i => ({ x: 30, z: 14 - i * 13.5, s: [1, .94, 1.04, .97][i], seed: 3.7 + i * 11.3 }));
  const PAD = [8, -62], HANGAR_C = [4, -99], RWZ = -172;
  /* main path: from the first doorstep along the row, then curving out to the pad */
  const MAIN = [[20, 21], [20, 7], [20, -7], [20, -21], [19.4, -32], [17.4, -41], [14.2, -48], [10.8, -52.6]];
  const SPURS = HOUSES.map(h => [[h.x - 4.4 * h.s, h.z], [20, h.z - 1.5]]);

  function segs() {
    const out = []; let s = 0;
    for (let i = 0; i < MAIN.length - 1; i++) { const a = MAIN[i], b = MAIN[i + 1]; out.push({ a, b, s }); s += Math.hypot(b[0] - a[0], b[1] - a[1]); }
    SPURS.forEach(p => out.push({ a: p[0], b: p[1], s: -1 }));
    return { list: out, len: s };
  }
  const SEG = segs();

  /* lodge-style home, front (door) facing -z in model space: steep gable, loft window, chimney */
  function houseMesh() {
    const m = new K.Mesh();
    m.box([0, 1.6, 0], [4.5, 1.6, 4], 1);                             /* walls */
    /* roof: two planes, ridge along z, eaves overhang */
    const ry = 6.5, ey = 3.0, ex = 5.1, ez = 4.7;
    const roof = (sx) => {
      const nx = sx * (ry - ey), ny = ex, l = Math.hypot(nx, ny);
      const a = m.v(sx * ex, ey, -ez, nx / l, ny / l, 0, 2), b = m.v(0, ry, -ez, nx / l, ny / l, 0, 2), c = m.v(0, ry, ez, nx / l, ny / l, 0, 2), d = m.v(sx * ex, ey, ez, nx / l, ny / l, 0, 2);
      m.i.push(a, b, c, a, c, d);
    };
    roof(-1); roof(1);
    /* gable walls */
    [-1, 1].forEach(sz => { const a = m.v(-4.5, 3.2, sz * 4, 0, 0, sz, 1), b = m.v(4.5, 3.2, sz * 4, 0, 0, sz, 1), c = m.v(0, 6.3, sz * 4, 0, 0, sz, 1); m.i.push(a, b, c); });
    m.box([2.4, 6.2, 1.8], [.45, 1.1, .45], 2);                        /* chimney */
    m.box([0, .12, -4.9], [2.3, .12, .9], 1);                          /* porch deck */
    /* windows (k 3) and door (k 4), set just proud of the walls */
    let wi = 1;                                                         /* each window carries its own id in k (3.01, 3.02, ...) */
    [[-2.6, 1.75], [2.6, 1.75]].forEach(([x, y]) => m.box([x, y, -4.03], [.72, .58, .03], 3 + .01 * wi++));
    m.box([0, 4.35, -4.03], [.55, .5, .03], 3 + .01 * wi++);          /* loft window */
    [-1, 1].forEach(sx => [-1.9, 1.9].forEach(z => m.box([sx * 4.53, 1.75, z], [.03, .58, .72], 3 + .01 * wi++)));
    m.box([0, 1.05, -4.03], [.55, 1.05, .03], 4);
    return m.build(E0);
  }
  function hangarMesh() {
    const m = new K.Mesh();
    const w = 17, d = 12, h = 7.5;
    m.box([0, h / 2, 0], [w, h / 2, d], 1);
    /* shallow gable roof */
    [-1, 1].forEach(sx => { const nx = sx * 2.2, ny = w, l = Math.hypot(nx, ny);
      const a = m.v(sx * (w + .4), h, -d - .4, nx / l, ny / l, 0, 2), b = m.v(0, h + 2.2, -d - .4, nx / l, ny / l, 0, 2), c = m.v(0, h + 2.2, d + .4, nx / l, ny / l, 0, 2), e = m.v(sx * (w + .4), h, d + .4, nx / l, ny / l, 0, 2);
      m.i.push(a, b, c, a, c, e); });
    [-1, 1].forEach(sz => { const a = m.v(-w, h, sz * d, 0, 0, sz, 1), b = m.v(w, h, sz * d, 0, 0, sz, 1), c = m.v(0, h + 2.2, sz * d, 0, 0, sz, 1); m.i.push(a, b, c); });
    m.box([0, 3.1, d + .04], [10.5, 3.1, .04], 5);                    /* open door, lit inside (faces +z, toward the pad) */
    [-14, 14].forEach((x, i) => m.box([x, 3.6, d + .04], [1.2, .5, .03], 3.01 + .01 * i));
    return m.build(E0);
  }

  let E0;
  NS.scenes.campus = {
    still: .5,
    async init(E) {
      E0 = E;
      const gl = E.gl;
      SKY = K.sky(E);
      AC = K.aircraft(E);

      /* ---- ground: high-desert dusk, runway and taxiway, pad markings, the footpath and pools of light ---- */
      groundVAO = K.vao(E, [[new Float32Array([-14000, 0, -14000, 14000, 0, -14000, 14000, 0, 14000, -14000, 0, 14000]), 3]], new Uint32Array([0, 2, 1, 0, 3, 2]));
      GROUND = E.program(`#version 300 es
precision highp float; in vec3 aP; uniform mat4 uVP; out vec3 vW;
void main(){ vW = aP; gl_Position = uVP * vec4(aP, 1.); }`, `#version 300 es
precision highp float; in vec3 vW; out vec4 o;
uniform vec3 uEye; uniform float uT, uFogD, uWake, uRwz;
uniform vec4 uSeg[16]; uniform float uSegS[16]; uniform int uNSeg;
uniform float uPulse[3];
uniform vec4 uPL[20]; uniform vec3 uPC[20]; uniform int uNPL;
uniform vec2 uPad;
${K.GLSL.hash}
${K.GLSL.noise}
${K.GLSL.atmos}
float box2(vec2 p, vec2 c, vec2 h){ vec2 d = abs(p - c) - h; return max(d.x, d.y); }
void main(){
  vec2 p = vW.xz;
  float dist = length(uEye - vW);
  /* high-desert ground: dirt and sage, detail fades with distance */
  float n1 = fbm(p * .045);
  float near = 1. - smoothstep(20., 400., dist);
  float n2 = .5;
  vec3 alb = mix(vec3(.050, .044, .038), vec3(.036, .042, .034), smoothstep(.45, .7, n1));
  if (near > 0.) {
    n2 = fbm(p * .6);
    alb *= mix(1., .6 + .8 * n2, near);
    alb *= 1. - .45 * near * smoothstep(.62, .72, fbm(p * 1.7));   /* sage clumps: darker specks */
  }
  float paint = 0.;
  /* runway + taxiway: smoother, darker asphalt with edge and centre markings */
  float rw = box2(p, vec2(450., uRwz), vec2(1150., 12.));
  float tw = box2(p, vec2(uPad.x, (uPad.y + uRwz) * .5 - 4.), vec2(5., (uPad.y - uRwz) * .5 - 8.));
  float apron = box2(p, uPad + vec2(-3., -16.), vec2(24., 22.));
  float paved = min(min(rw, tw), apron);
  if (paved < 0.) {
    alb = vec3(.024, .025, .028) * (.85 + .3 * n2);
    if (rw < 0.) {
      float ez = abs(abs(p.y - uRwz) - 11.2);
      paint = max(paint, 1. - smoothstep(.25, .45, ez));
      paint = max(paint, (1. - smoothstep(.3, .5, abs(p.y - uRwz))) * step(.5, fract(p.x / 50.)));
    }
  }
  /* helipad: a ring and an H */
  vec2 q = p - uPad; float r = length(q);
  float pad = r < 8.6 ? 1. : 0.;
  if (pad > 0.) alb = vec3(.03, .031, .034);
  paint = max(paint, 1. - smoothstep(.2, .38, abs(r - 7.4)));
  float hb = min(max(abs(q.x) - 2.1, abs(q.y) - .32), min(max(abs(abs(q.x) - 1.8) - .32, abs(q.y) - 2.6), 9.));
  paint = max(paint, (1. - smoothstep(0., .08, hb)) * pad);
  paint *= 1. - smoothstep(120., 320., dist);
  alb = mix(alb, vec3(.55, .5, .42), paint * .8);

  /* sky light: dusk ambient from above, warm from the sunset side */
  vec3 c = alb * (uZenith * 7. + uHorizon * .3);
  /* the footpath: pale gravel that glows, and a light that walks it */
  float dp = 1e9, sa = -1.;
  for (int i = 0; i < 16; i++) {
    if (i >= uNSeg) break;
    vec2 a = uSeg[i].xy, b = uSeg[i].zw, pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.), d = length(pa - ba * h);
    if (d < dp) { dp = d; sa = uSegS[i] >= 0. ? uSegS[i] + h * length(ba) : -1.; }
  }
  float band = (1. - smoothstep(.55, .75, dp)) * (.55 + .45 * smoothstep(10., 45., dist));
  float halo = exp(-dp / 1.6);
  float walk = 0.;
  if (sa >= 0.) for (int k = 0; k < 3; k++) { float d = sa - uPulse[k]; walk += exp(-d * d / 7.) ; }
  walk *= .3 + .7 * smoothstep(12., 50., dist);
  vec3 warm = vec3(1.0, .6, .27);
  c += warm * (band * (.12 + .7 * walk) + halo * (.03 + .16 * walk)) * uWake;
  c += vec3(1.3, 1.1, .85) * band * walk * .6 * uWake;
  /* pools of light: windows, porch lights, bollards, the hangar door, pad and runway lights */
  vec3 pool = vec3(0.);
  for (int i = 0; i < 20; i++) {
    if (i >= uNPL) break;
    vec3 L = uPL[i].xyz - vW; float d2 = dot(L, L), rr = uPL[i].w * uPL[i].w;
    pool += uPC[i] * rr / (d2 + rr) * (1. - smoothstep(4., 9., sqrt(d2) / uPL[i].w));
  }
  c += (alb * 6. + .004) * pool * uWake;
  c += vec3(.5, .45, .35) * paint * .025;
  /* haze toward the horizon */
  vec3 rd = normalize(vW - uEye);
  c = mix(c, fogCol(rd) * .36, 1. - exp(-dist / uFogD));
  o = vec4(c, 1.);
}`, ["aP"]);

      /* ---- distant ridges: two rings of hills, illustrative ---- */
      {
        const pos = [], idx = []; let base = 0; const NR = 220;
        [[9000, 180, 420, 1.3], [16000, 380, 900, 4.1]].forEach(([R, h0, amp, ph]) => {
          for (let i = 0; i <= NR; i++) {
            const a = i / NR * Math.PI * 2;
            const h = h0 + amp * (.5 + .5 * Math.sin(a * 3 + ph)) * (.55 + .45 * Math.sin(a * 7.3 + ph * 2)) + amp * .25 * Math.sin(a * 17 + ph) + amp * .1 * Math.sin(a * 41);
            pos.push(Math.cos(a) * R, -60, Math.sin(a) * R, Math.cos(a) * R, h, Math.sin(a) * R);
            if (i < NR) { const q = base + i * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
          }
          base += (NR + 1) * 2;
        });
        ridgeVAO = K.vao(E, [[new Float32Array(pos), 3]], new Uint32Array(idx)); ridgeCount = idx.length;
        RIDGE = E.program(`#version 300 es
precision highp float; in vec3 aP; uniform mat4 uVP; uniform vec3 uEye; out vec3 vW;
void main(){ vW = aP + vec3(uEye.x, 0., uEye.z); gl_Position = uVP * vec4(vW, 1.); }`, `#version 300 es
precision highp float; in vec3 vW; out vec4 o; uniform vec3 uEye;
${K.GLSL.atmos}
void main(){
  vec3 rd = normalize(vW - uEye); float dist = length(vW - uEye);
  vec3 sil = vec3(.012, .014, .026) + uHorizon * .05;
  float haze = clamp(dist / 21000., 0., 1.) * .8;
  vec3 c = mix(sil, fogCol(rd) * .75, haze);
  c += uSunCol * .03 * smoothstep(0., 400., vW.y) * max(dot(normalize(vec3(rd.x, 0., rd.z)), normalize(vec3(uSunDir.x, 0., uSunDir.z))), 0.);
  o = vec4(c, 1.);
}`, ["aP"]);
      }

      /* ---- buildings ---- */
      const hm = houseMesh(), hg = hangarMesh();
      const BP = E.program(`#version 300 es
precision highp float; in vec3 aP, aN; in float aK; uniform mat4 uVP, uM; out vec3 vW, vN, vL; out float vK;
void main(){ vec4 w = uM * vec4(aP, 1.); vW = w.xyz; vN = normalize(mat3(uM) * aN); vL = aP; vK = aK; gl_Position = uVP * w; }`, `#version 300 es
precision highp float; in vec3 vW, vN, vL; in float vK; out vec4 o;
uniform vec3 uEye; uniform float uSeed, uT, uWake, uFogD, uDoor;
${K.GLSL.hash}
${K.GLSL.atmos}
void main(){
  vec3 n = normalize(vN), V = normalize(uEye - vW);
  float dist = length(uEye - vW);
  vec3 c;
  if (vK > 2.5) {
    /* windows and doors: warm, a few dark, each its own shade */
    float wid = floor(fract(vK) * 100. + .5);
    float id = hash12(vec2(wid, uSeed));
    float lit = vK > 4.5 ? 1. : vK > 3.5 ? .5 : (id > .2 ? .75 + .35 * hash12(vec2(uSeed, wid * 3.1)) : .06);
    vec3 warm = mix(vec3(1.9, .95, .38), vec3(2.0, 1.3, .6), hash12(vec2(wid * 1.7, uSeed * 1.3)));
    if (vK > 4.5 && uDoor > 0.) {
      /* the open hangar: a dark interior under three warm work lights, light pooling on the floor */
      float lamps = 0.;
      for (int j = -1; j <= 1; j++) { vec2 d = vec2(vL.x - float(j) * 6.5, vL.y - 5.7); lamps += exp(-d.x * d.x * 1.6 - d.y * d.y * 9.) * 2.2 + exp(-d.x * d.x * .08 - d.y * d.y * .2) * .12; }
      float floorGlow = (1. - smoothstep(0., 2.2, vL.y)) * (.5 + .5 * cos(vL.x * .48)) * .1;
      warm = vec3(.018, .016, .016) + vec3(1.3, 1.05, .72) * (lamps + floorGlow);
    }
    float flick = .95 + .05 * sin(uT * (1.3 + id * 2.) + id * 30.);
    c = warm * lit * flick * uWake;
    c = mix(c, vec3(.02), 1. - uWake);
  } else {
    vec3 alb = vK < 1.5 ? vec3(.055, .038, .026) : vec3(.026, .026, .03);           /* timber / roof and stone */
    float up = n.y * .5 + .5;
    c = alb * (uZenith * 9. * up + uHorizon * 1.1 * max(dot(n, normalize(vec3(uSunDir.x, .2, uSunDir.z))), 0.) + vec3(.01));
    float fr = pow(clamp(1. - dot(n, V), 0., 1.), 4.);
    c += fogCol(reflect(-V, n)) * fr * (vK < 1.5 ? .12 : .3);
    /* window light spilling on the wall around each window */
    c += vec3(.05, .025, .01) * uWake * (1. - smoothstep(0., 1.2, abs(vL.y - 1.75)));
  }
  c = mix(c, fogCol(-V), 1. - exp(-dist / uFogD));
  o = vec4(c, 1.);
}`, ["aP", "aN", "aK"]);
      HOUSE = { P: BP, mesh: hm }; HANGAR = { P: BP, mesh: hg };

      /* ---- point lights: porch lights, path bollards, pad lights, runway edges, taxiway ---- */
      const pts = [];
      HOUSES.forEach(h => pts.push({ p: [h.x - 4.55 * h.s, 2.45, h.z + 1.25], c: [1.9, 1.15, .5], s: .16, kind: "porch" }));
      /* bollards every ~7 m along the path, alternating sides */
      let acc = 0, side = 1;
      for (let i = 0; i < MAIN.length - 1; i++) {
        const a = MAIN[i], b = MAIN[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L;
        for (let s = (7 - acc % 7) % 7; s < L; s += 7) {
          side = -side;
          pts.push({ p: [a[0] + tx * s - tz * 1.25 * side, .55, a[1] + tz * s + tx * 1.25 * side], c: [1.5, .92, .42], s: .1, kind: "bollard", along: acc + s });
        }
        acc += L;
      }
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; pts.push({ p: [PAD[0] + Math.cos(a) * 9.4, .3, PAD[1] + Math.sin(a) * 9.4], c: i % 2 ? [1.7, 1.05, .38] : [.45, .8, 1.9], s: .16, kind: "pad" }); }
      for (let x = -700; x <= 1600; x += 60) [-1, 1].forEach(sd => pts.push({ p: [x, .5, RWZ + sd * 12.6], c: [1.9, 1.75, 1.45], s: .55, kind: "edge" }));
      for (let k = -5; k <= 5; k++) pts.push({ p: [-712, .5, RWZ + k * 2.2], c: [.3, 1.8, .5], s: .55, kind: "edge" });
      for (let k = -5; k <= 5; k++) pts.push({ p: [1612, .5, RWZ + k * 2.2], c: [1.9, .15, .1], s: .55, kind: "edge" });
      for (let z = PAD[1] - 12; z > RWZ + 14; z -= 16) [-1, 1].forEach(sd => pts.push({ p: [PAD[0] + sd * 6.2, .35, z], c: [.35, .6, 1.9], s: .28, kind: "taxi" }));
      LIGHTS = K.sprites(E, pts.length); LIGHTS.meta = pts;
      pts.forEach((q, i) => { LIGHTS.pos.set(q.p, i * 3); LIGHTS.col.set(q.c, i * 3); LIGHTS.size[i] = q.s; });
      LIGHTS.upload();

      /* the first stars: a few, high and away from the afterglow */
      const RS = E.rng(21), NST = E.SMALL ? 36 : 60; starDir = [];
      for (let i = 0; i < NST; i++) {
        const az = .85 + Math.pow(RS(), 1.3) * 1.3, el = .04 + Math.pow(RS(), 1.4) * .3;
        starDir.push([Math.cos(az) * Math.cos(el), Math.sin(el), -Math.sin(az) * Math.cos(el), .35 + Math.pow(RS(), 3) * 1.6, RS() * 6.3]);
      }
      STARS = K.sprites(E, NST);
      A = K.atmos({ sunAz: Math.PI * .8, sunEl: -.07, sun: [.9, .4, .16], zenith: [.006, .011, .034], horizon: [.30, .14, .07] });

      lab.home = E.label("<span>On-field housing</span>", "gold");
      lab.steps = E.label("<span>Just steps</span>", "gold");
      lab.fac = E.label("<span>Flight instruction facilities</span>");

      E.post.threshold = .9; E.post.knee = .55; E.post.bloom = 1.0; E.post.exposure = 1.05;
      E.post.vignette = .55; E.post.saturation = 1.08; E.post.ca = .004; E.post.warm = .1;
      NS.debug = { camera: t => camera(E, t, 0, 0) };
    },

    frame(E, S) {
      const gl = E.gl, e = E.ease;
      const t = E.REDUCED ? STILL_T : S.t;
      if (tStart == null) tStart = E.REDUCED ? -100 : t;
      const on = E.REDUCED ? 100 : t - tStart;
      const wake = E.REDUCED ? 1 : .35 + .65 * e.smooth((on - .3) / 2.2);

      const { eye, vp, FOV } = camera(E, t, S.px, S.py);
      const pxs = K.pxScale(E, FOV);
      const FOG = 2600;

      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      SKY.draw(A, vp, eye, t, { stars: .75, cloud: .28 });
      starDir.forEach((d, i) => {
        STARS.pos.set([eye[0] + d[0] * 30000, eye[1] + d[1] * 30000, eye[2] + d[2] * 30000], i * 3);
        const k = d[3] * (.8 + .2 * Math.sin(t * 1.7 + d[4] * 5)) * e.smooth((d[1] - .03) / .1) * (1 - .7 * e.smooth((d[2] > 0 ? 0 : Math.atan2(-d[2], d[0]) - 1.6) / .6)) * wake;
        STARS.col.set([k * .9, k * .95, k * 1.1], i * 3); STARS.size[i] = 2.4 * 30000 / pxs;
      });
      STARS.upload();
      gl.disable(gl.DEPTH_TEST);
      STARS.draw(vp, pxs, { min: 1.3 * E.scale, max: 5 * E.scale, core: 1.2 });

      /* ridges */
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.disable(gl.BLEND);
      RIDGE.use().m4("uVP", vp).v3("uEye", eye); K.atmosUniforms(RIDGE, A);
      gl.bindVertexArray(ridgeVAO); gl.drawElements(gl.TRIANGLES, ridgeCount, gl.UNSIGNED_INT, 0); gl.bindVertexArray(null);
      gl.clear(gl.DEPTH_BUFFER_BIT);

      /* the walk: a light leaves the first doorstep every 4.2 s and reaches the pad */
      const LEN = SEG.len, speed = 9, gap = 5;
      const pulses = [0, 1, 2].map(k => { const ph = (t - k * gap) % (gap * 3); return ph < 0 ? -99 : ph * speed - 4; });

      /* pools of light on the ground */
      const PL = [], PC = [];
      HOUSES.forEach(h => { PL.push(h.x - 5.2, 1.4, h.z - 2.4, 3.2, h.x - 5.2, 1.4, h.z + 2.4, 3.2); PC.push(.32, .17, .06, .32, .17, .06); });
      HOUSES.forEach(h => { PL.push(h.x - 5.6, 2.2, h.z + 1.25, 2.4); PC.push(.5, .3, .12); });
      PL.push(HANGAR_C[0], 2.5, HANGAR_C[1] + 16, 8); PC.push(.12, .1, .08);
      PL.push(PAD[0], .8, PAD[1], 6); PC.push(.12, .1, .09);
      [-1, 1].forEach(sd => { PL.push(PAD[0] + sd * 6.2, .4, PAD[1] - 30, 3); PC.push(.05, .09, .3); });
      const nPL = PL.length / 4;

      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.disable(gl.BLEND);
      const G = GROUND.use().m4("uVP", vp).v3("uEye", eye).f1("uT", t).f1("uFogD", FOG).f1("uWake", wake).f1("uRwz", RWZ).f2("uPad", PAD[0], PAD[1]);
      K.atmosUniforms(G, A);
      const sv = new Float32Array(64), ss = new Float32Array(16);
      SEG.list.forEach((s, i) => { sv.set([s.a[0], s.a[1], s.b[0], s.b[1]], i * 4); ss[i] = s.s; });
      G.v4("uSeg", sv).v1("uSegS", ss).i1("uNSeg", SEG.list.length).v1("uPulse", pulses)
        .v4("uPL", new Float32Array(PL.concat(new Array(80 - PL.length).fill(0)))).v3("uPC", new Float32Array(PC.concat(new Array(60 - PC.length).fill(0)))).i1("uNPL", nPL);
      gl.bindVertexArray(groundVAO); gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_INT, 0); gl.bindVertexArray(null);

      /* homes and hangar */
      const B = HOUSE.P.use().m4("uVP", vp).v3("uEye", eye).f1("uT", t).f1("uWake", wake).f1("uFogD", FOG);
      K.atmosUniforms(B, A);
      HOUSES.forEach(h => { B.m4("uM", E.M.trs(h.x, 0, h.z, Math.PI / 2, 0, 0, h.s)).f1("uSeed", h.seed).f1("uDoor", 0); HOUSE.mesh.draw(); });
      B.m4("uM", E.M.trs(HANGAR_C[0], 0, HANGAR_C[1], 0, 0, 0, 1)).f1("uSeed", 1.1).f1("uDoor", 1); HANGAR.mesh.draw();

      /* point lights: bollards brighten as the walking light passes */
      const M = LIGHTS.meta;
      for (let i = 0; i < M.length; i++) {
        const q = M[i]; let k = 1;
        if (q.kind === "bollard") { let w = 0; pulses.forEach(pp => { const d = q.along - pp; w += Math.exp(-d * d / 9); }); const dc = Math.hypot(q.p[0] - eye[0], q.p[2] - eye[2]); k = (.7 + 1.5 * w) * Math.min(1, .35 + dc / 60); }
        else if (q.kind === "pad") k = .8 + .2 * Math.sin(t * 2 + i);
        LIGHTS.col.set([q.c[0] * k * wake, q.c[1] * k * wake, q.c[2] * k * wake], i * 3);
      }
      LIGHTS.upload();
      LIGHTS.draw(vp, pxs, { min: 1.6 * E.scale, max: 26 * E.scale, core: 1.1 });

      /* the training helicopter, idling on its pad */
      const HM = E.M.trs(PAD[0], .02, PAD[1], 2.35, 0, 0, 1);
      AC.draw(A, vp, eye, { M: HM, kind: "heli", spin: t * 2.1, rate: .16, cabin: .4, t, fog: 6000, pxScale: pxs, lightSize: .9, rotorI: .9 });

      /* labels: the page's own words */
      const h1 = HOUSES[1];
      E.place(lab.home, vp, [h1.x, 8.6, h1.z], e.smooth((on - .4) / .9), { clamp: true });
      const mid = MAIN[4];
      E.place(lab.steps, vp, [mid[0] - 1.5, 1.6, mid[1]], e.smooth((on - 1.) / .9), { clamp: true });
      E.place(lab.fac, vp, [HANGAR_C[0], 10.2, HANGAR_C[1]], e.smooth((on - 1.6) / .9), { clamp: true });
    }
  };

  function camera(E, t, px, py) {
    const small = E.aspect < 1;
    const drift = Math.sin(t * .09) * 3.5;
    let eye = small ? [9 + drift * .6, 15, 46] : [1 + drift, 12.5, 32];
    eye = [eye[0] + px * 2.2, eye[1] - py * .8 + Math.sin(t * .23) * .12, eye[2]];
    const tgt = small ? [15, 0, -30] : [16, 0, -36];
    const FOV = small ? 1.0 : .72;
    const proj = E.M.persp(FOV, E.aspect, .5, 40000);
    if (E.SMALL) proj[9] = -.3; else proj[8] = -.22;
    const view = E.M.look(eye, tgt, [0, 1, 0]);
    return { eye, vp: E.M.mul(proj, view), FOV };
  }
})();
