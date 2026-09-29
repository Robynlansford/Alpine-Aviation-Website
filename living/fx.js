/* =====================================================================
   LIVING PAGES — figure engine (BOISE AI)
   Inline 3D figures (not heroes): any number per page, each its own
   WebGL2 canvas with the same finish as the scroll heroes:

     scene  ->  HDR target (RGBA16F when the GPU can render to it)
            ->  bloom: soft-knee bright pass, 5-level dual-filter blur
            ->  composite: bloom, exposure, ACES, soft edge fade, and an
                alpha taken from brightness, so the figure is pure light
                over the page: nothing behind it is boxed in or covered.

   Markup:
     <div class="fx reveal" data-fx="twin" data-poster="assets/fx/twin.jpg"></div>

   Scenes register before this file runs:
     LivingFX.scenes.name = { still: 4.2, async init(E) {}, frame(E, S) {} }
   S = { t (seconds), dt, px, py (pointer -1..1), vis (0..1 on-screen ease-in) }

   No WebGL2, a failed scene, or a lost context: the figure shows its
   poster (a real frame of itself). Reduced motion: one still frame at
   scene.still seconds. Off-screen: paused. Test hook: ?t=ms offsets the
   clock of every figure on the page;
   ?fxt=seconds freezes it there.
   ===================================================================== */
