/* =====================================================================
   FIELDS — figure (index #locations)
   "Three fields, one standard." The real relief between Grass Valley,
   California and Lewiston, Idaho (USGS 3DEP, heights x8), drawn as light:
   contour lines at true elevations, a beacon at each of the page's three
   fields with radio rings, and arcs of light that tie them together.
   Beacon positions: the airports nearest each town (OpenStreetMap
   Nominatim, 2026-09-29), labels are the page's own words.
   ===================================================================== */
(function () {
  "use strict";
  const NS = window.LivingFX = window.LivingFX || { scenes: {} };
  const K = window.LivingKit;
  const EX = 8;

  NS.scenes.fields = {
    still: 3.4,
    async init(E) {
      const H = this.H = await K.heightfield(E, "living/data/region.png", "living/data/region.json", EX);
      this.T = K.terrain(E, H, { contour: 400, major: 1200, n: E.SMALL ? 200 : 320, shadows: 0 });
      const names = (E.root.dataset.names || "").split("|");
      /* region.json points: Grass Valley, Oasis / Mountain Home, Lewiston */
      this.fields = H.meta.points.map((pt, i) => {
        const w = H.world(pt.uv[0], pt.uv[1], 0);
        return { w, name: names[i] || pt.name, home: /Mountain Home/.test(pt.name) };
      });
      /* arcs between the fields, lifted in the middle */
      const arcs = [];
      const pairs = [[1, 0], [1, 2], [0, 2]];
      pairs.forEach(([a, b], id) => {
        const A = this.fields[a].w, B = this.fields[b].w, pts = [], d = Math.hypot(B[0] - A[0], B[2] - A[2]);
        for (let i = 0; i <= 80; i++) { const s = i / 80; pts.push([A[0] + (B[0] - A[0]) * s, A[1] + (B[1] - A[1]) * s + Math.sin(s * Math.PI) * d * .16 + 6000, A[2] + (B[2] - A[2]) * s]); }
        arcs.push({ pts, id });
      });
      this.arcs = K.ribbons(E, arcs);
      this.lights = K.sprites(E, 12);
      this.fields.forEach(f => { f.el = E.label(f.name, f.home ? "gold" : ""); });
      /* radio rings: one flat quad per field, rings drawn in the fragment shader */
      this.RP = E.program(`#version 300 es
precision highp float; in vec2 p; uniform mat4 uVP; uniform vec3 uC; uniform float uR; out vec2 vQ;
void main(){ vQ = p; gl_Position = uVP * vec4(uC + vec3(p.x * uR, 900., p.y * uR), 1.); }`,
      `#version 300 es
precision highp float; in vec2 vQ; out vec4 o; uniform float uT, uPh; uniform vec3 uCol;
void main(){ float r = length(vQ); if (r > 1.) discard;
  float w = 0.;
  for (int k = 0; k < 3; k++) { float rr = fract(uT * .22 + uPh + float(k) / 3.); w += exp(-pow((r - rr) / .012, 2.)) * (1. - rr) * (1. - rr); }
  o = vec4(uCol * w * 1.6 + uCol * exp(-r * r * 60.) * .5, 1.); }`);
      const gl = E.gl; this.quad = gl.createVertexArray(); gl.bindVertexArray(this.quad);
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.bindVertexArray(null);
      E.post.bloom = .95; E.post.threshold = .7;
    },
    frame(E, S) {
      const gl = E.gl, t = S.t, H = this.H;
      const A = K.atmos({ sunAz: Math.PI * .92, sunEl: .22, sun: [1.2, .75, .4], zenith: [.01, .016, .04], horizon: [.12, .09, .1] });
      const F = this.fields, tgt = [(F[0].w[0] + F[1].w[0] + F[2].w[0]) / 3, 0, (F[0].w[2] + F[1].w[2] + F[2].w[2]) / 3 + 30000];   /* the middle of the three fields */
      const az = .12 + Math.sin(t * .06) * .2 + S.px * .1, R = E.aspect < 1 ? 1700000 : 1250000, el = .72 + S.py * -.04;
      const eye = [tgt[0] + Math.sin(az) * Math.cos(el) * R, Math.sin(el) * R, tgt[2] + Math.cos(az) * Math.cos(el) * R];
      const fov = .62;
      const vp = E.M.mul(E.M.persp(fov, E.aspect, 5000, 5e6), E.M.look(eye, tgt, [0, 1, 0]));
      this.T.draw(A, vp, eye, t, { fog: 4e6, glow: 1.1, shadows: false, ice: [.2, .38, .8], gold: [.8, .5, .2], edge: .14, cblur: 1.6 });
      this.arcs.draw(vp, { width: 2, color: [1.3, .82, .34], intensity: .75, t, pulse: .16, pulseLen: .08 });
      /* rings */
      gl.enable(gl.DEPTH_TEST); gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      this.RP.use().m4("uVP", vp).f1("uT", t).f1("uR", 70000);
      this.fields.forEach((f, i) => { this.RP.v3("uC", f.w).f1("uPh", i * .31).v3("uCol", f.home ? [1.5, .95, .4] : [.45, .8, 1.6]); gl.bindVertexArray(this.quad); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); });
      gl.bindVertexArray(null); gl.depthMask(true); gl.disable(gl.BLEND);
      let k = 0; const L = this.lights;
      this.fields.forEach(f => { L.pos.set([f.w[0], f.w[1] + 4000, f.w[2]], k * 3); L.col.set(f.home ? [2.6, 1.7, .8] : [1.0, 1.7, 2.8], k * 3); L.size[k] = 16000 * (1 + .15 * Math.sin(t * 3 + k)); k++; });
      L.upload(k); L.draw(vp, K.pxScale(E, fov), { min: 4, max: 70, core: 1.5 });
      this.fields.forEach(f => E.place(f.el, vp, [f.w[0], f.w[1] + 40000, f.w[2]], 1, f.home));
    }
  };
})();
