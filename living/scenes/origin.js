/* =====================================================================
   ORIGIN — about.html (pinned scroll film)
   "A tight-knit school, not a pilot factory." A golden-hour flight over
   the real Oasis / Mountain Home high desert, one beat per section of
   the page, ending in a match-cut into a real Alpine Aviation photo.
     0  header        a helicopter crosses the plain in the golden hour
     1  Who we are    high over Oasis: a gold beacon, and the true
                      directions to the other two fields (Grass Valley,
                      California; Lewiston, Idaho) leaving the map
     2  How we teach  helicopter and fixed-wing, side by side
     3  Different     pull back: the two trails braided, tight-knit
     4  We come to you  a schematic helicopter trailer carries the
                      aircraft to a gold pin ("your location")
     5  match-cut     the helicopter lifts off the trailer, sets down
                      facing you, and the frame opens into a REAL photo
                      (images/IMG_0603-scaled.jpeg — the site's own alt
                      text: "Alpine Aviation campus buildings with
                      helicopters parked outside"), drawn after the post
                      chain so its colours are untouched.

   REAL: terrain = USGS 3DEP (living/data/mhome.*), heights x1.6; Oasis
   point from mhome.json; field directions are true initial bearings
   from Oasis to the field points in living/data/region.json.
   ILLUSTRATIVE: both aircraft, the trailer and truck (schematic), the
   route, the pin. Words on screen are the page's own.
   ===================================================================== */
