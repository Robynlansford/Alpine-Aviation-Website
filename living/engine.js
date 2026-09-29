/* =====================================================================
   LIVING PAGES — hero engine (BOISE AI)
   One WebGL2 hero per page, either pinned and scrubbed by scroll, or
   "live" (no pin, runs on its own clock). Every hero shares one
   cinematic finish so the whole site reads as one family:

     scene -> HDR target (RGBA16F when the GPU can render to it)
           -> bloom: soft-knee bright pass, 6-level dual-filter blur
           -> composite: bloom, exposure, ACES, edge fringe, vignette,
              film grain (which also kills banding in dark gradients)

   Markup:
     <section class="lp" data-scene="ascent" style="--lp-len:420" data-poster="living/posters/ascent.jpg">
       <div class="lp-pin">
         <div class="lp-beats">
           <div class="lp-beat" data-at="-1,.16" data-static> … h1 … </div>
           <div class="lp-beat" data-at=".22,.42"> … </div>
         </div>
         <div class="lp-labels" aria-hidden="true"></div>
         <div class="lp-rail" aria-hidden="true"><i class="lp-fill"></i></div>
         <a class="lp-skip" href="#after">Skip</a>
         <p class="lp-credit">…</p>
       </div>
     </section>
   Add class "live" for a hero with no pin.

   Beats are visible between their two marks and fade over at most .06
   either side (never overlapping); a mark outside 0..1 means "already
   on" / "stays on". Without JS, CSS shows only the data-static beat.

   Scenes register before this file runs:
     Living.scenes.name = { still: .8, async init(E) {}, frame(E, S) {}, after(E, S) {}, resize(E) {} }
   S = { p (smoothed progress 0..1), t (seconds), dt, px, py (pointer -1..1), raw }

   Reduced motion, no WebGL2, or a failed scene: the section stops
   pinning, shows one still frame (or the poster) and the data-static
   beat. Off-screen or hidden tab: paused. Test hooks: ?lp=0.5 fixes
   progress, ?t=ms offsets the clock.
   ===================================================================== */
