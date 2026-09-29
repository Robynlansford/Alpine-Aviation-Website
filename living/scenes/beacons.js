/* =====================================================================
   BEACONS — contact.html (live hero, no pin)
   The three places named on the page — "Oasis / Mountain Home, ID",
   "Grass Valley, CA", "Lewiston, ID" — as three beacons on the real
   relief of the region between them, seen at night from high above:
   a slow orbit, radio rings pulsing out from each beacon across the
   terrain, light arcs linking the three, contours glowing faintly.

   REAL: terrain = USGS 3DEP (living/data/region.*), heights x10, contour
   lines at true 500 m / 1,500 m elevations; beacon positions from
   region.json. ILLUSTRATIVE: beacons, rings, arcs, moonlight; beacon and
   arc sizes are not to scale.
   ===================================================================== */
(function () {
  "use strict";
  const NS = window.Living = window.Living || { scenes: {} };
  const K = window.LivingKit;
  const EXAG = 10;

  let H, T, SKY, RINGS, VOID, ARCS, CORE, BEAMS, SPARKS, B = [], C0, AZ0 = -Math.PI / 2;
  const lab = [];

  /* radio rings drawn as a second pass over the terrain grid, so they drape over the relief */
  function rings(E, H) {
    const gl = E.gl, grid = K.grid(E, E.SMALL ? 256 : 400);
    const P = E.program(`#version 300 es
precision highp float;
in vec2 aUv; uniform mat4 uVP; uniform sampler2D uH; uniform vec2 uSize; uniform float uRange, uEx, uLift;
out vec3 vW;
void main(){ float h = texture(uH, aUv).r * uRange * uEx; vW = vec3((aUv.x-.5)*uSize.x, h + uLift, (aUv.y-.5)*uSize.y); gl_Position = uVP * vec4(vW, 1.); }`,
    `#version 300 es
precision highp float;
in vec3 vW; out vec4 o;
uniform vec3 uB[3]; uniform float uT, uRmax, uW; uniform vec3 uIce, uGold; uniform vec2 uHalf;
void main(){
  vec3 c = vec3(0.);
  /* fade out before the edge of the data so no ring is cut by a straight line */
  vec2 m = uHalf - abs(vW.xz);
  float edge = smoothstep(0., 90000., min(m.x, m.y));
  for (int i = 0; i < 3; i++) {
    float d = length(vW.xz - uB[i].xz);
    for (int k = 0; k < 3; k++) {
      float r = fract(uT * .085 + float(k) / 3. + float(i) * .21) * uRmax;
      float a = 1. - r / uRmax;
      float ring = exp(-(((d - r) / uW)*((d - r) / uW)));
      c += mix(uIce, uGold, .15) * ring * a * a * 1.3;
    }
    /* a soft pool of light where each field is */
    c += uGold * exp(-((d / (uRmax * .09))*(d / (uRmax * .09)))) * .35;
  }
  o = vec4(c * edge, 1.);
}`, ["aUv"]);
    return {
      draw(vp, t, bw) {
        gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
        E.bindTex(0, H.tex);
        P.use().m4("uVP", vp).i1("uH", 0).f2("uSize", H.sizeX, H.sizeZ).f1("uRange", H.range).f1("uEx", H.exag).f1("uLift", 900)
          .v3("uB[0]", B[0].w).v3("uB[1]", B[1].w).v3("uB[2]", B[2].w).f1("uT", t).f1("uRmax", 150000).f1("uW", bw).f2("uHalf", H.sizeX / 2, H.sizeZ / 2)
          .v3("uIce", [.3, .62, 1.5]).v3("uGold", [1.5, .92, .4]);
        grid.draw();
        gl.depthMask(true); gl.disable(gl.BLEND);
      }
    };
  }

  /* the night around the map: a dark sheet above the relief with a soft hole the
     shape of the map, so the data's rectangular edge dissolves into the dark */
  function voidSheet(E, H) {
    const gl = E.gl, R = 4e6;
    const vao = K.vao(E, [[new Float32Array([-R, 0, -R, R, 0, -R, R, 0, R, -R, 0, R]), 3]], new Uint32Array([0, 2, 1, 0, 3, 2]));
    const P = E.program(`#version 300 es
precision highp float; in vec3 aP; uniform mat4 uVP; uniform float uY; out vec2 vXZ;
void main(){ vXZ = aP.xz; gl_Position = uVP * vec4(aP.x, uY, aP.z, 1.); }`, `#version 300 es
precision highp float; in vec2 vXZ; out vec4 o; uniform vec2 uHalf; uniform vec3 uCol; uniform float uSoft;
${K.GLSL.hash}
${K.GLSL.noise}
void main(){
  vec2 q = abs(vXZ) - (uHalf - uSoft);
  float d = length(max(q, 0.)) + min(max(q.x, q.y), 0.);   /* rounded-rect distance */
  d += (fbm(vXZ / 160000.) - .5) * uSoft * .9;             /* an organic, coastline-like edge */
  float a = smoothstep(-uSoft * .35, uSoft * .8, d);
  o = vec4(uCol, a);
}`, ["aP"]);
    return {
      draw(vp, y, col) {
        gl.enable(gl.DEPTH_TEST); gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.disable(gl.CULL_FACE);
        P.use().m4("uVP", vp).f1("uY", y).f2("uHalf", H.sizeX / 2, H.sizeZ / 2).v3("uCol", col).f1("uSoft", 150000);
        gl.bindVertexArray(vao); gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_INT, 0); gl.bindVertexArray(null);
        gl.depthMask(true); gl.disable(gl.BLEND);
      }
    };
  }

  NS.scenes.beacons = {
    still: 0,
    async init(E) {
      H = await K.heightfield(E, "living/data/region.png", "living/data/region.json", EXAG);
      T = K.terrain(E, H, { contour: 750, major: 1500, shadows: E.SMALL ? 12 : 22 });
      SKY = K.sky(E);
      RINGS = rings(E, H);
      VOID = voidSheet(E, H);
      /* the three fields, named exactly as on the page */
      const order = ["Oasis / Mountain Home, ID", "Grass Valley, CA", "Lewiston, ID"];
      B = order.map(name => {
        const q = H.meta.points.find(x => x.name === name);
        const w = H.world(q.uv[0], q.uv[1]); w[1] = T.hMesh(w[0], w[2]);
        return { name, w };
      });
      C0 = [0, 1, 2].map(j => (B[0].w[j] + B[1].w[j] + B[2].w[j]) / 3);
      const ax = [B[1].w[0] - B[2].w[0], B[1].w[2] - B[2].w[2]], al = Math.hypot(ax[0], ax[1]);
      AZ0 = Math.atan2(-ax[1] / al, ax[0] / al);

      /* arcs linking the three: raised curves, a light pulse travelling each way */
      const arc = (a, b) => {
        const pts = [], d = Math.hypot(b[0] - a[0], b[2] - a[2]);
        for (let i = 0; i <= 120; i++) {
          const f = i / 120, y = a[1] + (b[1] - a[1]) * f + Math.sin(Math.PI * f) * d * .16;
          pts.push([a[0] + (b[0] - a[0]) * f, y + 2500, a[2] + (b[2] - a[2]) * f]);
        }
        return pts;
      };
      ARCS = K.ribbons(E, [
        { pts: arc(B[0].w, B[1].w), id: 0 }, { pts: arc(B[1].w, B[2].w), id: 1 }, { pts: arc(B[2].w, B[0].w), id: 2 }
      ]);
      /* beacon beams: short vertical light columns */
      BEAMS = K.ribbons(E, B.map((b, i) => ({ pts: [[b.w[0], b.w[1] + 1500, b.w[2]], [b.w[0], b.w[1] + 26000, b.w[2]], [b.w[0], b.w[1] + 70000, b.w[2]]], id: i })));
      CORE = K.sprites(E, 6);
      B.forEach((b, i) => {
        CORE.pos.set([b.w[0], b.w[1] + 3000, b.w[2]], i * 3); CORE.col.set([1.8, 1.25, .62], i * 3); CORE.size[i] = 16000;
        CORE.pos.set([b.w[0], b.w[1] + 3000, b.w[2]], (i + 3) * 3); CORE.col.set([.9, 1.2, 1.8], (i + 3) * 3); CORE.size[i + 3] = 5000;
      });
      CORE.upload();
      /* a few sparks drifting up each beam */
      SPARKS = K.sprites(E, E.SMALL ? 60 : 120);

      B.forEach(b => lab.push({ el: E.label("<span>" + b.name + "</span>", "gold"), w: [b.w[0], b.w[1] + 76000, b.w[2]] }));
      NS.debug = { H, B, C0 };
    },

    frame(E, S) {
      const gl = E.gl, e = E.ease, t = S.t;
      /* night: a cool moon high in the south-east models the relief softly */
      const A = K.atmos({ sunAz: -Math.PI * .25, sunEl: .55, sun: [.5, .62, .95], zenith: [.006, .01, .028], horizon: [.03, .04, .09] });

      /* slow orbit, swinging a little each way so the three stay beside the words */
      /* looking up the Grass Valley -> Lewiston axis: the triangle stands tall, beside the words */
      const az = AZ0 + Math.sin(t * .045) * .14;
      const el = E.SMALL ? .8 : .6;
      const D = E.SMALL ? 1.7e6 : 1.33e6;
      const tgt = [C0[0], 0, C0[2]];
      let eye = [tgt[0] + Math.cos(az) * Math.cos(el) * D, tgt[1] + Math.sin(el) * D, tgt[2] - Math.sin(az) * Math.cos(el) * D];
      eye = [eye[0] + S.px * 30000, eye[1] - S.py * 20000, eye[2]];

      const FOV = E.aspect < 1 ? 1.05 : .78;
      const proj = E.M.persp(FOV, E.aspect, 20000, 6e6);
      if (E.SMALL) proj[9] = -.22; else proj[8] = -.3;
      const view = E.M.look(eye, tgt, [0, 1, 0]);
      const vp = E.M.mul(proj, view);
      const pxs = K.pxScale(E, FOV);

      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      SKY.draw(A, vp, eye, t, { stars: .9, cloud: 0 });
      T.draw(A, vp, eye, t, { fog: 4.5e6, glow: .24, shadows: true, ice: [.24, .46, .95], gold: [.34, .6, 1.1] });
      VOID.draw(vp, 45000, [.004, .006, .016]);
      RINGS.draw(vp, t, E.SMALL ? 3200 : 2400);

      /* arcs + beams */
      ARCS.draw(vp, { width: 2, color: [.34, .66, 1.5], color2: [1.4, .9, .45], idMix: .0, intensity: .7, t, pulse: .09, pulseLen: .08 });
      BEAMS.draw(vp, { width: 2.4, color: [1.4, .95, .5], intensity: .55 + .1 * Math.sin(t * 1.3), t, pulse: .35, pulseLen: .25 });
      for (let i = 0; i < 3; i++) CORE.size[i] = 16000 * (1 + .1 * Math.sin(t * 2.1 + i * 2));
      CORE.upload(); CORE.draw(vp, pxs, { min: 3, max: 60, core: 1.5 });

      const R = E.rng(5); let k = 0;
      for (let i = 0; i < SPARKS.n; i++) {
        const b = B[i % 3].w, ph = (t * .12 + R()) % 1, a = R() * 6.283, r = 1500 + R() * 4000;
        SPARKS.pos.set([b[0] + Math.cos(a) * r, b[1] + 4000 + ph * 60000, b[2] + Math.sin(a) * r], k * 3);
        const f = Math.sin(Math.PI * ph);
        SPARKS.col.set([1.4 * f, .95 * f, .5 * f], k * 3); SPARKS.size[k] = 1600; k++;
      }
      SPARKS.upload(k); SPARKS.draw(vp, pxs, { min: 1, max: 6, core: .6 });

      lab.forEach(l => E.place(l.el, vp, l.w, 1));
    }
  };
})();