(function () {
  "use strict";
  const NS = window.LivingFX = window.LivingFX || { scenes: {} };
  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const FINE = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const SMALL = matchMedia("(max-width: 720px)").matches;
  const Q = new URLSearchParams(location.search);
  const TOFF = parseFloat(Q.get("t")) || 0;
  const FIXT = Q.has("fxt") ? parseFloat(Q.get("fxt")) || 0 : null;   /* test hook: freeze the clock at this second */

  const QV = `#version 300 es
in vec2 p; out vec2 vUv;
void main(){ vUv = p*0.5+0.5; gl_Position = vec4(p,0.,1.); }`;

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
    trs(x, y, z, yaw, pitch, roll, s) {
      const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
      s = s == null ? 1 : s;
      const m00 = cy * cr + sy * sp * sr, m01 = -cy * sr + sy * sp * cr, m02 = sy * cp;
      const m10 = cp * sr, m11 = cp * cr, m12 = -sp;
      const m20 = -sy * cr + cy * sp * sr, m21 = sy * sr + cy * sp * cr, m22 = cy * cp;
      return new Float32Array([m00 * s, m10 * s, m20 * s, 0, m01 * s, m11 * s, m21 * s, 0, m02 * s, m12 * s, m22 * s, 0, x, y, z, 1]);
    }
  };
  const ease = {
    smooth: x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); },
    inOut: x => { x = Math.min(1, Math.max(0, x)); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; },
    range: (x, a, b) => Math.min(1, Math.max(0, (x - a) / (b - a))),
    /* 0 -> 1 over [a, b], holds, then 1 -> 0 over [c, d] */
    pulse: (x, a, b, c, d) => Math.min(ease.smooth((x - a) / (b - a)), 1 - ease.smooth((x - c) / (d - c))),
    mix: (a, b, t) => a + (b - a) * t
  };
  /* seeded random, so every visit draws the same figure */
  function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  function mount(root) {
    const scene = NS.scenes[root.dataset.fx];
    const stage = document.createElement("div"); stage.className = "fx-stage";
    const canvas = document.createElement("canvas"); canvas.setAttribute("aria-hidden", "true");
    const labels = document.createElement("div"); labels.className = "fx-labels"; labels.setAttribute("aria-hidden", "true");
    stage.appendChild(canvas); stage.appendChild(labels); root.appendChild(stage);
    /* resolved here: a relative url() inside a custom property would resolve against the stylesheet */
    if (root.dataset.poster) root.style.setProperty("--fx-poster", `url("${new URL(root.dataset.poster, document.baseURI).href}")`);

    const fail = why => { if (why) console.warn("[fx]", root.dataset.fx, why); root.classList.add("nogl"); root.dataset.fxState = "failed"; };
    let gl = null;
    try { gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, depth: true, stencil: false, powerPreference: "high-performance" }); } catch (e) { gl = null; }
    if (!gl || !scene) { fail(!scene ? "no scene" : null); return; }
    const HDR = !!gl.getExtension("EXT_color_buffer_float");
    gl.getExtension("OES_texture_float_linear");
    const IFMT = HDR ? gl.RGBA16F : gl.RGBA8, TYPE = HDR ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

    function compile(type, src) {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn("[fx] shader:", gl.getShaderInfoLog(s), "\n" + src.split("\n").map((l, i) => (i + 1) + ": " + l).join("\n").slice(0, 4000)); return null; }
      return s;
    }
    function program(vs, fs, attribs) {
      const v = compile(gl.VERTEX_SHADER, vs), f = compile(gl.FRAGMENT_SHADER, fs);
      if (!v || !f) throw new Error("shader compile failed");
      const p = gl.createProgram(); gl.attachShader(p, v); gl.attachShader(p, f);
      (attribs || ["p"]).forEach((n, i) => gl.bindAttribLocation(p, i, n));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.warn("[fx] link:", gl.getProgramInfoLog(p)); throw new Error("link failed"); }
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
        m4(n, m) { gl.uniformMatrix4fv(L(n), false, m); return this; },
        i1(n, a) { gl.uniform1i(L(n), a); return this; }
      };
    }
    const triVAO = gl.createVertexArray(); gl.bindVertexArray(triVAO);
    const triBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, triBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    const tri = () => { gl.bindVertexArray(triVAO); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null); };

    function target(w, h, depth) {
      const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, IFMT, w, h, 0, gl.RGBA, TYPE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      let rb = null;
      if (depth) { rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb); }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { tex, fb, rb, w, h };
    }
    const drop = T => { if (!T) return; gl.deleteTexture(T.tex); gl.deleteFramebuffer(T.fb); if (T.rb) gl.deleteRenderbuffer(T.rb); };

    let PRE, DOWN, UP, COMP;
    try {
      PRE = program(QV, `#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform vec2 uTexel; uniform float uThresh, uKnee;
void main(){
  vec3 s = (texture(uTex, vUv + uTexel*vec2(-.5,-.5)).rgb + texture(uTex, vUv + uTexel*vec2(.5,-.5)).rgb
          + texture(uTex, vUv + uTexel*vec2(-.5,.5)).rgb + texture(uTex, vUv + uTexel*vec2(.5,.5)).rgb) * .25;
  float br = max(s.r, max(s.g, s.b));
  float rq = clamp(br - uThresh + uKnee, 0., 2.*uKnee); rq = rq*rq / (4.*uKnee + 1e-4);
  o = vec4(min(s * max(rq, br - uThresh) / max(br, 1e-4), vec3(30.)), 1.);
}`);
      DOWN = program(QV, `#version 300 es
precision highp float; in vec2 vUv; out vec4 o; uniform sampler2D uTex; uniform vec2 uTexel;
void main(){ vec2 h = uTexel;
  o = vec4((texture(uTex, vUv).rgb * 4. + texture(uTex, vUv - h).rgb + texture(uTex, vUv + h).rgb
    + texture(uTex, vUv + vec2(h.x, -h.y)).rgb + texture(uTex, vUv - vec2(h.x, -h.y)).rgb) / 8., 1.); }`);
      UP = program(QV, `#version 300 es
precision highp float; in vec2 vUv; out vec4 o; uniform sampler2D uTex; uniform vec2 uTexel;
void main(){ vec2 h = uTexel;
  vec3 s = texture(uTex, vUv + vec2(-2.*h.x, 0.)).rgb + texture(uTex, vUv + vec2(2.*h.x, 0.)).rgb
         + texture(uTex, vUv + vec2(0., 2.*h.y)).rgb + texture(uTex, vUv + vec2(0., -2.*h.y)).rgb
         + (texture(uTex, vUv + vec2(-h.x, h.y)).rgb + texture(uTex, vUv + vec2(h.x, h.y)).rgb
          + texture(uTex, vUv + vec2(h.x, -h.y)).rgb + texture(uTex, vUv + vec2(-h.x, -h.y)).rgb) * 2.;
  o = vec4(s / 12., 1.); }`);
      COMP = program(QV, `#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D uScene, uBloom; uniform float uBloomAmt, uExpo, uSat, uFade, uEdge;
vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14), 0., 1.); }
void main(){
  vec3 c = texture(uScene, vUv).rgb + texture(uBloom, vUv).rgb * uBloomAmt;
  c *= uExpo;
  float l = dot(c, vec3(.2126, .7152, .0722)); c = max(mix(vec3(l), c, uSat), 0.);
  c = pow(aces(c), vec3(1./2.2));
  vec2 e = min(vUv, 1. - vUv);
  c *= smoothstep(0., uEdge, e.x) * smoothstep(0., uEdge, e.y) * uFade;
  o = vec4(c, clamp(max(c.r, max(c.g, c.b)) * 1.1, 0., 1.));
}`);
    } catch (e) { fail("post chain: " + e.message); return; }

    let sceneT = null, mips = [];
    const LEVELS = 5;
    function buildTargets(w, h) {
      drop(sceneT); mips.forEach(drop); mips = [];
      sceneT = target(w, h, true);
      let mw = w, mh = h;
      for (let i = 0; i < LEVELS; i++) { mw = Math.max(1, mw >> 1); mh = Math.max(1, mh >> 1); mips.push(target(mw, mh, false)); }
    }
    const bindTex = (u, tex) => { gl.activeTexture(gl.TEXTURE0 + u); gl.bindTexture(gl.TEXTURE_2D, tex); };
    function post() {
      const P = E.post;
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
      PRE.use().i1("uTex", 0).f2("uTexel", 1 / sceneT.w, 1 / sceneT.h).f1("uThresh", P.threshold).f1("uKnee", P.knee);
      gl.bindFramebuffer(gl.FRAMEBUFFER, mips[0].fb); gl.viewport(0, 0, mips[0].w, mips[0].h); bindTex(0, sceneT.tex); tri();
      DOWN.use().i1("uTex", 0);
      for (let i = 1; i < LEVELS; i++) { const s = mips[i - 1], d = mips[i]; DOWN.f2("uTexel", 1 / s.w, 1 / s.h); gl.bindFramebuffer(gl.FRAMEBUFFER, d.fb); gl.viewport(0, 0, d.w, d.h); bindTex(0, s.tex); tri(); }
      UP.use().i1("uTex", 0);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      for (let i = LEVELS - 1; i > 0; i--) { const s = mips[i], d = mips[i - 1]; UP.f2("uTexel", 1 / s.w, 1 / s.h); gl.bindFramebuffer(gl.FRAMEBUFFER, d.fb); gl.viewport(0, 0, d.w, d.h); bindTex(0, s.tex); tri(); }
      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      COMP.use().i1("uScene", 0).i1("uBloom", 1).f1("uBloomAmt", P.bloom).f1("uExpo", P.exposure).f1("uSat", P.saturation)
        .f1("uFade", S.vis).f1("uEdge", P.edge);
      bindTex(0, sceneT.tex); bindTex(1, mips[0].tex); tri();
    }

    /* labels: HTML, placed from world points each frame */
    function label(text, cls) {
      const el = document.createElement("span"); el.className = "fx-label" + (cls ? " " + cls : "");
      el.innerHTML = "<i></i><b></b>"; el.querySelector("b").textContent = text;
      labels.appendChild(el); return el;
    }
    function project(vp, x, y, z) {
      const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12], cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
      const cz = vp[2] * x + vp[6] * y + vp[10] * z + vp[14], cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
      if (cw <= 0) return { x: 0, y: 0, z: -1, w: cw };
      return { x: (cx / cw * .5 + .5) * E.cssW, y: (1 - (cy / cw * .5 + .5)) * E.cssH, z: cz / cw * .5 + .5, w: cw };
    }
    /* place a label at a world point; keeps the whole label inside the figure */
    function place(el, vp, w, opacity, on) {
      const q = project(vp, w[0], w[1], w[2]);
      if (q.z < 0 || q.z > 1 || opacity < .01) { el.style.opacity = 0; return q; }
      const bw = el.offsetWidth || 80, m = 6;
      const x = Math.min(E.cssW - bw / 2 - m, Math.max(bw / 2 + m, q.x));
      el.style.opacity = opacity.toFixed(3);
      el.style.transform = `translate3d(${x.toFixed(1)}px,${q.y.toFixed(1)}px,0) translate(-50%,-50%)`;
      el.classList.toggle("on", !!on);
      return q;
    }

    function texture(src, opts) {
      opts = opts || {};
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, !!opts.flip);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      if (opts.mip) gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, opts.mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, opts.repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, opts.repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
      return t;
    }
    const loadImage = url => new Promise((res, rej) => { const i = new Image(); i.decoding = "async"; i.onload = () => res(i); i.onerror = () => rej(new Error("image " + url)); i.src = url; });
    const loadJSON = url => fetch(url).then(r => { if (!r.ok) throw new Error(url + " " + r.status); return r.json(); });

    const E = {
      gl, M, ease, rng, program, tri, QV, SMALL, FINE, HDR, REDUCED, root, bindTex, label, project, place, texture, loadImage, loadJSON, labelsEl: labels,
      cssW: 1, cssH: 1, W: 1, H: 1, aspect: 1, scale: 1,
      post: { threshold: .9, knee: .6, bloom: .85, exposure: 1, saturation: 1.05, edge: .06 }
    };

    let quality = Math.min(devicePixelRatio || 1, SMALL ? 2 : 1.75);
    function resize() {
      const r = stage.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      E.cssW = r.width; E.cssH = r.height; E.aspect = r.width / r.height;
      const w = Math.max(2, Math.round(r.width * quality)), h = Math.max(2, Math.round(r.height * quality));
      if (w !== canvas.width || h !== canvas.height || !sceneT) {
        canvas.width = w; canvas.height = h; E.W = w; E.H = h; E.scale = quality;
        buildTargets(w, h);
      }
    }

    const S = { t: 0, dt: 0, px: 0, py: 0, vis: 0 };
    let tpx = 0, tpy = 0;
    if (FINE && !REDUCED) {
      root.addEventListener("pointermove", e => { const r = stage.getBoundingClientRect(); tpx = (e.clientX - r.left) / r.width * 2 - 1; tpy = (e.clientY - r.top) / r.height * 2 - 1; });
      root.addEventListener("pointerleave", () => { tpx = 0; tpy = 0; });
    }

    let ready = false, running = false, visible = false, last = 0, clock = 0, frames = 0, slow = 0, dead = false;
    function frame(now) {
      if (dead || !visible || document.hidden) { running = false; return; }
      S.dt = Math.min(.05, Math.max(0, (now - (last || now)) / 1000)); last = now;
      clock += S.dt;
      S.t = FIXT != null ? FIXT : REDUCED ? (scene.still || 0) : clock + TOFF / 1000;
      S.vis = REDUCED || FIXT != null ? 1 : Math.min(1, S.vis + S.dt * 1.4);
      S.px += (tpx - S.px) * (1 - Math.exp(-S.dt * 3)); S.py += (tpy - S.py) * (1 - Math.exp(-S.dt * 3));
      if (ready) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, sceneT.fb); gl.viewport(0, 0, sceneT.w, sceneT.h);
        gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        scene.frame(E, S);
        post();
        if (root.dataset.fxState !== "ready") { root.dataset.fxState = "ready"; root.classList.add("live"); }
        if (!REDUCED) {
          frames++;
          if (frames > 40 && frames < 160 && S.dt > .024) slow++;
          if (frames === 160 && slow > 60 && quality > .7) { quality *= .75; resize(); frames = 0; slow = 0; }
        }
      }
      if (REDUCED && ready) { running = false; return; }
      requestAnimationFrame(frame);
    }
    function start() { if (running || dead) return; running = true; last = 0; requestAnimationFrame(frame); }

    new IntersectionObserver(es => { visible = es.some(e => e.isIntersecting); if (visible) start(); }, { rootMargin: "80px" }).observe(root);
    document.addEventListener("visibilitychange", () => { if (!document.hidden && visible) start(); });
    let rt = 0;
    addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { resize(); if (REDUCED) start(); }, 90); }, { passive: true });
    canvas.addEventListener("webglcontextlost", e => { e.preventDefault(); dead = true; fail("context lost"); });

    resize();
    Promise.resolve().then(() => scene.init(E)).then(() => { ready = true; resize(); start(); })
      .catch(err => { fail("scene: " + (err && err.message)); canvas.remove(); });
  }

  document.querySelectorAll(".fx[data-fx]").forEach(mount);
  NS.mounted = true;
})();