(function () {
  "use strict";
  const NS = window.Living = window.Living || { scenes: {} };
  const root = document.querySelector(".lp[data-scene]");
  if (!root) return;

  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const FINE = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const SMALL = matchMedia("(max-width: 720px)").matches;
  const Q = new URLSearchParams(location.search);
  const FIXP = Q.has("lp") ? Math.min(1, Math.max(0, parseFloat(Q.get("lp")) || 0)) : null;
  const TOFF = parseFloat(Q.get("t")) || 0;
  const LIVE = root.classList.contains("live");

  if (root.dataset.poster) root.style.setProperty("--lp-poster", `url("${new URL(root.dataset.poster, document.baseURI).href}")`);
  root.classList.add("lp-on");

  const pin = root.querySelector(".lp-pin");
  const fill = root.querySelector(".lp-fill");
  const labels = root.querySelector(".lp-labels");
  const beats = [...root.querySelectorAll(".lp-beat")].map(el => {
    const [a, b] = (el.dataset.at || "-1,2").split(",").map(Number);
    return { el, a, b };
  });
  const scene = NS.scenes[root.dataset.scene];
  beats.sort((x, y) => x.a - y.a);
  beats.forEach(B => { B.fi = .06; B.fo = .06; });
  for (let i = 0; i < beats.length - 1; i++) {
    const h = Math.max(.008, Math.min(.06, (beats[i + 1].a - beats[i].b) / 2));
    beats[i].fo = h; beats[i + 1].fi = h;
  }

  function goStatic() {
    root.classList.add("static");
    const keep = beats.find(B => B.el.hasAttribute("data-static")) || beats[0];
    beats.forEach(B => {
      if (B !== keep) { B.el.style.display = "none"; return; }
      Object.assign(B.el.style, { opacity: 1, transform: "none", filter: "none", visibility: "visible" });
    });
  }

  /* ------------------------------------------------------------------ */
  const canvas = document.createElement("canvas");
  canvas.className = "lp-canvas"; canvas.setAttribute("aria-hidden", "true");
  pin.prepend(canvas);
  if (FIXP != null) canvas.style.transition = "none";
  let gl = null;
  try { gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: true, stencil: false, premultipliedAlpha: false, powerPreference: "high-performance" }); } catch (e) { gl = null; }
  if (!gl || !scene) { canvas.remove(); root.classList.add("nogl"); root.dataset.lpState = "failed"; goStatic(); return; }
  if (REDUCED) goStatic();

  const HDR = !!gl.getExtension("EXT_color_buffer_float");
  gl.getExtension("OES_texture_float_linear");
  const IFMT = HDR ? gl.RGBA16F : gl.RGBA8, TYPE = HDR ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

  /* ---- programs ---- */
  function compile(type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      console.warn("[lp] shader:", log, "\n" + src.split("\n").map((l, i) => (i + 1) + ": " + l).join("\n").slice(0, 4000));
      return null;
    }
    return s;
  }
  function program(vs, fs, attribs) {
    const v = compile(gl.VERTEX_SHADER, vs), f = compile(gl.FRAGMENT_SHADER, fs);
    if (!v || !f) throw new Error("shader compile failed");
    const p = gl.createProgram(); gl.attachShader(p, v); gl.attachShader(p, f);
    (attribs || ["p"]).forEach((n, i) => gl.bindAttribLocation(p, i, n));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.warn("[lp] link:", gl.getProgramInfoLog(p)); throw new Error("link failed"); }
    const locs = {};
    const L = n => (n in locs) ? locs[n] : (locs[n] = gl.getUniformLocation(p, n));
    return {
      p, use() { gl.useProgram(p); return this; },
      f1(n, a) { gl.uniform1f(L(n), a); return this; },
      f2(n, a, b) { gl.uniform2f(L(n), a, b); return this; },
      f3(n, a, b, c) { gl.uniform3f(L(n), a, b, c); return this; },
      f4(n, a, b, c, d) { gl.uniform4f(L(n), a, b, c, d); return this; },
      v1(n, arr) { gl.uniform1fv(L(n), arr); return this; },
      v2(n, arr) { gl.uniform2fv(L(n), arr); return this; },
      v3(n, arr) { gl.uniform3fv(L(n), arr); return this; },
      v4(n, arr) { gl.uniform4fv(L(n), arr); return this; },
      m3(n, m) { gl.uniformMatrix3fv(L(n), false, m); return this; },
      m4(n, m) { gl.uniformMatrix4fv(L(n), false, m); return this; },
      i1(n, a) { gl.uniform1i(L(n), a); return this; }
    };
  }

  const triVAO = gl.createVertexArray(); gl.bindVertexArray(triVAO);
  const triBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, triBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  function tri() { gl.bindVertexArray(triVAO); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null); }

  const QV = `#version 300 es
in vec2 p; out vec2 vUv;
void main(){ vUv = p*0.5+0.5; gl_Position = vec4(p,0.,1.); }`;

  function target(w, h, depth) {
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, IFMT, w, h, 0, gl.RGBA, TYPE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    let rb = null;
    if (depth) {
      rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fb, rb, w, h };
  }
  function drop(T) { if (!T) return; gl.deleteTexture(T.tex); gl.deleteFramebuffer(T.fb); if (T.rb) gl.deleteRenderbuffer(T.rb); }

  /* ---- post chain ---- */
  const PRE = program(QV, `#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform vec2 uTexel; uniform float uThresh, uKnee;
void main(){
  vec3 s = (texture(uTex, vUv + uTexel*vec2(-.5,-.5)).rgb + texture(uTex, vUv + uTexel*vec2(.5,-.5)).rgb
          + texture(uTex, vUv + uTexel*vec2(-.5,.5)).rgb + texture(uTex, vUv + uTexel*vec2(.5,.5)).rgb) * .25;
  float br = max(s.r, max(s.g, s.b));
  float rq = clamp(br - uThresh + uKnee, 0., 2.*uKnee); rq = rq*rq / (4.*uKnee + 1e-4);
  float w = max(rq, br - uThresh) / max(br, 1e-4);
  o = vec4(min(s * w, vec3(30.)), 1.);
}`);
  const DOWN = program(QV, `#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform vec2 uTexel;
void main(){
  vec2 h = uTexel;
  vec3 s = texture(uTex, vUv).rgb * 4.
    + texture(uTex, vUv - h).rgb + texture(uTex, vUv + h).rgb
    + texture(uTex, vUv + vec2(h.x, -h.y)).rgb + texture(uTex, vUv - vec2(h.x, -h.y)).rgb;
  o = vec4(s / 8., 1.);
}`);
  const UP = program(QV, `#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform vec2 uTexel;
void main(){
  vec2 h = uTexel;
  vec3 s = texture(uTex, vUv + vec2(-2.*h.x, 0.)).rgb + texture(uTex, vUv + vec2(2.*h.x, 0.)).rgb
         + texture(uTex, vUv + vec2(0., 2.*h.y)).rgb + texture(uTex, vUv + vec2(0., -2.*h.y)).rgb
         + (texture(uTex, vUv + vec2(-h.x, h.y)).rgb + texture(uTex, vUv + vec2(h.x, h.y)).rgb
          + texture(uTex, vUv + vec2(h.x, -h.y)).rgb + texture(uTex, vUv + vec2(-h.x, -h.y)).rgb) * 2.;
  o = vec4(s / 12., 1.);
}`);
  const COMP = program(QV, `#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D uScene, uBloom; uniform float uBloomAmt, uExpo, uT, uCA, uVig, uSat, uWarm; uniform vec3 uLift;
vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14), 0., 1.); }
float hash(vec2 p){ p = fract(p*vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
void main(){
  vec2 d = vUv - .5; float r2 = dot(d, d);
  vec2 off = d * uCA * r2;
  vec3 c = vec3(texture(uScene, vUv - off).r, texture(uScene, vUv).g, texture(uScene, vUv + off).b);
  vec3 b = texture(uBloom, vUv).rgb;
  c += b * uBloomAmt;
  c = c * uExpo + uLift;
  float l = dot(c, vec3(.2126, .7152, .0722)); c = mix(vec3(l), c, uSat);
  c *= mix(vec3(1.), vec3(1.04, 1., .93), uWarm);
  c = aces(c);
  c *= 1. - uVig * smoothstep(.08, .62, r2);
  c = pow(c, vec3(1./2.2));
  c += (hash(gl_FragCoord.xy + fract(uT * 7.13) * 91.7) - .5) * (2.2/255.);
  o = vec4(c, 1.);
}`);

  let sceneT = null, mips = [];
  const LEVELS = 6;
  function buildTargets(w, h) {
    drop(sceneT); mips.forEach(drop); mips = [];
    sceneT = target(w, h, true);
    let mw = w, mh = h;
    for (let i = 0; i < LEVELS; i++) { mw = Math.max(1, mw >> 1); mh = Math.max(1, mh >> 1); mips.push(target(mw, mh, false)); }
  }
  function bindTex(unit, tex) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); }
  function post(t) {
    const P = E.post;
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE); gl.depthMask(true);
    PRE.use().i1("uTex", 0).f2("uTexel", 1 / sceneT.w, 1 / sceneT.h).f1("uThresh", P.threshold).f1("uKnee", P.knee);
    gl.bindFramebuffer(gl.FRAMEBUFFER, mips[0].fb); gl.viewport(0, 0, mips[0].w, mips[0].h); bindTex(0, sceneT.tex); tri();
    DOWN.use().i1("uTex", 0);
    for (let i = 1; i < LEVELS; i++) {
      const s = mips[i - 1], d = mips[i];
      DOWN.f2("uTexel", 1 / s.w, 1 / s.h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, d.fb); gl.viewport(0, 0, d.w, d.h); bindTex(0, s.tex); tri();
    }
    UP.use().i1("uTex", 0);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    for (let i = LEVELS - 1; i > 0; i--) {
      const s = mips[i], d = mips[i - 1];
      UP.f2("uTexel", 1 / s.w, 1 / s.h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, d.fb); gl.viewport(0, 0, d.w, d.h); bindTex(0, s.tex); tri();
    }
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height);
    COMP.use().i1("uScene", 0).i1("uBloom", 1).f1("uBloomAmt", P.bloom).f1("uExpo", P.exposure).f1("uT", t)
      .f1("uCA", P.ca).f1("uVig", P.vignette).f1("uSat", P.saturation).f1("uWarm", P.warm).f3("uLift", P.lift[0], P.lift[1], P.lift[2]);
    bindTex(0, sceneT.tex); bindTex(1, mips[0].tex); tri();
  }

  /* ---- matrices (column-major, like GL) ---- */
  const M = {
    persp(fovy, asp, n, f) { const t = 1 / Math.tan(fovy / 2), nf = 1 / (n - f); return new Float32Array([t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) * nf, -1, 0, 0, 2 * f * n * nf, 0]); },
    look(e, c, u) {
      let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2]; let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
      let xx = u[1] * zz - u[2] * zy, xy = u[2] * zx - u[0] * zz, xz = u[0] * zy - u[1] * zx; l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
      const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
      return new Float32Array([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0, -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1]);
    },
    mul(a, b) { const o = new Float32Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; },
    ident() { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); },
    /* model matrix: translate, then yaw (y), pitch (x), roll (z), uniform scale */
    trs(x, y, z, yaw, pitch, roll, s) {
      const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
      s = s == null ? 1 : s;
      /* R = Ry * Rx * Rz */
      const m00 = cy * cr + sy * sp * sr, m01 = -cy * sr + sy * sp * cr, m02 = sy * cp;
      const m10 = cp * sr, m11 = cp * cr, m12 = -sp;
      const m20 = -sy * cr + cy * sp * sr, m21 = sy * sr + cy * sp * cr, m22 = cy * cp;
      return new Float32Array([m00 * s, m10 * s, m20 * s, 0, m01 * s, m11 * s, m21 * s, 0, m02 * s, m12 * s, m22 * s, 0, x, y, z, 1]);
    },
    inv(m) {
      const a = m, o = new Float32Array(16);
      const b00 = a[0] * a[5] - a[1] * a[4], b01 = a[0] * a[6] - a[2] * a[4], b02 = a[0] * a[7] - a[3] * a[4], b03 = a[1] * a[6] - a[2] * a[5], b04 = a[1] * a[7] - a[3] * a[5], b05 = a[2] * a[7] - a[3] * a[6];
      const b06 = a[8] * a[13] - a[9] * a[12], b07 = a[8] * a[14] - a[10] * a[12], b08 = a[8] * a[15] - a[11] * a[12], b09 = a[9] * a[14] - a[10] * a[13], b10 = a[9] * a[15] - a[11] * a[13], b11 = a[10] * a[15] - a[11] * a[14];
      let d = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06; if (!d) return o; d = 1 / d;
      o[0] = (a[5] * b11 - a[6] * b10 + a[7] * b09) * d; o[1] = (a[2] * b10 - a[1] * b11 - a[3] * b09) * d; o[2] = (a[13] * b05 - a[14] * b04 + a[15] * b03) * d; o[3] = (a[10] * b04 - a[9] * b05 - a[11] * b03) * d;
      o[4] = (a[6] * b08 - a[4] * b11 - a[7] * b07) * d; o[5] = (a[0] * b11 - a[2] * b08 + a[3] * b07) * d; o[6] = (a[14] * b02 - a[12] * b05 - a[15] * b01) * d; o[7] = (a[8] * b05 - a[10] * b02 + a[11] * b01) * d;
      o[8] = (a[4] * b10 - a[5] * b08 + a[7] * b06) * d; o[9] = (a[1] * b08 - a[0] * b10 - a[3] * b06) * d; o[10] = (a[12] * b04 - a[13] * b02 + a[15] * b00) * d; o[11] = (a[9] * b02 - a[8] * b04 - a[11] * b00) * d;
      o[12] = (a[5] * b07 - a[4] * b09 - a[6] * b06) * d; o[13] = (a[0] * b09 - a[1] * b07 + a[2] * b06) * d; o[14] = (a[13] * b01 - a[12] * b03 - a[14] * b00) * d; o[15] = (a[8] * b03 - a[9] * b01 + a[10] * b00) * d;
      return o;
    },
    project(vp, x, y, z) {
      const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12], cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
      const cz = vp[2] * x + vp[6] * y + vp[10] * z + vp[14], cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
      if (cw <= 0) return { x: 0, y: 0, z: -1, w: cw };
      return { x: (cx / cw * .5 + .5) * E.cssW, y: (1 - (cy / cw * .5 + .5)) * E.cssH, z: cz / cw * .5 + .5, w: cw };
    }
  };

  const ease = {
    smooth: x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); },
    inOut: x => { x = Math.min(1, Math.max(0, x)); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; },
    range: (x, a, b) => Math.min(1, Math.max(0, (x - a) / (b - a))),
    pulse: (x, a, b, c, d) => Math.min(ease.smooth((x - a) / (b - a)), 1 - ease.smooth((x - c) / (d - c))),
    mix: (a, b, t) => a + (b - a) * t
  };
  function spline(keys, p) {
    let i = 0; while (i < keys.length - 2 && p > keys[i + 1].p) i++;
    const k1 = keys[i], k2 = keys[i + 1], k0 = keys[Math.max(0, i - 1)], k3 = keys[Math.min(keys.length - 1, i + 2)];
    let u = (p - k1.p) / Math.max(1e-6, k2.p - k1.p); u = Math.min(1, Math.max(0, u));
    if (!keys.linear) u = u * u * (3 - 2 * u);
    const u2 = u * u, u3 = u2 * u;
    return k1.v.map((_, j) => .5 * ((2 * k1.v[j]) + (-k0.v[j] + k2.v[j]) * u + (2 * k0.v[j] - 5 * k1.v[j] + 4 * k2.v[j] - k3.v[j]) * u2 + (-k0.v[j] + 3 * k1.v[j] - 3 * k2.v[j] + k3.v[j]) * u3));
  }
  function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function texture(src, opts) {
    opts = opts || {};
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, !!opts.flip);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    const mip = !!opts.mip;
    if (mip) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, opts.repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, opts.repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    const af = gl.getExtension("EXT_texture_filter_anisotropic");
    if (af && mip) gl.texParameterf(gl.TEXTURE_2D, af.TEXTURE_MAX_ANISOTROPY_EXT, 8);
    return t;
  }
  const loadImage = url => new Promise((res, rej) => { const i = new Image(); i.decoding = "async"; i.onload = () => res(i); i.onerror = () => rej(new Error("image " + url)); i.src = url; });
  const loadJSON = url => fetch(url).then(r => { if (!r.ok) throw new Error(url + " " + r.status); return r.json(); });

  /* labels projected from 3D */
  function label(html, cls) {
    const el = document.createElement("span"); el.className = "lp-label" + (cls ? " " + cls : "");
    el.innerHTML = html; labels.appendChild(el); return el;
  }
  function place(el, vp, w, opacity, opts) {
    const q = M.project(vp, w[0], w[1], w[2]);
    if (q.z < 0 || q.z > 1 || opacity < .01) { if (el._o !== 0) { el.style.opacity = 0; el._o = 0; } return q; }
    let x = q.x, y = q.y;
    if (opts && opts.clamp) { const bw = el.offsetWidth || 80, m = 12; x = Math.min(E.cssW - bw / 2 - m, Math.max(bw / 2 + m, x)); }
    el.style.opacity = opacity.toFixed(3); el._o = opacity;
    el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
    return q;
  }

  const E = {
    gl, M, ease, spline, rng, program, tri, texture, loadImage, loadJSON, bindTex, QV, SMALL, FINE, HDR, REDUCED, LIVE,
    root, pin, labels, label, place,
    cssW: 1, cssH: 1, W: 1, H: 1, aspect: 1, scale: 1,
    post: { threshold: 1.0, knee: .6, bloom: .9, exposure: 1, ca: .012, vignette: .55, saturation: 1.05, warm: 0, lift: [0, 0, 0] },
    target: () => sceneT
  };

  let quality = (SMALL ? .85 : 1) * Math.min(devicePixelRatio || 1, 1.5);
  let ready = false;
  function resize() {
    const r = pin.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    E.cssW = r.width; E.cssH = r.height; E.aspect = r.width / r.height;
    const w = Math.max(2, Math.round(r.width * quality)), h = Math.max(2, Math.round(r.height * quality));
    if (w !== canvas.width || h !== canvas.height || !sceneT) {
      canvas.width = w; canvas.height = h; E.W = w; E.H = h; E.scale = quality;
      buildTargets(w, h);
      if (scene.resize && ready) scene.resize(E);
    }
  }

  const S = { p: FIXP == null ? 0 : FIXP, t: 0, dt: 0, px: 0, py: 0, raw: 0 };
  NS.state = S;
  let tpx = 0, tpy = 0;
  function rawProgress() {
    if (FIXP != null) return FIXP;
    if (LIVE) return 0;
    const r = root.getBoundingClientRect(), span = r.height - innerHeight;
    return span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0;
  }
  function beatsAt(p) {
    for (const B of beats) {
      let o = 1, y = 0;
      if (p < B.a) { o = B.a <= 0 ? 1 : ease.smooth((p - (B.a - B.fi)) / B.fi); y = (1 - o) * 28; }
      else if (p > B.b) { o = B.b >= 1 ? 1 : 1 - ease.smooth((p - B.b) / B.fo); y = -(1 - o) * 28; }
      B.el.style.opacity = o.toFixed(3);
      B.el.style.transform = `translate3d(0,${y.toFixed(1)}px,0)`;
      B.el.style.filter = o < .999 ? `blur(${((1 - o) * 6).toFixed(1)}px)` : "none";
      B.el.style.visibility = o < .01 ? "hidden" : "visible";
      B.el.inert = o < .5;
    }
    if (fill) fill.style.transform = `scaleY(${p.toFixed(4)})`;
  }
  if (FINE && !REDUCED) {
    pin.addEventListener("pointermove", e => { const r = pin.getBoundingClientRect(); tpx = (e.clientX - r.left) / r.width * 2 - 1; tpy = (e.clientY - r.top) / r.height * 2 - 1; });
    pin.addEventListener("pointerleave", () => { tpx = 0; tpy = 0; });
  }

  let running = false, visible = false, last = 0, frames = 0, slow = 0, dead = false;
  const t0 = performance.now();
  function frame(now) {
    if (dead || !visible || document.hidden) { running = false; return; }
    S.dt = Math.min(.05, Math.max(0, (now - (last || now)) / 1000)); last = now;
    S.t = (now - t0 + TOFF) / 1000;
    const rp = REDUCED ? (scene.still != null ? scene.still : 1) : rawProgress();
    S.raw = rp;
    S.p = (FIXP != null || REDUCED) ? rp : S.p + (rp - S.p) * (1 - Math.exp(-S.dt * 7));
    S.px += (tpx - S.px) * (1 - Math.exp(-S.dt * 3)); S.py += (tpy - S.py) * (1 - Math.exp(-S.dt * 3));
    if (!REDUCED && !LIVE) beatsAt(S.p);
    if (ready) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, sceneT.fb); gl.viewport(0, 0, sceneT.w, sceneT.h);
      scene.frame(E, S);
      post(S.t);
      if (scene.after) scene.after(E, S);
      if (root.dataset.lpState !== "ready") { root.dataset.lpState = "ready"; root.classList.add("ready"); }
      if (!REDUCED && FIXP == null) {
        frames++;
        if (frames > 40 && frames < 160 && S.dt > .024) slow++;
        if (frames === 160) { if (slow > 60 && quality > .55) { quality *= .72; resize(); } frames = 0; slow = 0; }
      }
    }
    if (REDUCED && ready) { running = false; return; }
    requestAnimationFrame(frame);
  }
  function start() { if (running || dead) return; running = true; last = 0; requestAnimationFrame(frame); }

  new IntersectionObserver(es => { visible = es.some(e => e.isIntersecting); if (visible) start(); }, { rootMargin: "120px" }).observe(root);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && visible) start(); });
  let rt = 0;
  addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { resize(); if (REDUCED) start(); }, 90); }, { passive: true });
  canvas.addEventListener("webglcontextlost", e => { e.preventDefault(); dead = true; canvas.remove(); root.classList.add("nogl"); root.dataset.lpState = "failed"; goStatic(); });

  resize();
  if (!REDUCED && !LIVE) beatsAt(S.p);
  Promise.resolve().then(() => scene.init(E)).then(() => {
    ready = true; resize(); start();
  }).catch(err => {
    console.warn("[lp] scene failed:", err);
    root.dataset.lpState = "failed"; canvas.remove(); root.classList.add("nogl"); goStatic();
  });
})();