(function () {
  "use strict";
  const NS = window.Living = window.Living || { scenes: {} };
  const K = window.LivingKit;
  const EXAG = 1.6;
  const PHOTO = "images/IMG_0603-scaled.jpeg";
  /* the centre helicopter's glass bubble in that photo, as fractions of the image (measured by
     eye from the 1920x1440 file): centre x, centre y, width. The cut matches our bubble to it. */
  const PH_X = .4896, PH_Y = .628, PH_BW = .107;
  const BUB_W = 1.56, BUB_Y = 1.45, BUB_Z = -.35;   /* kit heli: cabin ellipsoid, metres */

  let H, T, SKY, AC, SP, TRAIL, PTRAIL, RAYS, BEACON, ROUTE, PIN, RIG, PHO, photoTex, photoImg;
  let O, Y0, R0, RD, TF, TR, LZ, ARC, fields = [];
  const arcAt = (A, f) => { const N = A.length - 1, x = clamp(f, 0, 1) * N, i = Math.min(N - 1, x | 0); return A[i] + (A[i + 1] - A[i]) * (x - i); };
  const lab = {};
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

  /* ------------------------------------------------------------ geometry helpers */
  const W2 = (u, v) => [(u - .5) * H.sizeX, (v - .5) * H.sizeZ];
  const gnd = (x, z) => T.hMesh(x, z);
  const yawOf = d => Math.atan2(-d[0], -d[1]);
  const norm2 = (x, z) => { const l = Math.hypot(x, z) || 1; return [x / l, z / l]; };
  const right2 = f => [-f[1], f[0]];

  /* flight: north-north-east across the plain, over Oasis, toward the foothills, the low
     north-west sun at its side (golden-hour side light: lit ridges, long shadows, no glare) */
  const PATH = [{ p: 0, v: [.285, .52] }, { p: .17, v: [.305, .405] }, { p: .33, v: [.327, .325] }, { p: .5, v: [.345, .25] }, { p: .69, v: [.36, .18] }];
  let ENV = null;
  function pathXZ(E, p) { const uv = E.spline(PATH, clamp(p, 0, .69)); return W2(uv[0], uv[1]); }
  /* ground under the route, as a smooth envelope, so the flight clears the rising ground calmly */
  function buildEnv(E) {
    const N = 240, g = [];
    for (let i = 0; i <= N; i++) { const [x, z] = pathXZ(E, .69 * i / N); g.push(gnd(x, z)); }
    const mx = g.map((_, i) => { let m = -1e9; for (let k = -10; k <= 10; k++) m = Math.max(m, g[clamp(i + k, 0, N)]); return m; });
    ENV = mx.map((_, i) => { let s0 = 0, w = 0; for (let k = -14; k <= 14; k++) { const ww = 15 - Math.abs(k); s0 += mx[clamp(i + k, 0, N)] * ww; w += ww; } return s0 / w; });
  }
  function envAt(p) { const N = ENV.length - 1, f = clamp(p / .69, 0, 1) * N, i = Math.min(N - 1, f | 0), t = f - i; return ENV[i] + (ENV[i + 1] - ENV[i]) * t; }
  function basePath(E, p) {
    const [x, z] = pathXZ(E, p);
    return [x, envAt(p) + 330 + Math.sin(p * 37) * 5, z];
  }
  function flightDir(E, p) {
    const a = basePath(E, Math.max(0, p - .004)), b = basePath(E, Math.min(.69, p + .004));
    return norm2(b[0] - a[0], b[2] - a[2]);
  }
  const WEAVE = (E, p) => { const bw = E.ease.smooth((p - .5) / .06), ph = (p - .5) * 420; return { bw, s: Math.sin(ph), c: Math.cos(ph) }; };
  function flightAt(E, p) {
    const b = basePath(E, p), w = WEAVE(E, p), r = right2(flightDir(E, p));
    const lat = -w.bw * 20 * w.s, up = w.bw * 8 * w.c;
    return [b[0] + r[0] * lat, b[1] + up, b[2] + r[1] * lat];
  }
  /* the fixed-wing joins from behind on the right, then the two weave: a braid */
  function planeAt(E, p) {
    const e = E.ease, h = basePath(E, p), f = flightDir(E, p), r = right2(f), w = WEAVE(E, p);
    const join = e.smooth((p - .345) / .085);
    const back = e.mix(520, -4, join), lat = e.mix(170, 34, join) - w.bw * 16 + w.bw * 20 * w.s, up = e.mix(-50, 4, join) - w.bw * 8 * w.c;
    return [h[0] - f[0] * back + r[0] * lat, h[1] + up, h[2] - f[1] * back + r[1] * lat];
  }
  /* the trailer: a short schematic route across the plain to the pin */
  function trailerAt(E, p) {
    const k = E.ease.inOut(clamp((p - .69) / (.845 - .69), 0, 1));
    const x = R0[0] + (RD[0] - R0[0]) * k, z = R0[1] + (RD[1] - R0[1]) * k;
    return [x, gnd(x, z), z];
  }
  /* the helicopter: flying, then riding the trailer, then lifting off and setting down facing you */
  function heliState(E, p) {
    const e = E.ease;
    if (p < .69) { const f = flightDir(E, p); return { pos: flightAt(E, p), yaw: yawOf(f), pitch: -.08, roll: 0, rate: 1, fly: 1 }; }
    const tp = trailerAt(E, p);
    const deck = [tp[0] + TF[0] * -.5, tp[1] + .9, tp[2] + TF[1] * -.5];
    const lift = e.smooth((p - .852) / .012) * (1 - e.smooth((p - .872) / .012));
    const slide = e.smooth((p - .857) / .018);
    const land = [LZ[0], gnd(LZ[0], LZ[2]), LZ[2]];
    const pos = [e.mix(deck[0], land[0], slide), e.mix(deck[1], land[1], slide) + lift * 5.5, e.mix(deck[2], land[2], slide)];
    const rate = e.smooth((p - .838) / .014) * (1 - e.smooth((p - .876) / .02));
    const roll = Math.sin(slide * Math.PI) * .1;
    const turn = e.inOut((p - .855) / .02);
    return { pos, yaw: yawOf(TF) + Math.PI * turn, pitch: -.03 * lift, roll, rate, fly: lift > .02 ? 1 : 0 };
  }

  /* ------------------------------------------------------------ the photo */
  /* photo placement for the current screen: cover, a touch larger, heli centred horizontally */
  function photoFit(E, zoom) {
    const pw = photoImg.naturalWidth, ph = photoImg.naturalHeight, Wc = E.cssW, Hc = E.cssH;
    const s = Math.max(Wc / pw, Hc / ph) * zoom, dw = pw * s, dh = ph * s;
    const ox = clamp(Wc / 2 - PH_X * dw, Wc - dw, 0), oy = (Hc - dh) / 2;
    return { dw, dh, ox, oy, hx: ox + PH_X * dw, hy: oy + PH_Y * dh, bw: PH_BW * dw };
  }
  function photoProgram(E) {
    return E.program(E.QV, `#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D uP; uniform vec2 uRes, uOff, uSize, uC; uniform float uR, uA, uAsp;
void main(){
  vec2 px = vec2(vUv.x, 1. - vUv.y) * uRes;                /* css px, y down */
  vec2 q = (px - uOff) / uSize;                            /* photo uv, y down */
  vec3 c = texture(uP, q).rgb;                               /* texture row 0 = top of the image */
  /* iris opening from the helicopter; a thin cream edge is the cut */
  vec2 d = (px - uC) / uRes.y; float r = length(d);
  float m = 1. - smoothstep(uR - .06, uR, r);
  float er = (r - uR + .025) / .007;                         /* squared by hand: pow() of a negative base is undefined */
  float edge = exp(-er * er) * step(.001, uR) * (1. - smoothstep(.9, 1.3, uR));
  /* a soft shade low-left so the words stay legible over a bright sky */
  float shade = mix(1., .62, (1. - smoothstep(.0, .55, vUv.y)) * (1. - smoothstep(.2, .9, vUv.x)));
  o = vec4(c * shade + vec3(1., .9, .72) * edge * .7, clamp(m * uA + edge * .8 * uA, 0., 1.));
}`);
  }

  /* ------------------------------------------------------------ schematic trailer */
  function boxEdges(out, x0, x1, y0, y1, z0, z1) {
    const P = (a, b, c) => [a ? x1 : x0, b ? y1 : y0, c ? z1 : z0];
    [[0, 0, 0, 1, 0, 0], [0, 1, 0, 1, 1, 0], [0, 0, 1, 1, 0, 1], [0, 1, 1, 1, 1, 1], [0, 0, 0, 0, 1, 0], [1, 0, 0, 1, 1, 0], [0, 0, 1, 0, 1, 1], [1, 0, 1, 1, 1, 1], [0, 0, 0, 0, 0, 1], [1, 0, 0, 1, 0, 1], [0, 1, 0, 0, 1, 1], [1, 1, 0, 1, 1, 1]]
      .forEach(q => out.push([P(q[0], q[1], q[2]), P(q[3], q[4], q[5])]));
  }
  function wheel(out, x, z, r) { const c = []; for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI * 2; c.push([x, r + Math.sin(a) * r, z + Math.cos(a) * r]); } out.push(c); }
  function rigLines() {
    const L = [];
    /* tow vehicle (generic outline) */
    boxEdges(L, -1, 1, .55, 1.95, -10.3, -8.0);
    boxEdges(L, -1, 1, .55, 1.2, -11.7, -10.3);
    boxEdges(L, -1, 1, .55, 1.15, -8.0, -6.3);
    [-1.02, 1.02].forEach(x => { wheel(L, x, -10.7, .42); wheel(L, x, -7.1, .42); });
    /* trailer: drawbar, flat deck, two axles, corner posts */
    L.push([[0, .72, -6.3], [0, .78, -4.8]]);
    boxEdges(L, -1.3, 1.3, .72, .9, -4.8, 5.2);
    [-1.33, 1.33].forEach(x => { wheel(L, x, 2.4, .38); wheel(L, x, 3.45, .38); });
    [[-1.3, -4.8], [1.3, -4.8], [-1.3, 5.2], [1.3, 5.2]].forEach(([x, z]) => L.push([[x, .9, z], [x, 1.35, z]]));
    return L;
  }

  /* ------------------------------------------------------------ bearings */
  function bearing(lat1, lon1, lat2, lon2) {
    const r = Math.PI / 180, p1 = lat1 * r, p2 = lat2 * r, dl = (lon2 - lon1) * r;
    return Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl));
  }

  let E0, capEl, beatWho;
  NS.scenes.origin = {
    still: .085,
    async init(E) {
      E0 = E;
      const [hf, region, img] = await Promise.all([
        K.heightfield(E, "living/data/mhome.png", "living/data/mhome.json", EXAG),
        E.loadJSON("living/data/region.json"),
        E.loadImage(PHOTO)
      ]);
      H = hf; photoImg = img;
      photoTex = E.texture(img, { mip: true });
      T = K.terrain(E, H, { contour: 300, major: 900 });
      SKY = K.sky(E);
      AC = K.aircraft(E);
      PHO = photoProgram(E);
      SP = K.sprites(E, 24);
      capEl = E.root.querySelector(".og-cap");
      beatWho = E.root.querySelectorAll(".lp-beat")[1];

      const oz = H.meta.points.find(q => /oasis/i.test(q.name));
      const [ox, ozz] = W2(oz.uv[0], oz.uv[1]);
      O = [ox, gnd(ox, ozz), ozz];
      Y0 = O[1];
      buildEnv(E);

      /* true directions from Oasis to the other two fields named on the page */
      const want = [["Grass Valley", "Grass Valley, California"], ["Lewiston", "Lewiston, Idaho"]];
      const rays = [];
      want.forEach(([key, text]) => {
        const f = region.points.find(q => q.name.indexOf(key) === 0); if (!f) return;
        const b = bearing(oz.lat, oz.lon, f.lat, f.lon);            /* 0 = north, clockwise */
        const east = Math.sin(b), north = Math.cos(b);
        const pts = [];
        for (let i = 0; i <= 90; i++) {
          const d = i * 330, u = oz.uv[0] + east * d / H.sizeX, v = oz.uv[1] - north * d / H.sizeZ;
          if (u < .004 || u > .996 || v < .004 || v > .996) break;
          pts.push([u, v]);
        }
        rays.push({ pts, id: rays.length });
        const d = 2500, lu = oz.uv[0] + east * d / H.sizeX, lv = oz.uv[1] - north * d / H.sizeZ;
        fields.push({ text, el: E.label("<span>" + text + "</span>"), w: H.world(lu, lv, 180), deg: Math.round((b * 180 / Math.PI + 360) % 360) });
      });
      RAYS = K.ribbons(E, rays, { draped: H, lift: 40 });

      /* beacon at Oasis: a gold pillar and a ground ring */
      const ring = []; for (let i = 0; i <= 96; i++) { const a = i / 96 * Math.PI * 2; ring.push(H.uvOf(O[0] + Math.cos(a) * 700, O[2] + Math.sin(a) * 700)); }
      BEACON = { ring: K.ribbons(E, [ring], { draped: H, lift: 30 }), pillar: K.ribbons(E, [[[O[0], O[1], O[2]], [O[0], O[1] + 900, O[2]], [O[0], O[1] + 2200, O[2]]]]) };

      /* flight trails */
      const tp = [], pp = [];
      for (let i = 0; i <= 1100; i++) tp.push(flightAt(E, .69 * i / 1100));
      for (let i = 0; i <= 700; i++) pp.push(planeAt(E, .345 + (.69 - .345) * i / 700));
      TRAIL = K.ribbons(E, [tp]); PTRAIL = K.ribbons(E, [pp]);
      /* ribbons reveal by arc length: keep a lookup from scroll progress to arc length */
      const arc = pts => { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2])); return c.map(v => v / c[c.length - 1]); };
      ARC = { heli: arc(tp), plane: arc(pp) };

      /* the trailer's route and the pin, on the plain south-west of Oasis, heading north-east */
      R0 = W2(.262, .452); RD = W2(.2705, .4435);
      TF = norm2(RD[0] - R0[0], RD[1] - R0[1]); TR = right2(TF);
      LZ = [RD[0] + TR[0] * 17 + TF[0] * 4, 0, RD[1] + TR[1] * 17 + TF[1] * 4];
      const route = []; for (let i = 0; i <= 60; i++) { const k = i / 60; route.push(H.uvOf(R0[0] + (RD[0] - R0[0]) * (k * 1.03 - .05), R0[1] + (RD[1] - R0[1]) * (k * 1.03 - .05))); }
      ROUTE = K.ribbons(E, [route], { draped: H, lift: .6 });
      const pin = [], pc = [RD[0] + TF[0] * 16, RD[1] + TF[1] * 16], py = gnd(pc[0], pc[1]);
      const pr = []; for (let i = 0; i <= 48; i++) { const a = i / 48 * Math.PI * 2; pr.push([pc[0] + Math.cos(a) * 7, py + .3, pc[1] + Math.sin(a) * 7]); }
      pin.push(pr, [[pc[0], py, pc[1]], [pc[0], py + 60, pc[1]]]);
      PIN = { lines: K.ribbons(E, pin), at: [pc[0], py, pc[1]] };
      RIG = K.ribbons(E, rigLines());

      lab.oasis = E.label("<span>Oasis, Idaho</span>", "gold");
      lab.heli = E.label("<span>Helicopter</span>");
      lab.plane = E.label("<span>Fixed-wing</span>");
      lab.rig = E.label("<span>Helicopter trailer · schematic</span>");
      lab.pin = E.label("<span>Your location</span>", "gold");
      NS.debug = { H, T, O, fields, heliState: p => heliState(E, p), planeAt: p => planeAt(E, p), trailerAt: p => trailerAt(E, p), LZ: () => LZ, photoFit: () => photoFit(E, 1.03), cam: () => NS.scenes.origin._cam };
    },

    frame(E, S) {
      const gl = E.gl, e = E.ease, p = S.p, t = S.t;
      /* golden hour at the start, deeper dusk by the trailer, then day in the photo */
      const dusk = e.smooth((p - .6) / .3);
      const A = K.atmos({ sunAz: Math.PI * .81, sunEl: e.mix(.07, .02, dusk), sun: [2.1, 1.0, .38].map(v => v * e.mix(1, .72, dusk)),
        zenith: [.011, .019, .052], horizon: [.46, .25, .115].map(v => v * e.mix(1, .8, dusk)) });

      const hs = heliState(E, p), hp = hs.pos;
      const f = p < .69 ? flightDir(E, p) : TF, r = right2(f);
      const pl = planeAt(E, Math.min(p, .69));
      const tp = trailerAt(E, p);

      /* ---------------- camera shots, blended in order ---------------- */
      const SMALL = E.SMALL, SH = SMALL ? 0 : -.24;
      const shot = (eye, tgt, sx, sy) => ({ eye, tgt, sx, sy });
      /* 0: chase, behind-left, flying into the sun */
      const c0 = shot([hp[0] - f[0] * 105 - r[0] * 30, hp[1] + 26, hp[2] - f[1] * 105 - r[1] * 30], [hp[0] + f[0] * 420, hp[1] - 70, hp[2] + f[1] * 420], SH, SMALL ? -.3 : 0);
      /* 1: high over Oasis, looking north (words on the right) */
      const c1 = shot([O[0] - 900, O[1] + 4300, O[2] + 4700], [O[0] + 350, O[1], O[2] - 900], SMALL ? 0 : .2, SMALL ? -.3 : 0);
      /* 2: close beside the pair */
      const mid = [(hp[0] + pl[0]) / 2, (hp[1] + pl[1]) / 2, (hp[2] + pl[2]) / 2];
      const c2 = shot([hp[0] - f[0] * 58 - r[0] * 34, hp[1] + 11, hp[2] - f[1] * 58 - r[1] * 34], [mid[0] + f[0] * 26, mid[1], mid[2] + f[1] * 26], SH, SMALL ? -.3 : 0);
      /* 3: ahead of the pair, looking back: the two trails braid away into the distance */
      const c3 = shot([hp[0] + f[0] * 330 + r[0] * 40, hp[1] + 190, hp[2] + f[1] * 330 + r[1] * 40], [hp[0] - f[0] * 260, hp[1] - 40, hp[2] - f[1] * 260], SH, SMALL ? -.32 : .06);
      /* 4: low beside the trailer */
      const c4 = shot([tp[0] - TF[0] * 15 - TR[0] * 10.5, tp[1] + 4.6, tp[2] - TF[1] * 15 - TR[1] * 10.5], [tp[0] + TF[0] * 5, tp[1] + 1.2, tp[2] + TF[1] * 5], SH, SMALL ? -.3 : 0);
      /* 5: front-on to the landed helicopter, framed to match the photo */
      const fov = E.aspect < 1 ? 1.22 : .9;
      const fit = photoFit(E, 1.03);
      const dist = BUB_W / ((fit.bw / E.cssW) * 2 * Math.tan(fov / 2) * E.aspect);
      const LY = gnd(LZ[0], LZ[2]);
      /* after the turn the helicopter faces back along the route (-TF), toward the camera */
      const BC = [LZ[0] - TF[0] * -BUB_Z, LY + BUB_Y, LZ[2] - TF[1] * -BUB_Z];
      const c5 = shot([BC[0] - TF[0] * dist, BC[1] + dist * .2, BC[2] - TF[1] * dist], BC, 0, 0);

      let cam = c0;
      const blend = (c, w) => { if (w <= 0) return; cam = { eye: cam.eye.map((v, i) => e.mix(v, c.eye[i], w)), tgt: cam.tgt.map((v, i) => e.mix(v, c.tgt[i], w)), sx: e.mix(cam.sx, c.sx, w), sy: e.mix(cam.sy, c.sy, w) }; };
      blend(c1, e.inOut((p - .12) / .06) * (1 - e.inOut((p - .308) / .052)));
      blend(c2, e.inOut((p - .308) / .052) * (1 - e.inOut((p - .505) / .06)));
      blend(c3, e.inOut((p - .505) / .05));
      /* behind -> ahead of the pair: arc up over them instead of flying through the rotor */
      const k23 = e.inOut((p - .505) / .05);
      if (k23 > 0 && k23 < 1) { const arc = Math.sin(k23 * Math.PI); cam = Object.assign({}, cam, { eye: [cam.eye[0] - r[0] * 40 * arc, cam.eye[1] + 120 * arc, cam.eye[2] - r[1] * 40 * arc] }); }
      blend(c4, e.smooth((p - .688) / .012));
      /* the swing to the front: orbit around the landing spot so the camera never passes through the rig */
      const k5 = e.inOut((p - .846) / .054);
      if (k5 > 0) {
        const L0 = [LZ[0], LY + 1.4, LZ[2]];
        const a0 = Math.atan2(cam.eye[2] - L0[2], cam.eye[0] - L0[0]), r0 = Math.hypot(cam.eye[0] - L0[0], cam.eye[2] - L0[2]);
        const a1 = Math.atan2(c5.eye[2] - L0[2], c5.eye[0] - L0[0]);
        let da = a1 - a0; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
        const a = a0 + da * k5, rr = e.mix(r0, dist, k5), yy = e.mix(cam.eye[1], c5.eye[1], k5) + Math.sin(k5 * Math.PI) * 6;
        cam = { eye: [L0[0] + Math.cos(a) * rr, yy, L0[2] + Math.sin(a) * rr], tgt: cam.tgt.map((v, i) => e.mix(v, c5.tgt[i], k5)), sx: e.mix(cam.sx, 0, k5), sy: e.mix(cam.sy, 0, k5) };
      }
      let eye = cam.eye.slice(), tgt = cam.tgt;
      const floor = gnd(eye[0], eye[2]) + (p > .69 ? 1.2 : 40);
      if (eye[1] < floor) eye[1] = floor;
      const still = e.smooth((p - .86) / .04);
      const drift = 1 - still;
      eye = [eye[0] + Math.sin(t * .31) * .25 * drift + S.px * .8 * drift, eye[1] + Math.sin(t * .23) * .15 * drift - S.py * .4 * drift, eye[2] + Math.cos(t * .27) * .25 * drift];

      const dCam = Math.hypot(eye[0] - tgt[0], eye[1] - tgt[1], eye[2] - tgt[2]);
      const near = clamp(dCam * .01, .25, 60);
      const proj = E.M.persp(fov, E.aspect, near, 95000);
      proj[8] = cam.sx; proj[9] = cam.sy;
      /* final framing: the bubble lands where the photo's bubble is */
      if (k5 > 0) {
        const want = 1 - 2 * (fit.hy / E.cssH);
        proj[9] = e.mix(cam.sy, -want, k5);
      }
      const view = E.M.look(eye, tgt, [0, 1, 0]);
      const vp = E.M.mul(proj, view);
      const pxs = K.pxScale(E, fov);

      /* dip through dark between the flight and the trailer */
      const dip = e.pulse(p, .668, .688, .69, .712);
      E.post.exposure = 1 - .94 * dip;
      E.post.warm = .15;

      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      SKY.draw(A, vp, eye, t, { stars: .12 + dusk * .5, cloud: .38 });
      const hi = e.pulse(p, .13, .17, .3, .34);
      T.draw(A, vp, eye, t, { fog: e.mix(16000, 40000, hi), glow: .12 + hi * .45, shadows: true });

      /* Oasis: beacon, and the true directions to the other two fields */
      const bk = e.smooth((p - .15) / .05) * (1 - e.smooth((p - .3) / .03) * .9) * (p < .69 ? 1 : 0);
      if (bk > .01) {
        BEACON.ring.draw(vp, { width: 2, color: [1.5, .92, .38], intensity: bk * (.8 + .2 * Math.sin(t * 2)) });
        BEACON.pillar.draw(vp, { width: 2.2, color: [1.6, 1.0, .42], intensity: bk * .7, t, pulse: .4, pulseLen: .1 });
      }
      const rk = e.pulse(p, .17, .21, .31, .345);
      if (rk > .01) RAYS.draw(vp, { width: 2.2, color: [.4, .72, 1.5], intensity: rk * .9, reveal: e.smooth((p - .17) / .07), t, pulse: .35, pulseLen: .06 });

      /* trails */
      if (p < .69) {
        const tk = (1 - dip) * e.smooth(p / .04) * (1 - .94 * e.pulse(p, .15, .19, .3, .34));
        const nd = 0;
        TRAIL.draw(vp, { nearD: nd, width: e.mix(2.2, 3, hi), color: [.36, .7, 1.6], intensity: .75 * tk, reveal: arcAt(ARC.heli, p / .69), t, pulse: .25, pulseLen: .05 });
        if (p > .35) PTRAIL.draw(vp, { nearD: nd, width: 2.2, color: [1.4, 1.3, 1.15], intensity: .7 * tk, reveal: arcAt(ARC.plane, (p - .345) / .345), t, pulse: .3, pulseLen: .05 });
      }

      /* trailer scene */
      const tk = e.smooth((p - .69) / .02);
      if (tk > .01) {
        ROUTE.draw(vp, { width: 2, color: [.4, .72, 1.5], intensity: tk * .8 * (1 - e.smooth((p - .9) / .03)), t, pulse: .5, pulseLen: .08, reveal: .05 + e.smooth((p - .69) / .08) * .95 });
        const pk = tk * (1 - e.smooth((p - .92) / .03));
        PIN.lines.draw(vp, { width: 2.2, color: [1.6, 1.0, .42], intensity: pk * (.85 + .15 * Math.sin(t * 2.4)), t, pulse: .6, pulseLen: .12 });
        const RM = E.M.trs(tp[0], tp[1], tp[2], yawOf(TF), 0, 0, 1);
        RIG.draw(E.M.mul(vp, RM), { width: 1.5, color: [.38, .7, 1.45], intensity: tk * .75 * (1 - e.smooth((p - .9) / .04) * .5), t, pulse: .4, pulseLen: .1 });
      }

      /* aircraft */
      const distH = Math.hypot(eye[0] - hp[0], eye[1] - hp[1], eye[2] - hp[2]);
      const sc = p < .69 ? Math.min(6, Math.max(1, distH / 260)) : 1;
      const spin = t * e.mix(3, 44, hs.rate) + p * 30;
      AC.draw(A, vp, eye, { M: E.M.trs(hp[0], hp[1], hp[2], hs.yaw, hs.pitch, hs.roll, sc), kind: "heli", spin, rate: hs.rate, cabin: p < .69 ? .9 : .35, t, fog: 60000, pxScale: pxs, lightSize: p < .69 ? 1.1 * Math.min(2.4, sc) : .22, lights: p < .69 ? 1 : hs.rate > .3 ? 1 : 0, rotorI: p > .69 ? .7 : 1 });
      if (p > .35 && p < .69) {
        const d2 = Math.hypot(eye[0] - pl[0], eye[1] - pl[1], eye[2] - pl[2]), s2 = Math.min(6, Math.max(1, d2 / 240));
        const f2 = norm2(planeAt(E, Math.min(.69, p + .003))[0] - planeAt(E, p - .003)[0], planeAt(E, Math.min(.69, p + .003))[2] - planeAt(E, p - .003)[2]);
        AC.draw(A, vp, eye, { M: E.M.trs(pl[0], pl[1], pl[2], yawOf(f2), .04, 0, s2), kind: "plane", spin: t * 60, rate: 1, cabin: .9, rim: [.9, .95, 1.1], t, fog: 60000, pxScale: pxs, lightSize: 1.2 * Math.min(2.4, s2) });
      }

      /* lights: aircraft seen from far away, the beacon base, the trailer's headlights, the pin */
      let k = 0;
      const put = (w, c, s) => { SP.pos.set(w, k * 3); SP.col.set(c, k * 3); SP.size[k] = s; k++; };
      const far = e.smooth((distH - 1500) / 2500);
      if (far > .01 && p < .69) { put(hp, [.9 * far, 1.6 * far, 3.2 * far], 26); if (p > .36) put(pl, [2.4 * far, 2.3 * far, 2.1 * far], 22); }
      if (bk > .01) { put([O[0], O[1] + 20, O[2]], [2.6 * bk, 1.6 * bk, .6 * bk], 90); }
      if (tk > .01) {
        const hl = E.M.trs(tp[0], tp[1], tp[2], yawOf(TF), 0, 0, 1);
        [[-.75, .95, -11.75], [.75, .95, -11.75]].forEach(q => put(AC.at(hl, q[0], q[1], q[2]), [2.2 * tk, 2.0 * tk, 1.6 * tk], .5));
        [[-1.0, .9, -6.2], [1.0, .9, -6.2], [-1.3, .9, 5.25], [1.3, .9, 5.25]].forEach(q => put(AC.at(hl, q[0], q[1], q[2]), [2.2 * tk, .15 * tk, .1 * tk], .22));
        put([PIN.at[0], PIN.at[1] + .6, PIN.at[2]], [2.4 * tk, 1.5 * tk, .6 * tk], 5);
      }
      SP.upload(k);
      if (k) SP.draw(vp, pxs, { min: 2, max: 60, core: 1.2 });

      /* labels */
      E.place(lab.oasis, vp, [O[0], O[1] + (SMALL ? 1250 : 2350), O[2]], e.pulse(p, .19, .23, .3, .33));
      const fo = e.pulse(p, .215, .25, .3, .33);
      const wordsTop = SMALL && beatWho ? beatWho.getBoundingClientRect().top - E.pin.getBoundingClientRect().top - 24 : 1e9;
      fields.forEach(F => { const q = E.M.project(vp, F.w[0], F.w[1], F.w[2]); E.place(F.el, vp, F.w, q.y > wordsTop ? 0 : fo, { clamp: true }); });
      E.place(lab.heli, vp, [hp[0], hp[1] + 4.2 * sc, hp[2]], e.pulse(p, .39, .42, .48, .51), { clamp: true });
      E.place(lab.plane, vp, [pl[0], pl[1] + 4.6 * Math.min(6, Math.max(1, Math.hypot(eye[0] - pl[0], eye[1] - pl[1], eye[2] - pl[2]) / 240)), pl[2]], e.pulse(p, .4, .43, .48, .51), { clamp: true });
      E.place(lab.rig, vp, [tp[0], tp[1] + 3.8, tp[2]], e.pulse(p, .73, .76, .82, .845));
      E.place(lab.pin, vp, [PIN.at[0], PIN.at[1] + 62, PIN.at[2]], e.pulse(p, .75, .78, .84, .87));

      this._fit = fit; this._hs = hs; this._cam = { eye, tgt, dist, LY, LZ: LZ.slice(), hp: hp.slice(), k5, fov, sy: proj[9] };
    },

    /* the real photo, drawn after tone mapping so nothing recolours it */
    after(E, S) {
      const e = E.ease, p = S.p;
      const open = e.inOut((p - .905) / .05);
      if (capEl) capEl.classList.toggle("on", open > .6);
      E.root.classList.toggle("og-photo", open > .6);
      if (open <= .001) return;
      const gl = E.gl;
      const zoom = 1.03 + .035 * e.smooth((p - .95) / .05);
      const fit = photoFit(E, zoom), base = this._fit || fit;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      /* keep the helicopter point fixed while the photo slowly pushes in */
      const ox = base.hx - PH_X * fit.dw, oy = base.hy - PH_Y * fit.dh;
      const R = open * Math.hypot(E.aspect, 1) * .62;
      PHO.use().i1("uP", 0).f2("uRes", E.cssW, E.cssH).f2("uOff", Math.min(0, Math.max(E.cssW - fit.dw, ox)), Math.min(0, Math.max(E.cssH - fit.dh, oy)))
        .f2("uSize", fit.dw, fit.dh).f2("uC", base.hx, base.hy).f1("uR", open >= .999 ? 9 : R).f1("uA", 1).f1("uAsp", E.aspect);
      E.bindTex(0, photoTex);
      E.tri();
      gl.disable(gl.BLEND);
    }
  };
})();
