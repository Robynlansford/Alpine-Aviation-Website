/* =====================================================================
   RANGE — livestock-pest-control.html (live hero, no pin)
   "Cover more ground, spend less doing it." Open range at last light,
   seen from high above. A helicopter flies an expanding-square search;
   a soft scan cone hangs under it, and every metre it has looked at
   stays faintly lit, so the covered ground grows into a map while you
   watch ("cover a large area in a very short time"). A herd drifts
   below as a flowing flock of warm points (boids); strays brighten
   when the scan finds them. No predators, no harm, nothing violent.

   REAL: terrain = USGS 3DEP (living/data/mhome.*), rolling range at the
   foot of the mountain front east of Oasis, Idaho; heights x1.6.
   ILLUSTRATIVE: the helicopter (stylized, not a specific airframe), the
   search pattern, the scan, the herd, and the time (compressed).
   ===================================================================== */
(function () {
  "use strict";
  const NS = window.Living = window.Living || { scenes: {} };
  const K = window.LivingKit;
  const PI = Math.PI, TAU = PI * 2;
  const EXAG = 1.6;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const sm = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const mix = (a, b, t) => a + (b - a) * t;

  /* search pattern: expanding square, legs 1,1,2,2,3,3,4,4 lanes; lane = footprint width */
  const R = 120, LANEW = 2 * R, CYCLE = 34, T_LEGS = 26, AGL = 150, HALF = 720;
  let H, T, SKY, AC, C0, COV, STAMP, OVER, OVGRID, CONE, CP, HERD, herd, legsCache = {};
  const lab = {};

  function legs(k) {
    if (legsCache[k]) return legsCache[k];
    const rot = (k % 4) * PI / 2, cr = Math.cos(rot), sr = Math.sin(rot);
    const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    const pts = [[0, 0]];
    for (let i = 0; i < 8; i++) { const d = dirs[i % 4], L = (Math.floor(i / 2) + 1) * LANEW, q = pts[pts.length - 1]; pts.push([q[0] + d[0] * L, q[1] + d[1] * L]); }
    const w = pts.map(q => [C0[0] + q[0] * cr - q[1] * sr, C0[2] + q[0] * sr + q[1] * cr]);
    const cum = [0]; for (let i = 1; i < w.length; i++) cum.push(cum[i - 1] + Math.hypot(w[i][0] - w[i - 1][0], w[i][1] - w[i - 1][1]));
    const keys = Object.keys(legsCache); if (keys.length > 3) delete legsCache[keys[0]];
    legsCache[k] = { w, cum, len: cum[cum.length - 1] };
    return legsCache[k];
  }
  /* point along the legs at distance s, corners rounded with radius rc */
  function along(L, s) {
    s = clamp(s, 0, L.len);
    let i = 0; while (i < L.cum.length - 2 && s > L.cum[i + 1]) i++;
    const a = L.w[i], b = L.w[i + 1], seg = L.cum[i + 1] - L.cum[i], u = (s - L.cum[i]) / seg;
    let x = a[0] + (b[0] - a[0]) * u, z = a[1] + (b[1] - a[1]) * u;
    /* round the corner: blend toward the next leg within rc of the corner */
    const rc = 55;
    if (i < L.cum.length - 2 && L.cum[i + 1] - s < rc) {
      const c = L.w[i + 2], k = 1 - (L.cum[i + 1] - s) / rc, n2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
      const e = [b[0] + (c[0] - b[0]) / n2 * rc, b[1] + (c[1] - b[1]) / n2 * rc], st = [b[0] - (b[0] - a[0]) / seg * rc, b[1] - (b[1] - a[1]) / seg * rc];
      const kk = k * .5, u1 = 1 - kk;
      x = u1 * u1 * st[0] + 2 * kk * u1 * b[0] + kk * kk * e[0]; z = u1 * u1 * st[1] + 2 * kk * u1 * b[1] + kk * kk * e[1];
    } else if (i > 0 && s - L.cum[i] < rc) {
      const o = L.w[i - 1], segp = L.cum[i] - L.cum[i - 1], k = (s - L.cum[i]) / rc;
      const st = [a[0] - (a[0] - o[0]) / segp * rc, a[1] - (a[1] - o[1]) / segp * rc], e = [a[0] + (b[0] - a[0]) / seg * rc, a[1] + (b[1] - a[1]) / seg * rc];
      const kk = .5 + k * .5, u1 = 1 - kk;
      x = u1 * u1 * st[0] + 2 * kk * u1 * a[0] + kk * kk * e[0]; z = u1 * u1 * st[1] + 2 * kk * u1 * a[1] + kk * kk * e[1];
    }
    return [x, z];
  }
  /* the helicopter at time t: flying the legs, then easing back to the middle for the next square */
  function heliAt(t) {
    const k = Math.floor(t / CYCLE), tc = t - k * CYCLE, L = legs(k);
    let xz, scanning;
    if (tc < T_LEGS) { xz = along(L, L.len * tc / T_LEGS); scanning = 1; }
    else {
      /* ease back to the middle along a curve that leaves in the direction of the last leg */
      const u = sm((tc - T_LEGS) / (CYCLE - T_LEGS)), last = L.w[L.w.length - 1], prev = L.w[L.w.length - 2];
      const dl = Math.hypot(last[0] - prev[0], last[1] - prev[1]), ctrl = [last[0] + (last[0] - prev[0]) / dl * 260, last[1] + (last[1] - prev[1]) / dl * 260];
      const nx = legs(k + 1).w[0];
      const u1 = 1 - u; xz = [u1 * u1 * last[0] + 2 * u * u1 * ctrl[0] + u * u * nx[0], u1 * u1 * last[1] + 2 * u * u1 * ctrl[1] + u * u * nx[1]];
      scanning = 1 - sm((tc - T_LEGS) / 2.5);
    }
    return { x: xz[0], z: xz[1], y: T.hMesh(xz[0], xz[1]) + AGL, k, tc, scanning };
  }

  NS.scenes.range = {
    still: 0,
    async init(E) {
      const gl = E.gl, SMALL = E.SMALL;
      H = await K.heightfield(E, "living/data/mhome.png", "living/data/mhome.json", EXAG);
      T = K.terrain(E, H, { contour: 50, major: 250 }); SKY = K.sky(E); AC = K.aircraft(E);
      C0 = H.world(.45, .35);
      C0[1] = T.hMesh(C0[0], C0[2]);

      /* coverage: the swath flown so far this cycle, stamped into a small texture every frame (deterministic) */
      const CW = SMALL ? 256 : 512;
      const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, CW, CW, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const NST = 420, inst = new Float32Array(NST * 3);
      const svao = gl.createVertexArray(); gl.bindVertexArray(svao);
      const qb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, qb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      const ib = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, ib); gl.bufferData(gl.ARRAY_BUFFER, inst.byteLength, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(1, 1);
      gl.bindVertexArray(null);
      const SPG = E.program(`#version 300 es
precision highp float;
in vec2 aQ; in vec3 aI; uniform vec3 uC; uniform float uHalf, uR; out vec2 vQ; out float vF;
void main(){ vQ = aQ; vF = aI.z; vec2 w = aI.xy + aQ * uR * 1.04; gl_Position = vec4((w - uC.xz) / uHalf, 0., 1.); }`, `#version 300 es
precision highp float;
in vec2 vQ; in float vF; out vec4 o;
void main(){ float d = length(vQ); if (d > 1.04) discard; float c = 1. - smoothstep(.9, 1.02, d); o = vec4(c, c * vF, 0., 1.); }`, ["aQ", "aI"]);
      COV = { tex, fb, CW, inst, n: NST };
      STAMP = (k) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.viewport(0, 0, CW, CW);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        if (k > 0) {
          gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendEquation(gl.MAX); gl.blendFunc(gl.ONE, gl.ONE);
          gl.bindBuffer(gl.ARRAY_BUFFER, ib); gl.bufferSubData(gl.ARRAY_BUFFER, 0, inst.subarray(0, k * 3));
          SPG.use().v3("uC", C0).f1("uHalf", HALF).f1("uR", R);
          gl.bindVertexArray(svao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, k); gl.bindVertexArray(null);
          gl.blendEquation(gl.FUNC_ADD); gl.disable(gl.BLEND);
        }
        const tg = E.target(); gl.bindFramebuffer(gl.FRAMEBUFFER, tg.fb); gl.viewport(0, 0, tg.w, tg.h);
      };
      /* the covered ground, draped over the real terrain as light */
      OVGRID = K.grid(E, SMALL ? 72 : 120);
      OVER = E.program(`#version 300 es
precision highp float;
in vec2 aUv; uniform mat4 uVP; uniform sampler2D uH; uniform vec2 uSize; uniform float uRange, uEx, uHalf; uniform vec3 uC;
out vec3 vW; out vec2 vT;
void main(){
  vec2 w = uC.xz + (aUv * 2. - 1.) * uHalf;
  vec2 uv = w / uSize + .5;
  float h = texture(uH, uv).r * uRange * uEx + 6.;
  vW = vec3(w.x, h, w.y); vT = aUv;
  gl_Position = uVP * vec4(vW, 1.);
}`, `#version 300 es
precision highp float;
in vec3 vW; in vec2 vT; out vec4 o;
uniform sampler2D uCov; uniform vec3 uIce, uGold, uEye; uniform vec4 uHeli; uniform float uFade, uT, uR;
void main(){
  vec4 cv = texture(uCov, vT);
  float cov = cv.r, fresh = cv.g;
  float edge = smoothstep(.22, .5, cov) * (1. - smoothstep(.5, .78, cov));
  float border = 1. - smoothstep(.0, .06, min(min(vT.x, vT.y), min(1. - vT.x, 1. - vT.y)));
  vec3 c = uIce * (cov * .05 + edge * .7 + pow(clamp(fresh, 0., 1.), 5.) * .14) * uFade * (1. - border);
  /* the footprint under the helicopter */
  float d = length(vW.xz - uHeli.xy);
  float fw = max(fwidth(d), 1e-3);
  c += uIce * ((1. - smoothstep(uR * .985, uR * .985 + fw * 1.5, d)) * smoothstep(uR * .985 - fw * 2.5, uR * .985, d) * 1.4 + (1. - smoothstep(0., uR, d)) * .06) * uHeli.w;
  o = vec4(c, 1.);
}`, ["aUv"]);

      /* the scan cone: a soft funnel of light from the helicopter to its footprint */
      {
        const n = 56, pos = [0, 0, 0], nr = [0, 1, 0], vv = [0], idx = [];
        for (let i = 0; i <= n; i++) { const a = i / n * TAU; pos.push(Math.cos(a), -1, Math.sin(a)); nr.push(Math.cos(a), .4, Math.sin(a)); vv.push(1); }
        for (let i = 1; i <= n; i++) idx.push(0, i, i + 1);
        CONE = { vao: K.vao(E, [[new Float32Array(pos), 3], [new Float32Array(nr), 3], [new Float32Array(vv), 1]], new Uint32Array(idx)), count: idx.length };
        CP = E.program(`#version 300 es
precision highp float;
in vec3 aP, aN; in float aV; uniform mat4 uVP, uM; out vec3 vW, vN; out float vV;
void main(){ vec4 w = uM * vec4(aP, 1.); vW = w.xyz; vN = normalize(mat3(uM) * aN); vV = aV; gl_Position = uVP * w; }`, `#version 300 es
precision highp float;
in vec3 vW, vN; in float vV; out vec4 o; uniform vec3 uEye, uCol; uniform float uI;
void main(){
  vec3 V = normalize(uEye - vW);
  float rim = clamp(1. - abs(dot(normalize(vN), V)), 0., 1.);
  o = vec4(uCol * uI * (.18 + .82 * pow(rim, 3.)) * smoothstep(.0, 1., vV) * (1. - smoothstep(.97, 1., vV) * .6), 1.);
}`, ["aP", "aN", "aV"]);
      }

      /* the herd: a main flock and a few strays */
      const Rr = E.rng(31), N = SMALL ? 110 : 170;
      herd = [];
      const hc = [C0[0] + 260, C0[2] - 180];
      for (let i = 0; i < N; i++) {
        const stray = i > N - 12;
        const a = Rr() * TAU, r = stray ? 380 + Rr() * 280 : Math.sqrt(Rr()) * 110;
        const x = (stray ? C0[0] : hc[0]) + Math.cos(a) * r, z = (stray ? C0[2] : hc[1]) + Math.sin(a) * r;
        herd.push({ x, z, vx: (Rr() - .5) * 4, vz: (Rr() - .5) * 4, stray, seen: -99, ph: Rr() * TAU, sz: 9 + Rr() * 3 });
      }
      HERD = K.sprites(E, N);
      NS.debug = { heliAt, C0: () => C0, herd, legs };
      lab.area = E.label("<span>Cover a large area</span>");
      lab.terrain = E.label("<span>Real terrain · Mountain Home, ID</span>");
    },

    frame(E, S) {
      const gl = E.gl, SMALL = E.SMALL;
      const t = S.t + (E.REDUCED ? 21 : 0) + 3;
      const A = K.atmos({ sunAz: PI * 1.1, sunEl: .03 + .006 * Math.sin(t * .02), sun: [2.4, 1.05, .42], zenith: [.009, .016, .045], horizon: [.4, .21, .11] });
      const hs = heliAt(t);
      /* camera: high to the south-west, looking up the range toward the mountain front, drifting slowly */
      const orb = Math.sin(t * .045) * .08 + S.px * .05, dist = SMALL ? 2650 : 2050;
      const base = PI * .75 + orb;
      /* aim a little north-west of the search so it sits to the right of the words (desktop), centred above them (phone) */
      const tgt = SMALL ? [C0[0] + 100, C0[1] + 40, C0[2] + 90] : [C0[0] - 230, C0[1] + 40, C0[2] - 250];
      const eye = [tgt[0] + Math.cos(base) * dist, tgt[1] + (SMALL ? 1000 : 720) - S.py * 50, tgt[2] + Math.sin(base) * dist];
      const FOV = E.aspect < 1 ? 1.18 : .9;
      const proj = E.M.persp(FOV, E.aspect, 20, 90000);
      if (SMALL) proj[9] = -.3; else proj[8] = -.24;
      const vp = E.M.mul(proj, E.M.look(eye, tgt, [0, 1, 0])), pxs = K.pxScale(E, FOV);

      /* stamp the swath flown so far this cycle */
      const L = legs(hs.k), sNow = hs.tc < T_LEGS ? L.len * hs.tc / T_LEGS : L.len;
      const fade = 1 - sm((hs.tc - (CYCLE - 5)) / 4.5);
      let kk = 0;
      const step = Math.max(12, L.len / (COV.n - 2));
      for (let s = 0; s <= sNow && kk < COV.n; s += step) { const q = along(L, s); COV.inst.set([q[0], q[1], Math.max(0, 1 - (sNow - s) / 900)], kk * 3); kk++; }
      STAMP(kk);

      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      SKY.draw(A, vp, eye, t, { stars: .55, cloud: .28 });
      T.draw(A, vp, eye, t, { fog: 38000, glow: .8, shadows: true });

      /* covered ground */
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      E.bindTex(0, H.tex); E.bindTex(1, COV.tex);
      OVER.use().m4("uVP", vp).i1("uH", 0).i1("uCov", 1).f2("uSize", H.sizeX, H.sizeZ).f1("uRange", H.range).f1("uEx", H.exag).f1("uHalf", HALF).v3("uC", C0)
        .v3("uIce", [.32, .62, 1.25]).v3("uGold", [1.4, .85, .32]).v3("uEye", eye).v4("uHeli", [hs.x, hs.z, 0, hs.scanning * .9]).f1("uFade", fade).f1("uT", t).f1("uR", R);
      OVGRID.draw();
      gl.depthMask(true); gl.disable(gl.BLEND);
      gl.activeTexture(gl.TEXTURE0);

      /* the herd: boids on the ground, warm points; strays brighten when the scan finds them */
      const dt = E.REDUCED ? 0 : Math.min(.05, S.dt) * 2.2;
      const hx = hs.x, hz = hs.z;
      if (dt > 0) {
        const n = herd.length;
        for (let i = 0; i < n; i++) {
          const a = herd[i]; let sx = 0, sz = 0, ax = 0, az = 0, cx = 0, cz = 0, cnt = 0;
          for (let j = 0; j < n; j++) {
            if (i === j) continue; const b = herd[j], dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz;
            if (d2 < 60 * 60) { cnt++; cx += b.x; cz += b.z; ax += b.vx; az += b.vz; if (d2 < 17 * 17) { const d = Math.sqrt(d2) + .01; sx -= dx / d * (17 - d); sz -= dz / d * (17 - d); } }
          }
          let fx = 0, fz = 0;
          if (cnt) { fx += (cx / cnt - a.x) * .012 + (ax / cnt - a.vx) * .03; fz += (cz / cnt - a.z) * .012 + (az / cnt - a.vz) * .03; }
          /* the herd grazes toward a slowly wandering spot */
          if (!a.stray) { const gx = C0[0] + 220 * Math.cos(t * .021) - 60, gz = C0[2] - 150 + 160 * Math.sin(t * .017); fx += (gx - a.x) * .004; fz += (gz - a.z) * .004; }
          fx += sx * .12; fz += sz * .12;
          /* a slow wander, and a soft fence around the range */
          const w = Math.sin(t * .23 + a.ph) * .6, wz = Math.cos(t * .19 + a.ph * 1.3) * .6;
          fx += w; fz += wz;
          const ox = a.x - C0[0], oz = a.z - C0[2], od = Math.hypot(ox, oz), lim = a.stray ? 720 : 560;
          if (od > lim) { fx -= ox / od * (od - lim) * .02; fz -= oz / od * (od - lim) * .02; }
          a.vx += fx * dt; a.vz += fz * dt;
          const sp = Math.hypot(a.vx, a.vz), mx = a.stray ? 5 : 9;
          if (sp > mx) { a.vx *= mx / sp; a.vz *= mx / sp; }
        }
        for (const a of herd) { a.x += a.vx * dt; a.z += a.vz * dt; }
      }
      herd.forEach((a, i) => {
        if (hs.scanning > .5 && (a.x - hx) * (a.x - hx) + (a.z - hz) * (a.z - hz) < R * R) a.seen = t;
        const since = t - a.seen, lit = since >= 0 && since < 30 ? Math.exp(-since / 14) : 0, ping = since >= 0 && since < .8 ? 1 - since / .8 : 0;
        HERD.pos.set([a.x, T.hMesh(a.x, a.z) + 3, a.z], i * 3);
        const k = .55 + .9 * lit + 1.2 * ping;
        HERD.col.set([1.45 * k, mix(.82, 1.2, lit) * k, mix(.3, .8, lit) * k], i * 3);
        HERD.size[i] = a.sz * (1 + .6 * ping);
      });
      HERD.upload(); HERD.draw(vp, pxs, { min: 1.6, max: 14, core: 1 });

      /* the helicopter, scan cone and footprint */
      const hp = [hs.x, hs.y, hs.z];
      const nx = heliAt(t + .25), dx = nx.x - hs.x, dz = nx.z - hs.z, dl = Math.hypot(dx, dz) || 1;
      const pv = heliAt(t - .25), turn = Math.atan2((hs.x - pv.x) * dz - (hs.z - pv.z) * dx, (hs.x - pv.x) * dx + (hs.z - pv.z) * dz);
      const d0 = Math.hypot(eye[0] - hp[0], eye[1] - hp[1], eye[2] - hp[2]), sc = clamp(d0 / 200, 1, 11);
      AC.draw(A, vp, eye, { M: E.M.trs(hp[0], hp[1], hp[2], Math.atan2(-dx / dl, -dz / dl), -.12, clamp(-turn * 2.5, -.5, .5), sc), kind: "heli", spin: t * 42, rate: 1, cabin: .9, t, fog: 90000, pxScale: pxs, lightSize: 2.2, rim: [.5, .85, 1.5] });
      const gy = T.hMesh(hs.x, hs.z);
      const M = new Float32Array([R, 0, 0, 0, 0, hp[1] - gy - 6, 0, 0, 0, 0, R, 0, hp[0], hp[1] - 4, hp[2], 1]);
      gl.enable(gl.DEPTH_TEST); gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.disable(gl.CULL_FACE);
      CP.use().m4("uVP", vp).m4("uM", M).v3("uEye", eye).v3("uCol", [.3, .6, 1.3]).f1("uI", .36 * hs.scanning);
      gl.bindVertexArray(CONE.vao); gl.drawElements(gl.TRIANGLES, CONE.count, gl.UNSIGNED_INT, 0); gl.bindVertexArray(null);
      gl.depthMask(true); gl.disable(gl.BLEND);

      /* labels */
      const cornerS = L.cum[6], cq = along(L, Math.min(sNow, cornerS));
      E.place(lab.area, vp, [cq[0], T.hMesh(cq[0], cq[1]) + 40, cq[1]], sm((hs.tc - 9) / 2) * (1 - sm((hs.tc - (CYCLE - 6)) / 2)) * .95, { clamp: true });
      /* name the real ground on the rising front beyond the search */
      const fx = tgt[0] + 2600 * Math.cos(base + PI), fz = tgt[2] + 2600 * Math.sin(base + PI);
      E.place(lab.terrain, vp, [fx, T.hMesh(fx, fz) + 90, fz], SMALL ? 0 : .75, { clamp: true });
    }
  };
})();
