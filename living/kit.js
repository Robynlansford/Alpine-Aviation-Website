/* =====================================================================
   LIVING PAGES — shared 3D kit for Alpine Aviation (BOISE AI)
   Used by hero scenes (Living) and figures (LivingFX). Every function
   takes the engine object E (both engines share gl/program/tri/M).

     K.GLSL.*          noise, sky, fog and tone chunks
     K.heightfield()   real terrain: decodes a baked 16-bit heightmap
                       (tools/bake_terrain.py) into an R16F texture + CPU copy
     K.terrain()       golden-hour relief: sun + long terrain shadows,
                       glowing contour lines at real elevations, haze
     K.sky()           dusk sky: gradient, sun, cirrus, stars
     K.ribbons()       glowing lines draped on the terrain or free in 3D,
                       constant screen width, animated light pulses
     K.aircraft()      stylized glass helicopter + airplane, rotor discs,
                       navigation lights
     K.sprites()       additive glow points (lights, dust, pollen, stars)

   World units are metres. Y is up. Terrain u runs west->east (+X),
   v north->south (+Z).
   ===================================================================== */
(function () {
  "use strict";
  const K = window.LivingKit = window.LivingKit || {};

  /* ---------------------------------------------------------------- GLSL */
  K.GLSL = {
    hash: `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }`,
    noise: `
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
float fbm(vec2 p){ float s = 0., a = .5; mat2 r = mat2(.8,.6,-.6,.8); for(int i=0;i<5;i++){ s += a*vnoise(p); p = r*p*2.03; a *= .5; } return s; }`,
    /* dusk atmosphere shared by sky, terrain fog and objects.
       uSunDir (normalised, toward the sun), uSunCol, uZenith, uHorizon */
    atmos: `
uniform vec3 uSunDir, uSunCol, uZenith, uHorizon;
vec3 skyCol(vec3 rd){
  float h = rd.y;
  float sd = max(dot(rd, uSunDir), 0.);
  float sideSun = pow(clamp(dot(normalize(vec3(rd.x, 0., rd.z) + 1e-5), normalize(vec3(uSunDir.x, 0., uSunDir.z) + 1e-5)) * .5 + .5, 0., 1.), 2.2);   /* clamp: pow of a rounding-negative base is NaN */
  vec3 hor = mix(uHorizon * vec3(.22, .3, .78), uHorizon, sideSun);           /* gold toward the sun, violet-blue away */
  vec3 mid = mix(vec3(.030, .036, .085), uHorizon * .35, sideSun * .5);
  float hh = clamp(h, 0., 1.);
  vec3 c = mix(hor, mid, smoothstep(0., .16, hh));
  c = mix(c, uZenith, smoothstep(.1, .62, hh));
  c = mix(c, hor * .35, 1. - smoothstep(-.2, 0., h));                                /* below the horizon: dim haze */
  c += uSunCol * (pow(sd, 8.) * .35 + pow(sd, 90.) * 2.2 + pow(sd, 1400.) * 18.) * smoothstep(-.08, .03, h + .05);
  return c;
}
vec3 fogCol(vec3 rd){ vec3 f = skyCol(normalize(vec3(rd.x, max(rd.y, .02), rd.z))); return f; }`
  };

  /* ---------------------------------------------------------- utilities */
  K.buffer = function (E, data, target) {
    const gl = E.gl, b = gl.createBuffer(); gl.bindBuffer(target || gl.ARRAY_BUFFER, b); gl.bufferData(target || gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return b;
  };
  /* vao from {name: [Float32Array, size]} in attribute order, optional indices */
  K.vao = function (E, attrs, indices) {
    const gl = E.gl, v = gl.createVertexArray(); gl.bindVertexArray(v);
    attrs.forEach((a, i) => { K.buffer(E, a[0]); gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, a[1], gl.FLOAT, false, 0, 0); if (a[2]) gl.vertexAttribDivisor(i, 1); });
    let ib = null;
    if (indices) { ib = K.buffer(E, indices, gl.ELEMENT_ARRAY_BUFFER); }
    gl.bindVertexArray(null);
    return v;
  };

  /* ------------------------------------------------------- heightfield */
  /* url: baked png (R hi, G lo), meta: baked json. exag: vertical exaggeration.
     Returns { tex, w, h, meta, data (0..1), sizeX, sizeZ, exag, hAt(x,z) metres, world(u,v) -> [x,y,z] } */
  K.heightfield = async function (E, pngUrl, jsonUrl, exag) {
    const gl = E.gl;
    const [img, meta] = await Promise.all([E.loadImage(pngUrl), E.loadJSON(jsonUrl)]);
    const w = img.naturalWidth, h = img.naturalHeight;
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    const cx = cv.getContext("2d", { willReadFrequently: true, colorSpace: "srgb" });
    cx.drawImage(img, 0, 0);
    const px = cx.getImageData(0, 0, w, h).data;
    const data = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) data[i] = (px[i * 4] * 256 + px[i * 4 + 1]) / 65535;
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, w, h, 0, gl.RED, gl.FLOAT, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const sizeX = meta.km[0] * 1000, sizeZ = meta.km[1] * 1000, range = meta.hmax - meta.hmin;
    exag = exag || 1;
    const H = {
      tex, w, h, meta, data, sizeX, sizeZ, exag, range,
      /* normalised height at uv, bilinear */
      n(u, v) {
        const x = Math.min(w - 1.001, Math.max(0, u * w - .5)), y = Math.min(h - 1.001, Math.max(0, v * h - .5));
        const ix = x | 0, iy = y | 0, fx = x - ix, fy = y - iy, i = iy * w + ix;
        return (data[i] * (1 - fx) + data[i + 1] * fx) * (1 - fy) + (data[i + w] * (1 - fx) + data[i + w + 1] * fx) * fy;
      },
      /* world height (m, exaggerated, relative to hmin) at world x,z */
      hAt(x, z) { return H.n(x / sizeX + .5, z / sizeZ + .5) * range * exag; },
      world(u, v, lift) { return [(u - .5) * sizeX, H.n(u, v) * range * exag + (lift || 0), (v - .5) * sizeZ]; },
      uvOf(x, z) { return [x / sizeX + .5, z / sizeZ + .5]; },
      /* real elevation (m above sea level) at world x,z */
      elev(x, z) { return meta.hmin + H.n(x / sizeX + .5, z / sizeZ + .5) * range; }
    };
    return H;
  };

  /* grid of uv vertices, n x n, triangle indices */
  K.grid = function (E, n) {
    const gl = E.gl;
    const uv = new Float32Array(n * n * 2);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { uv[(j * n + i) * 2] = i / (n - 1); uv[(j * n + i) * 2 + 1] = j / (n - 1); }
    const idx = new Uint32Array((n - 1) * (n - 1) * 6); let k = 0;
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d;
    }
    const vao = K.vao(E, [[uv, 2]], idx);
    return { vao, count: idx.length, draw() { gl.bindVertexArray(vao); gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_INT, 0); gl.bindVertexArray(null); } };
  };

  /* -------------------------------------------------------------- sky */
  K.sky = function (E) {
    const P = E.program(E.QV, `#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform mat4 uInvVP; uniform vec3 uEye; uniform float uT, uStars, uCloud, uExpo;
${K.GLSL.hash}
${K.GLSL.noise}
${K.GLSL.atmos}
void main(){
  vec4 a = uInvVP * vec4(vUv*2.-1., 1., 1.); vec3 rd = normalize(a.xyz/a.w - uEye);
  vec3 c = skyCol(rd);
  /* cirrus: thin bands lit gold toward the sun */
  if (rd.y > 0.) {
    vec2 cp = rd.xz / (rd.y + .08) * .9 + vec2(uT*.004, 0.);
    float cl = smoothstep(.52, .85, fbm(cp * vec2(1., 3.2))) * smoothstep(0., .18, rd.y) * (1. - smoothstep(.45, .9, rd.y));
    float sd = max(dot(rd, uSunDir), 0.);
    c += cl * uCloud * (uSunCol * (.35 + 1.4*pow(sd, 4.)) + uHorizon * .25);
    /* stars in the dark upper sky */
    vec2 sp = rd.xz / (rd.y + .35) * 260.;
    vec2 cell = floor(sp); float r = hash12(cell);
    float st = step(.9965, r) * smoothstep(.35, .75, rd.y) * uStars;
    vec2 f = fract(sp) - .5 - (hash22(cell) - .5) * .6;
    c += vec3(.85, .9, 1.) * st * (1. - smoothstep(0., .09, length(f))) * (1.4 + .8*sin(uT*2. + r*80.)) ;
  }
  o = vec4(c * uExpo, 1.);
}`);
    return {
      draw(A, vp, eye, t, opts) {
        const gl = E.gl; opts = opts || {};
        gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
        P.use().m4("uInvVP", E.M.inv(vp)).v3("uEye", eye).f1("uT", t).f1("uStars", opts.stars == null ? .6 : opts.stars)
          .f1("uCloud", opts.cloud == null ? .5 : opts.cloud).f1("uExpo", opts.expo || 1);
        K.atmosUniforms(P, A);
        E.tri();
        gl.depthMask(true);
      }
    };
  };
  /* atmosphere presets. sunAz: radians from +X toward -Z (west = PI when +X is east) */
  K.atmos = function (o) {
    o = Object.assign({ sunAz: Math.PI * .96, sunEl: .06, sun: [2.4, 1.25, .5], zenith: [.012, .02, .055], horizon: [.42, .24, .12] }, o || {});
    const ce = Math.cos(o.sunEl);
    return { sunDir: [Math.cos(o.sunAz) * ce, Math.sin(o.sunEl), -Math.sin(o.sunAz) * ce], sunCol: o.sun, zenith: o.zenith, horizon: o.horizon };
  };
  K.atmosUniforms = function (P, A) { P.v3("uSunDir", A.sunDir).v3("uSunCol", A.sunCol).v3("uZenith", A.zenith).v3("uHorizon", A.horizon); };

  /* ---------------------------------------------------------- terrain */
  /* opts: { n: grid size, contour: metres, major: metres, shadows: steps } */
  K.terrain = function (E, H, opts) {
    opts = Object.assign({ n: E.SMALL ? 288 : 512, contour: 50, major: 250, shadows: E.SMALL ? 14 : 28 }, opts || {});
    const grid = K.grid(E, opts.n);
    const N = opts.n, vh = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) vh[j * N + i] = H.n(i / (N - 1), j / (N - 1));
    /* height of the drawn surface (triangles a-c-b / b-c-d), in world metres */
    function hMesh(x, z) {
      const u = Math.min(.99999, Math.max(0, x / H.sizeX + .5)) * (N - 1), v = Math.min(.99999, Math.max(0, z / H.sizeZ + .5)) * (N - 1);
      const i = u | 0, j = v | 0, fx = u - i, fz = v - j;
      const a = vh[j * N + i], b = vh[j * N + i + 1], c = vh[(j + 1) * N + i], d = vh[(j + 1) * N + i + 1];
      const h = fx + fz <= 1 ? a + (b - a) * fx + (c - a) * fz : d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
      return h * H.range * H.exag;
    }
    const VS = `#version 300 es
precision highp float;
in vec2 aUv; uniform mat4 uVP; uniform sampler2D uH; uniform vec2 uSize; uniform float uRange, uEx;
out vec2 vUv; out vec3 vW;
void main(){ vUv = aUv; float h = texture(uH, aUv).r * uRange * uEx;
  vec3 p = vec3((aUv.x-.5)*uSize.x, h, (aUv.y-.5)*uSize.y); vW = p; gl_Position = uVP * vec4(p, 1.); }`;
    const FS = `#version 300 es
precision highp float;
in vec2 vUv; in vec3 vW; out vec4 o;
uniform sampler2D uH; uniform vec2 uSize, uTx; uniform float uRange, uEx, uHmin, uT, uContour, uMajor, uGlow, uFogD, uShadow, uLift, uScan, uScanR;
uniform vec3 uEye, uIce, uGold, uFocus; uniform float uFocusR, uFocusAmt, uDbg, uEdge, uCBlur;
${K.GLSL.hash}
${K.GLSL.noise}
${K.GLSL.atmos}
float Hn(vec2 uv){ return texture(uH, uv).r; }
float Hw(vec2 uv){ return Hn(uv) * uRange * uEx; }
void main(){
  float hc = Hw(vUv);
  float hx = Hw(vUv + vec2(uTx.x, 0.)) - Hw(vUv - vec2(uTx.x, 0.));
  float hz = Hw(vUv + vec2(0., uTx.y)) - Hw(vUv - vec2(0., uTx.y));
  vec3 n = normalize(vec3(-hx / (2.*uTx.x*uSize.x), 1., -hz / (2.*uTx.y*uSize.y)));
  vec3 L = uSunDir;
  float dif = max(dot(n, L), 0.);
  /* long golden-hour shadows: march the heightmap toward the sun */
  float sh = 1.;
  if (uShadow > 0.5 && dif > 0.) {
    vec3 p = vW + n * 2.;
    float stepLen = max(uSize.x, uSize.y) / 900.;
    for (int i = 1; i <= ${Math.max(4, opts.shadows)}; i++) {
      float d = stepLen * float(i) * float(i) * .55;
      vec3 q = p + L * d;
      vec2 quv = vec2(q.x/uSize.x + .5, q.z/uSize.y + .5);
      if (quv.x < 0. || quv.x > 1. || quv.y < 0. || quv.y > 1.) break;
      float hh = Hw(quv);
      sh = min(sh, clamp((q.y - hh) / (d * .06) , 0., 1.));
      if (sh < .02) break;
    }
  }
  float elev = uHmin + hc / uEx;
  /* optional: contours from a softened height (coarse data would otherwise draw pixel-stepped lines) */
  if (uCBlur > 0.) { vec2 b = uTx * uCBlur; float hb = (Hn(vUv) * 2. + Hn(vUv + vec2(b.x, 0.)) + Hn(vUv - vec2(b.x, 0.)) + Hn(vUv + vec2(0., b.y)) + Hn(vUv - vec2(0., b.y))
      + Hn(vUv + b) + Hn(vUv - b) + Hn(vUv + vec2(b.x, -b.y)) + Hn(vUv + vec2(-b.x, b.y))) / 10.; elev = uHmin + hb * uRange; }
  /* base: dark slate earth with a little sage in the lows, rock on steep slopes */
  float slope = 1. - n.y;
  vec3 albedo = mix(vec3(.040, .037, .034), vec3(.026, .031, .042), smoothstep(.15, .5, slope));
  albedo *= .78 + .44 * fbm(vUv * 180.);
  float dcam = length(uEye - vW);
  /* sage-and-dirt texture that only exists up close */
  float near = 1. - smoothstep(60., 900., dcam);
  if (near > 0.) { float g = fbm(vW.xz * .09) * .6 + fbm(vW.xz * .7) * .4; albedo *= mix(1., .55 + .9 * g, near); albedo = mix(albedo, albedo * vec3(.8, 1.05, .85), near * smoothstep(.55, .7, g)); }
  vec3 c = albedo * uSunCol * dif * sh * 1.6;                                   /* warm sun */
  c += albedo * uZenith * 5. * (.55 + .45*n.y);                                  /* cool sky fill */
  c += albedo * uHorizon * .9 * max(dot(n, -vec3(L.x, 0., L.z)), 0.) * .6;       /* bounce from the lit side */
  /* rim: ridges catching the last light */
  vec3 V = normalize(uEye - vW);
  float rim = pow(clamp(1. - dot(n, V), 0., 1.), 4.) * dif * sh;
  c += uSunCol * rim * .35;
  /* contour lines at real elevations: every uContour m, brighter every uMajor m */
  float lv = elev / uContour, fw = max(fwidth(lv), 1e-4);
  float line = 1. - smoothstep(0., 1.3*fw, abs(fract(lv - .5) - .5));
  float mv = elev / uMajor, fm = max(fwidth(mv), 1e-4);
  float major = 1. - smoothstep(0., 1.6*fm, abs(fract(mv - .5) - .5));
  float dist = length(uEye - vW);
  float cfade = exp(-dist / (uFogD * .42));
  /* when many contours crowd into one pixel (grazing angles, far away) they would alias into a solid wash: fade them */
  line *= 1. - smoothstep(.05, .22, fw);
  major *= 1. - smoothstep(.06, .28, fm);
  /* and at grazing angles, where far plains stack their lines into glittering streaks along the horizon */
  float graze = smoothstep(.03, .2, dot(n, V));
  float lines = (line * .55 + major * 1.35) * cfade * uGlow * graze;
  /* contours glow ice-blue in shadow, warm gold where the sun hits */
  vec3 lc = mix(uIce, uGold, smoothstep(.2, .8, dif * sh));
  c += lc * lines;
  vec3 dbgA = c;
  /* optional focus: a lit circle around a point (a field, a beacon) */
  float fd = length(vW.xz - uFocus.xz);
  c += uGold * uFocusAmt * ((1. - smoothstep(uFocusR*.2, uFocusR, fd)) * .25 + (1. - smoothstep(0., uFocusR*.04, abs(fd - uFocusR))) * 1.6);
  vec3 dbgB = c;
  /* optional scan ring sweeping outward */
  if (uScan > 0.) { float sr = abs(fd - uScanR); c += uIce * uScan * (1. - smoothstep(0., uScanR*.02 + 20., sr)) * 2.; }
  vec3 dbgC = c;
  /* haze */
  vec3 rd = normalize(vW - uEye);
  float fog = 1. - exp(-dist / uFogD);
  fog = clamp(fog * (1. - smoothstep(0., 1., (vW.y - uLift) / 6000.) * .3), 0., 1.);
  c = mix(c, fogCol(rd), fog);
  if (uEdge > 0.) { vec2 eu = min(vUv, 1. - vUv); c *= smoothstep(0., uEdge, eu.x) * smoothstep(0., uEdge, eu.y); }   /* optional: dissolve the map's edges */
  if (uDbg > .5) { c = uDbg < 1.5 ? vec3(fog) : uDbg < 2.5 ? vec3(lines) : uDbg < 3.5 ? vec3(dif*sh) : uDbg < 4.5 ? albedo*10. : uDbg < 5.5 ? vec3(dist/1000.) : uDbg < 6.5 ? dbgA : uDbg < 7.5 ? dbgB : dbgC; }
  o = vec4(c, 1.);
}`;
    const P = E.program(VS, FS, ["aUv"]);
    return {
      grid, P, hMesh,
      draw(A, vp, eye, t, u) {
        const gl = E.gl; u = u || {};
        gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
        gl.disable(gl.BLEND); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.frontFace(gl.CCW);
        E.bindTex(0, H.tex);
        P.use().m4("uVP", vp).i1("uH", 0).f2("uSize", H.sizeX, H.sizeZ).f2("uTx", 1 / H.w, 1 / H.h).f1("uRange", H.range).f1("uEx", H.exag)
          .f1("uHmin", H.meta.hmin).f1("uT", t).v3("uEye", eye)
          .f1("uContour", u.contour || opts.contour).f1("uMajor", u.major || opts.major).f1("uGlow", u.glow == null ? 1 : u.glow)
          .f1("uFogD", u.fog || 30000).f1("uShadow", u.shadows === false ? 0 : 1).f1("uLift", 0)
          .v3("uIce", u.ice || [.30, .55, .95]).v3("uGold", u.gold || [1.1, .66, .26])
          .v3("uFocus", u.focus || [0, 0, 0]).f1("uFocusR", u.focusR || 1000).f1("uFocusAmt", u.focusAmt || 0)
          .f1("uScan", u.scan || 0).f1("uScanR", u.scanR || 0).f1("uDbg", K.dbg || 0).f1("uEdge", u.edge || 0).f1("uCBlur", u.cblur || 0);
        K.atmosUniforms(P, A);
        grid.draw();
        gl.disable(gl.CULL_FACE);
      }
    };
  };

  /* ---------------------------------------------------------- ribbons */
  /* Glowing polylines with constant screen width. Each line: array of [x,y,z] points (world),
     or for draped lines: [u,v] pairs + H (height sampled on the GPU, lifted by opts.lift).
     Draw with additive blending; a light pulse can travel along each line (uPulse). */
  K.ribbons = function (E, lines, opts) {
    opts = Object.assign({ draped: null, lift: 6 }, opts || {});
    const gl = E.gl;
    const pos = [], nxt = [], prv = [], side = [], along = [], lid = [], idx = [];
    let base = 0;
    lines.forEach((L, li) => {
      const pts = L.pts || L;
      const n = pts.length; if (n < 2) return;
      /* cumulative length for 'along' (0..1 per line) */
      const d = [0]; for (let i = 1; i < n; i++) { const a = pts[i - 1], b = pts[i]; d.push(d[i - 1] + Math.hypot(b[0] - a[0], (b[1] - a[1]) || 0, (b[2] || 0) - (a[2] || 0))); }
      const tot = d[n - 1] || 1;
      for (let i = 0; i < n; i++) {
        const p = pts[i], pn = pts[Math.min(n - 1, i + 1)], pp = pts[Math.max(0, i - 1)];
        for (let s = -1; s <= 1; s += 2) {
          pos.push(p[0], p[1], p[2] || 0); nxt.push(pn[0], pn[1], pn[2] || 0); prv.push(pp[0], pp[1], pp[2] || 0);
          side.push(s); along.push(d[i] / tot); lid.push(L.id != null ? L.id : li);
        }
        if (i < n - 1) { const a = base + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      base += n * 2;
    });
    const vao = K.vao(E, [[new Float32Array(pos), 3], [new Float32Array(nxt), 3], [new Float32Array(prv), 3], [new Float32Array(side), 1], [new Float32Array(along), 1], [new Float32Array(lid), 1]], new Uint32Array(idx));
    const count = idx.length;
    const drape = !!opts.draped;
    const VS = `#version 300 es
precision highp float;
in vec3 aP, aN, aV; in float aS, aA, aId;
uniform mat4 uVP; uniform vec2 uRes; uniform float uW;
${drape ? "uniform sampler2D uH; uniform vec2 uSize; uniform float uRange, uEx, uLiftM;" : ""}
out float vA, vS, vId; out float vDepth;
vec3 W(vec3 q){ ${drape ? "return vec3((q.x-.5)*uSize.x, texture(uH, q.xy).r*uRange*uEx + uLiftM, (q.y-.5)*uSize.y);" : "return q;"} }
void main(){
  vec4 c = uVP * vec4(W(aP), 1.), cn = uVP * vec4(W(aN), 1.), cp = uVP * vec4(W(aV), 1.);
  /* clip against the near plane (z = -w) before extruding: a vertex behind the eye would
     otherwise interpolate its width across the plane into a screen-wide band */
  float dc = c.z + c.w, dn = cn.z + cn.w, dp = cp.z + cp.w;
  if (dc < 0.) {
    if (dn > 0.) c = mix(c, cn, min(1., dc / (dc - dn) + 1e-4));
    else if (dp > 0.) c = mix(c, cp, min(1., dc / (dc - dp) + 1e-4));
    dc = c.z + c.w;
  }
  if (dc > 0.) {
    if (dn < 0.) cn = mix(c, cn, dc / (dc - dn) * .999);
    if (dp < 0.) cp = mix(c, cp, dc / (dc - dp) * .999);
  }
  vec2 s = c.xy / c.w, sn = cn.xy / cn.w, sp = cp.xy / cp.w;
  vec2 dir = normalize((sn - sp) * uRes + 1e-6);
  vec2 nrm = vec2(-dir.y, dir.x);
  c.xy += nrm * aS * uW / uRes * c.w;
  gl_Position = c; vA = aA; vS = aS; vId = aId; vDepth = c.w;
}`;
    const FS = `#version 300 es
precision highp float;
in float vA, vS, vId; in float vDepth; out vec4 o;
uniform vec3 uCol, uCol2; uniform float uI, uT, uPulse, uPulseLen, uReveal, uFadeD, uIdMix, uNearD;
float h1(float n){ return fract(sin(n*127.1)*43758.5453); }
void main(){
  if (vA > uReveal) discard;
  float core = 1. - smoothstep(0., 1., abs(vS));
  float g = pow(core, 1.6) * .75 + pow(core, 8.) * .9;
  vec3 col = mix(uCol, uCol2, uIdMix > 0. ? h1(vId) * uIdMix : 0.);
  float head = uReveal < 1. ? smoothstep(uReveal - .03, uReveal, vA) * 2.5 : 0.;
  float pulse = 0.;
  if (uPulse > 0.) { float ph = fract(vA * 1.0 - uT * uPulse + h1(vId)); pulse = (1. - smoothstep(0., uPulseLen, ph)) * 2.2; }
  float fade = uFadeD > 0. ? exp(-vDepth / uFadeD) : 1.;
  if (uNearD > 0.) fade *= smoothstep(uNearD * .25, uNearD, vDepth);
  o = vec4(col * g * uI * (1. + pulse + head) * fade, 1.);
}`;
    const P = E.program(VS, FS, ["aP", "aN", "aV", "aS", "aA", "aId"]);
    return {
      draw(vp, u) {
        u = u || {};
        gl.enable(gl.DEPTH_TEST); gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
        P.use().m4("uVP", vp).f2("uRes", E.W, E.H).f1("uW", (u.width || 2) * E.scale)
          .v3("uCol", u.color || [.4, .7, 1.2]).v3("uCol2", u.color2 || u.color || [.4, .7, 1.2]).f1("uIdMix", u.idMix || 0)
          .f1("uI", u.intensity == null ? 1 : u.intensity).f1("uT", u.t || 0).f1("uPulse", u.pulse || 0).f1("uPulseLen", u.pulseLen || .08)
          .f1("uReveal", u.reveal == null ? 1 : u.reveal).f1("uFadeD", u.fadeD || 0).f1("uNearD", u.nearD || 0);
        if (drape) { E.bindTex(0, opts.draped.tex); P.i1("uH", 0).f2("uSize", opts.draped.sizeX, opts.draped.sizeZ).f1("uRange", opts.draped.range).f1("uEx", opts.draped.exag).f1("uLiftM", u.lift == null ? opts.lift : u.lift); }
        gl.bindVertexArray(vao); gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_INT, 0); gl.bindVertexArray(null);
        gl.depthMask(true); gl.disable(gl.BLEND);
      }
    };
  };

  /* ---------------------------------------------------------- sprites */
  /* Additive glowing points. pts: Float32Array xyz, col: Float32Array rgb (optional), size: per point px (optional) */
  K.sprites = function (E, n) {
    const gl = E.gl;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
    const bp = gl.createBuffer(), bc = gl.createBuffer(), bs = gl.createBuffer();
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    [[bp, 3], [bc, 3], [bs, 1]].forEach(([b, s], i) => { gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, (i === 2 ? size : i === 1 ? col : pos).byteLength, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, s, gl.FLOAT, false, 0, 0); });
    gl.bindVertexArray(null);
    const P = E.program(`#version 300 es
precision highp float; in vec3 aP, aC; in float aS; uniform mat4 uVP; uniform float uScale, uMin, uMax; out vec3 vC; out float vK;
void main(){ vec4 c = uVP * vec4(aP, 1.); gl_Position = c; float s = aS * uScale / max(c.w, 1e-3); gl_PointSize = clamp(s, uMin, uMax); vC = aC * min(1., s / max(uMin, 1e-3)); vK = s; }`,
    `#version 300 es
precision highp float; in vec3 vC; in float vK; out vec4 o; uniform float uCore;
void main(){ vec2 d = gl_PointCoord - .5; float r = length(d) * 2.; if (r > 1.) discard;
  float g = exp(-r*r*4.) + uCore * exp(-r*r*40.); o = vec4(vC * g, 1.); }`, ["aP", "aC", "aS"]);
    return {
      n, pos, col, size, count: n,
      upload(k) {
        k = k == null ? n : k; this.count = k;
        gl.bindBuffer(gl.ARRAY_BUFFER, bp); gl.bufferSubData(gl.ARRAY_BUFFER, 0, pos.subarray(0, k * 3));
        gl.bindBuffer(gl.ARRAY_BUFFER, bc); gl.bufferSubData(gl.ARRAY_BUFFER, 0, col.subarray(0, k * 3));
        gl.bindBuffer(gl.ARRAY_BUFFER, bs); gl.bufferSubData(gl.ARRAY_BUFFER, 0, size.subarray(0, k));
      },
      /* size units: world metres projected (uScale = projection scale in px) */
      draw(vp, pxPerUnit, u) {
        u = u || {};
        gl.enable(gl.DEPTH_TEST); gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
        P.use().m4("uVP", vp).f1("uScale", pxPerUnit).f1("uMin", (u.min || 1.5) * E.scale).f1("uMax", (u.max || 90) * E.scale).f1("uCore", u.core == null ? 1 : u.core);
        gl.bindVertexArray(vao); gl.drawArrays(gl.POINTS, 0, this.count); gl.bindVertexArray(null);
        gl.depthMask(true); gl.disable(gl.BLEND);
      }
    };
  };
  /* pixels per world unit at distance 1 for a perspective camera */
  K.pxScale = (E, fovy) => E.H / (2 * Math.tan(fovy / 2));

  /* ---------------------------------------------------------- meshes */
  function Mesh() { this.p = []; this.n = []; this.k = []; this.i = []; }
  Mesh.prototype.v = function (x, y, z, nx, ny, nz, k) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.k.push(k); return this.p.length / 3 - 1; };
  /* ellipsoid centred at c, radii r, part id k; squash: flattens the bottom (cabin floor) */
  Mesh.prototype.ellipsoid = function (c, r, k, su, sv, pinch) {
    su = su || 28; sv = sv || 18; const b = this.p.length / 3;
    for (let j = 0; j <= sv; j++) {
      const th = j / sv * Math.PI, st = Math.sin(th), ct = Math.cos(th);
      for (let i = 0; i <= su; i++) {
        const ph = i / su * Math.PI * 2, sp = Math.sin(ph), cp = Math.cos(ph);
        let x = st * cp, y = ct, z = st * sp;
        /* pinch: taper toward +x (tail side) like a teardrop */
        const tp = pinch ? 1 - pinch * Math.max(0, x) : 1;
        this.v(c[0] + x * r[0], c[1] + y * r[1] * tp, c[2] + z * r[2] * tp, x / r[0], y / r[1], z / r[2], k);
      }
    }
    for (let j = 0; j < sv; j++) for (let i = 0; i < su; i++) { const a = b + j * (su + 1) + i, d = a + su + 1; this.i.push(a, d, a + 1, a + 1, d, d + 1); }
    return this;
  };
  /* tube from p0 to p1, radius r0 -> r1 */
  Mesh.prototype.tube = function (p0, p1, r0, r1, k, seg) {
    seg = seg || 12; const b = this.p.length / 3;
    const ax = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], L = Math.hypot(...ax); const a = ax.map(x => x / L);
    const up = Math.abs(a[1]) < .9 ? [0, 1, 0] : [1, 0, 0];
    let u = [a[1] * up[2] - a[2] * up[1], a[2] * up[0] - a[0] * up[2], a[0] * up[1] - a[1] * up[0]]; const ul = Math.hypot(...u); u = u.map(x => x / ul);
    const w = [a[1] * u[2] - a[2] * u[1], a[2] * u[0] - a[0] * u[2], a[0] * u[1] - a[1] * u[0]];
    for (let e = 0; e < 2; e++) {
      const P = e ? p1 : p0, r = e ? r1 : r0;
      for (let i = 0; i <= seg; i++) {
        const t = i / seg * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
        const nx = u[0] * c + w[0] * s, ny = u[1] * c + w[1] * s, nz = u[2] * c + w[2] * s;
        this.v(P[0] + nx * r, P[1] + ny * r, P[2] + nz * r, nx, ny, nz, k);
      }
    }
    for (let i = 0; i < seg; i++) { const a0 = b + i, a1 = b + seg + 1 + i; this.i.push(a0, a1, a0 + 1, a0 + 1, a1, a1 + 1); }
    return this;
  };
  /* box centred at c with half extents h */
  Mesh.prototype.box = function (c, h, k) {
    const F = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    F.forEach(n => {
      const b = this.p.length / 3;
      const u = n[0] ? [0, 1, 0] : [1, 0, 0], w = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, bb]) => this.v(c[0] + (n[0] + u[0] * a + w[0] * bb) * h[0], c[1] + (n[1] + u[1] * a + w[1] * bb) * h[1], c[2] + (n[2] + u[2] * a + w[2] * bb) * h[2], n[0], n[1], n[2], k));
      this.i.push(b, b + 1, b + 2, b, b + 2, b + 3);
    });
    return this;
  };
  Mesh.prototype.build = function (E) {
    const gl = E.gl, idx = new Uint32Array(this.i);
    const vao = K.vao(E, [[new Float32Array(this.p), 3], [new Float32Array(this.n), 3], [new Float32Array(this.k), 1]], idx);
    return { vao, count: idx.length, draw() { gl.bindVertexArray(vao); gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_INT, 0); gl.bindVertexArray(null); } };
  };
  K.Mesh = Mesh;

  /* Stylized two-seat training helicopter (illustration, not a specific
     airframe). Model space: forward -Z, up +Y, right +X, metres; skids
     rest at y = 0, main rotor hub at ROTOR_Y. Parts: 0 cabin glass,
     1 frame, 2 skids, 3 tail boom + fin, 4 mast. */
  function heliMesh() {
    const m = new Mesh();
    m.ellipsoid([0, 1.45, -.35], [.78, .82, 1.25], 0, 32, 20);          /* bubble cabin */
    m.ellipsoid([0, 1.35, .75], [.62, .66, .95], 1, 24, 14, .3);         /* engine / frame behind the cabin */
    m.tube([0, 1.55, 1.3], [0, 1.72, 5.3], .2, .09, 3, 12);              /* tail boom */
    m.box([0, 2.15, 5.35], [.035, .6, .32], 3);                           /* vertical fin */
    m.box([0, 1.72, 5.05], [.42, .025, .14], 3);                          /* horizontal stabiliser */
    m.tube([0, 2.1, .15], [0, 2.7, .15], .075, .06, 4, 10);              /* mast */
    m.box([0, 2.02, .15], [.3, .1, .45], 1);                              /* mast fairing */
    [-1, 1].forEach(s => {
      m.tube([s * .85, .05, -1.7], [s * .85, .05, 1.55], .045, .045, 2, 8);   /* skid rails */
      m.tube([s * .85, .05, -1.7], [s * .85, .28, -2.02], .045, .035, 2, 8);  /* upturned tips */
      m.tube([s * .85, .05, -.75], [s * .32, .85, -.55], .035, .035, 2, 6);   /* struts */
      m.tube([s * .85, .05, .75], [s * .32, .85, .55], .035, .035, 2, 6);
    });
    return m;
  }
  /* Stylized low-wing trainer (illustration). forward -Z, metres, wheels at y = 0 */
  function planeMesh() {
    const m = new Mesh();
    m.ellipsoid([0, 1.45, -.2], [.62, .66, 3.4], 1, 28, 14, .55);          /* fuselage */
    m.ellipsoid([0, 1.92, -.9], [.48, .38, 1.0], 0, 20, 12);              /* canopy */
    m.box([0, 1.08, -.55], [4.8, .07, .72], 3);                           /* wings */
    m.box([0, 1.6, 3.35], [1.55, .04, .38], 3);                           /* stabiliser */
    m.box([0, 2.25, 3.45], [.04, .75, .42], 3);                           /* fin */
    m.tube([0, 1.45, -3.5], [0, 1.45, -3.75], .12, .05, 4, 10);          /* spinner */
    [-1, 1].forEach(s => m.tube([s * 1.1, 1.0, -.6], [s * 1.2, .2, -.55], .04, .04, 2, 6));
    m.tube([0, 1.0, -2.6], [0, .2, -2.65], .04, .04, 2, 6);
    return m;
  }

  K.ROTOR_Y = 2.72;
  /* aircraft renderer: glass/metal hologram finish with fresnel rim, warm key
     light from the sun, cabin glow, rotor discs and nav lights */
  K.aircraft = function (E) {
    const gl = E.gl;
    const heli = heliMesh().build(E), plane = planeMesh().build(E);
    const P = E.program(`#version 300 es
precision highp float;
in vec3 aP, aN; in float aK; uniform mat4 uVP, uM; out vec3 vW, vN; out float vK; out vec3 vL;
void main(){ vec4 w = uM * vec4(aP, 1.); vW = w.xyz; vN = normalize(mat3(uM) * aN); vK = aK; vL = aP; gl_Position = uVP * w; }`,
    `#version 300 es
precision highp float;
in vec3 vW, vN; in float vK; in vec3 vL; out vec4 o;
uniform vec3 uEye, uRim, uCabin; uniform float uCabinAmt, uAlpha, uFogD, uScan, uT;
${K.GLSL.atmos}
void main(){
  vec3 V = normalize(uEye - vW);
  vec3 n = normalize(vN); if (dot(n, V) < 0.) n = -n;
  float fr = pow(clamp(1. - dot(n, V), 0., 1.), 3.);
  float dif = max(dot(n, uSunDir), 0.);
  vec3 base = vK < .5 ? vec3(.02, .035, .06) : vK < 1.5 ? vec3(.05, .06, .075) : vK < 2.5 ? vec3(.09, .09, .1) : vec3(.06, .07, .085);
  vec3 c = base * (uZenith * 10. + uSunCol * dif * 1.1);
  vec3 H = normalize(uSunDir + V);
  c += uSunCol * pow(max(dot(n, H), 0.), vK < .5 ? 160. : 40.) * (vK < .5 ? 1.4 : .35);  /* glint */
  c += uRim * fr * (vK < .5 ? .9 : .55);
  if (vK < .5) c += uCabin * uCabinAmt * .28 * (1. - fr * .7);                             /* people inside: warm glow */
  /* scan lines drifting over the airframe (subtle hologram texture) */
  c += uRim * .12 * smoothstep(.92, 1., sin(vL.y * 26. - uT * 3.)) * uScan;
  float dist = length(uEye - vW);
  c = mix(c, fogCol(-V), 1. - exp(-dist / uFogD));
  o = vec4(c, 1.);
}`, ["aP", "aN", "aK"]);
    /* rotor disc: blurred blades + tip-path ring, drawn additively */
    const discVAO = (() => { const n = 64, p = [0, 0, 0], idx = []; for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2; p.push(Math.cos(a), 0, Math.sin(a)); } for (let i = 1; i <= n; i++) idx.push(0, i, i + 1); return { vao: K.vao(E, [[new Float32Array(p), 3]], new Uint32Array(idx)), count: idx.length }; })();
    const R = E.program(`#version 300 es
precision highp float; in vec3 aP; uniform mat4 uVP, uM; out vec2 vD;
void main(){ vD = aP.xz; gl_Position = uVP * uM * vec4(aP, 1.); }`,
    `#version 300 es
precision highp float; in vec2 vD; out vec4 o;
uniform float uSpin, uRate, uBlades, uI; uniform vec3 uCol, uTip;
void main(){
  float r = length(vD); if (r > 1.) discard;
  float a = atan(vD.y, vD.x);
  /* two blades; as rate rises the blades smear into a disc */
  float blade = 0.;
  float trail = mix(.05, 2.2, uRate);
  for (int k = 0; k < 2; k++) {
    float ph = mod(a - uSpin + float(k) * 3.14159265, 6.2831853);
    blade += exp(-ph / trail) * smoothstep(.1, .22, r);
  }
  blade = min(blade, 1.2);
  float disc = uRate * .10 * smoothstep(.15, .9, r);
  float tq = (r - .985) / .012; float tip = exp(-tq * tq) * (.15 + uRate * .55);   /* pow() of a negative base is undefined in GLSL */
  vec3 c = uCol * (blade * mix(.9, .25, uRate) + disc) + uTip * tip;
  o = vec4(c * uI, 1.);
}`, ["aP"]);
    const lights = K.sprites(E, 16);
    function drawRotor(vp, M, radius, spin, rate, col, tip, I) {
      gl.enable(gl.DEPTH_TEST); gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      R.use().m4("uVP", vp).m4("uM", M).f1("uSpin", spin).f1("uRate", rate).f1("uI", I == null ? 1 : I).v3("uCol", col).v3("uTip", tip);
      gl.bindVertexArray(discVAO.vao); gl.drawElements(gl.TRIANGLES, discVAO.count, gl.UNSIGNED_INT, 0); gl.bindVertexArray(null);
      gl.depthMask(true); gl.disable(gl.BLEND);
    }
    function mat(M, x, y, z) { return [M[0] * x + M[4] * y + M[8] * z + M[12], M[1] * x + M[5] * y + M[9] * z + M[13], M[2] * x + M[6] * y + M[10] * z + M[14]]; }
    return {
      heli, plane,
      /* o: {M (model matrix), kind:'heli'|'plane', spin, rate (0..1 rotor), cabin (0..1), rim, t, fog, lights (0..1), strobe} */
      draw(A, vp, eye, o) {
        const M = o.M;
        gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
        P.use().m4("uVP", vp).m4("uM", M).v3("uEye", eye).v3("uRim", o.rim || [.35, .62, 1.1]).v3("uCabin", o.cabinCol || [1.3, .82, .38])
          .f1("uCabinAmt", o.cabin || 0).f1("uAlpha", 1).f1("uFogD", o.fog || 40000).f1("uScan", o.scan == null ? 1 : o.scan).f1("uT", o.t || 0);
        K.atmosUniforms(P, A);
        (o.kind === "plane" ? plane : heli).draw();
        const rate = o.rate == null ? 1 : o.rate, spin = o.spin || 0;
        const rim = o.rim || [.35, .62, 1.1];
        if (o.kind === "plane") {
          const PM = E.M.mul(M, E.M.trs(0, 1.45, -3.8, 0, Math.PI / 2, 0, 1.0));
          drawRotor(vp, PM, 1, spin * 1.7, rate, [rim[0] * .5, rim[1] * .5, rim[2] * .5], rim, .8);
        } else {
          const RM = E.M.mul(M, E.M.trs(0, K.ROTOR_Y, .15, 0, 0, 0, 3.85));
          drawRotor(vp, RM, 1, spin, rate, [rim[0] * .55, rim[1] * .55, rim[2] * .55], [rim[0] * 1.3, rim[1] * 1.3, rim[2] * 1.3], o.rotorI);
          const TM = E.M.mul(M, E.M.trs(.12, 2.15, 5.35, 0, 0, Math.PI / 2, .55));
          drawRotor(vp, TM, 1, spin * 5.2, rate, [rim[0] * .4, rim[1] * .4, rim[2] * .4], rim, .7);
        }
        /* navigation lights: red left, green right, white tail; strobing beacon */
        const L = o.lights == null ? 1 : o.lights;
        if (L > .01) {
          const pts = o.kind === "plane"
            ? [[-4.8, 1.08, -.4, 1.6, .05, .04], [4.8, 1.08, -.4, .05, 1.4, .3], [0, 1.6, 3.7, 1.2, 1.15, 1.05], [0, 3.0, 3.45, 1.8, .06, .05]]
            : [[-.62, 1.2, -1.15, 1.6, .05, .04], [.62, 1.2, -1.15, .05, 1.4, .3], [0, 1.72, 5.45, 1.2, 1.15, 1.05], [0, 2.78, 5.3, 1.8, .06, .05]];
          const strobe = o.strobe == null ? (Math.sin((o.t || 0) * 7.5) > .82 ? 1 : .08) : o.strobe;
          pts.forEach((q, i) => {
            const w = mat(M, q[0], q[1], q[2]);
            lights.pos.set(w, i * 3);
            const k = (i === 3 ? strobe : 1) * L;
            lights.col.set([q[3] * k * 3, q[4] * k * 3, q[5] * k * 3], i * 3);
            lights.size[i] = o.lightSize || 1.1;
          });
          lights.upload(pts.length);
          lights.draw(vp, o.pxScale || 800, { min: 2.2 });
        }
      },
      /* world position of a point in model space */
      at: mat
    };
  };
})();
