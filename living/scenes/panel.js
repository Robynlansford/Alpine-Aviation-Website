/* =====================================================================
   PANEL — intro-flight.html (live hero, no pin)
   "You fly a real Robinson R22 helicopter, from the pilot seat, with a
   working instructor beside you." The visitor sits in the pilot seat:
     - through a curved bubble canopy (frame posts, soft glass reflections)
       the high desert at golden hour
     - a stylized instrument cluster wakes up: bezels light, needles run
       their check, the dual tachometer's engine and rotor needles climb
       and JOIN as the rotor comes up to speed (the moment it works)
     - the rotor's shadow flickers over the glass while it spins up
     - lift-off into a gentle hover: the horizon breathes, the attitude
       indicator follows it, rotor wash lifts gold dust off the ground

   REAL: terrain = USGS 3DEP (living/data/mhome.*), heights x1.6.
   ILLUSTRATION: the cockpit and every instrument (not a real instrument
   panel, no real readings: dials carry ticks, never numbers).
   ===================================================================== */
(function () {
  "use strict";
  const NS = window.Living = window.Living || { scenes: {} };
  const K = window.LivingKit;
  const EXAG = 1.6;
  const Q = new URLSearchParams(location.search);
  const FIX = Q.has("ts") ? parseFloat(Q.get("ts")) : null;      /* test hook: ?ts=seconds freezes the start-up at that moment */

  let H, T, SKY, COCK, DUST, P0, FWD, tStart = null, LAB;

  const COCKPIT_FS = `#version 300 es
precision highp float; out vec4 o;
uniform vec2 uRes; uniform float uScale, uT;
uniform vec4 uCon;                 /* console: centre x, top y, half width, bottom y (css px) */
uniform vec4 uG[4];                /* gauges: centre x, y, radius, wake */
uniform vec4 uN;                   /* needle angles: airspeed, altimeter, engine, rotor (rad, clockwise from 12) */
uniform vec2 uAtt;                 /* roll, pitch (rad) */
uniform float uJoin, uSpin, uRate, uPanel, uDust;
uniform vec4 uPost;                /* centre post: top x, top y, bottom x, bottom y */
uniform float uDoor, uSmall;
const vec3 ICE = vec3(.42, .72, 1.5);
const vec3 CREAM = vec3(1.5, 1.38, 1.12);
const vec3 GOLD = vec3(1.65, 1.0, .36);
const float PI = 3.14159265;
float seg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); return length(pa - ba * h); }
float rbox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - r; }
vec2 dirA(float a){ return vec2(sin(a), -cos(a)); }
void paint(inout vec4 L, vec3 c, float al){ L.rgb = c * al + L.rgb * (1. - al); L.a = al + L.a * (1. - al); }
float line(float d, float w, float px){ return 1. - smoothstep(w, w + 1.4 * px, d); }
/* ticks on an arc from a0 to a1 (clockwise from 12), every 'step' rad, major every 'maj' ticks */
float ticks(vec2 q, float L, float a0, float a1, float st, float maj, float px){
  float a = atan(q.x, -q.y);
  if (a1 > PI && a < a0) a += 2. * PI;
  if (a < a0 - .02 || a > a1 + .02) return 0.;
  float c = (a - a0) / st, f = abs(fract(c + .5) - .5) * st * L;
  float isMaj = step(abs(mod(floor(c + .5), maj)), .5);
  float inner = mix(.8, .7, isMaj);
  float band = step(inner, L) * step(L, .92);
  return line(f, mix(.010, .018, isMaj), px) * band * mix(.55, 1., isMaj);
}
float needle(vec2 q, float a, float len, float w, float px){ return line(seg(q, -dirA(a) * .14, dirA(a) * len), w, px); }

void gauge(int k, vec2 p, inout vec4 L){
  vec2 c = uG[k].xy; float r = uG[k].z, w = uG[k].w;
  vec2 q = (p - c) / r; float Lq = length(q), px = 1. / r;
  if (Lq > 1.35) return;
  /* case, bezel light */
  paint(L, vec3(.008, .010, .016), 1. - smoothstep(1.13 - px, 1.13 + px, Lq));
  L.rgb += ICE * w * (exp(-(((Lq - 1.045) / .016)*((Lq - 1.045) / .016))) * .7 + exp(-(((Lq - 1.05) / .09)*((Lq - 1.05) / .09))) * .06);
  if (Lq > 1.) return;
  /* face, faintly backlit */
  vec3 face = vec3(.006, .009, .017) + ICE * .02 * w * (1. - Lq * .8);
  float fm = 1. - smoothstep(1. - px, 1. + px, Lq);
  float g = 0.; vec3 gc = vec3(0.);
  if (k == 2) {
    /* attitude: sky over ground, the horizon follows the aircraft */
    float cr = cos(uAtt.x), sr = sin(uAtt.x);
    vec2 qa = mat2(cr, sr, -sr, cr) * q;
    float h = uAtt.y * 2.6;
    vec3 sky = vec3(.030, .075, .18), gnd = vec3(.13, .07, .028);
    face = mix(face, (qa.y < h ? sky : gnd) * (.25 + .75 * w), w);
    paint(L, face, fm);
    L.rgb += CREAM * w * .95 * line(abs(qa.y - h), .011, px) * step(Lq, .97);
    for (int j = -2; j <= 2; j++) { if (j == 0) continue; float y = h + float(j) * .2; L.rgb += ICE * w * .45 * line(abs(qa.y - y), .007, px) * step(abs(qa.x), j == -2 || j == 2 ? .22 : .13); }
    /* bank scale on the case: marks at 0, 10, 20, 30, 60 degrees */
    float a = atan(q.x, -q.y);
    float bm = 0.;
    float marks[7] = float[7](-1.047, -.524, -.349, 0., .349, .524, 1.047);
    for (int j = 0; j < 7; j++) bm = max(bm, line(abs(a - marks[j]) * Lq, j == 3 ? .02 : .011, px) * step(.84, Lq) * step(Lq, .95));
    L.rgb += CREAM * w * .7 * bm;
    /* the little aircraft: you (gold), fixed to the case */
    float ac = min(min(seg(q, vec2(-.52, 0.), vec2(-.2, 0.)), seg(q, vec2(.2, 0.), vec2(.52, 0.))), min(seg(q, vec2(-.2, 0.), vec2(-.2, .08)), seg(q, vec2(.2, 0.), vec2(.2, .08))));
    L.rgb += GOLD * w * (line(ac, .022, px) * 1.1 + exp(-ac / .05) * .12);
    L.rgb += GOLD * w * (1. - smoothstep(.035, .035 + 1.4 * px, Lq));
    return;
  }
  paint(L, face, fm);
  if (k == 0) {
    /* dual tachometer: engine (ice) and rotor (cream) on one dial; operating band near the top */
    g = ticks(q, Lq, -2.36, 1.31, .2617, 3., px);
    L.rgb += CREAM * .5 * w * g;
    float a = atan(q.x, -q.y);
    float band = step(.93, Lq) * step(Lq, .985) * (1. - smoothstep(.0, .02, abs(a - 1.05) - .12));
    L.rgb += ICE * w * .55 * band;
    float en = needle(q, uN.z, .8, .02, px), ro = needle(q, uN.w, .72, .028, px);
    L.rgb += ICE * w * (en * 1.25 + exp(-seg(q, vec2(0.), dirA(uN.z) * .8) / .05) * .1);
    L.rgb += CREAM * w * (ro * 1.1 + exp(-seg(q, vec2(0.), dirA(uN.w) * .72) / .05) * .1);
    /* the needles join: a ring of light */
    L.rgb += CREAM * uJoin * (exp(-(((Lq - .98) / .045)*((Lq - .98) / .045))) * 1.25 + (1. - Lq) * .12);
  } else if (k == 1) {
    /* airspeed: at a hover it rests near the stop */
    g = ticks(q, Lq, -2.62, 2.62, .1745, 3., px);
    L.rgb += CREAM * .5 * w * g;
    L.rgb += CREAM * w * (needle(q, uN.x, .78, .02, px) * 1.2 + exp(-seg(q, vec2(0.), dirA(uN.x) * .78) / .05) * .1);
  } else {
    /* altimeter: a full dial, one hand */
    g = ticks(q, Lq, 0., 2. * PI - .01, .1257, 5., px);
    L.rgb += CREAM * .5 * w * g;
    L.rgb += CREAM * w * (needle(q, uN.y, .8, .02, px) * 1.2 + exp(-seg(q, vec2(0.), dirA(uN.y) * .8) / .05) * .1);
    L.rgb += ICE * w * .8 * needle(q, uN.y * .1, .5, .03, px);
  }
  /* hub */
  L.rgb += CREAM * w * .6 * (1. - smoothstep(.05, .05 + 1.4 * px, Lq));
  /* glass glint on the dial */
  float gl = exp(-((length((q - vec2(-.35, -.45)) * vec2(1., 2.2)) / .22)*(length((q - vec2(-.35, -.45)) * vec2(1., 2.2)) / .22)));
  L.rgb += vec3(.8, .9, 1.) * gl * .05 * (.3 + w);
}

void main(){
  vec2 R = uRes / uScale;
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uScale;
  vec4 L = vec4(0.);
  /* ---- glass: the rotor's shadow sweeping while it spins up, a faint sheen ---- */
  vec2 mast = vec2(R.x * (uSmall > .5 ? .5 : .62), -R.y * .6);
  vec2 dm = p - mast; float am = atan(dm.y, dm.x), rm = length(dm);
  float bl = 0.;
  for (int k = 0; k < 2; k++) { float d = abs(mod(am - uSpin - float(k) * PI + PI, 2. * PI) - PI) * rm; bl = max(bl, 1. - smoothstep(14., 46., d)); }
  paint(L, vec3(0.), bl * .30 * (1. - uRate) + .05 * uRate * (.6 + .4 * sin(uSpin * 2.)));
  /* reflections on the bubble: a broad warm arc from the low sun behind, a thin cool one near the top */
  vec2 bc = vec2(R.x * (uSmall > .5 ? .2 : .1), R.y * 1.25);
  float ra = length((p - bc) * vec2(1., 1.25));
  float arcW = exp(-(((ra - R.y * (uSmall > .5 ? .95 : 1.02)) / (R.y * .055))*((ra - R.y * (uSmall > .5 ? .95 : 1.02)) / (R.y * .055)))) * smoothstep(R.x * .15, R.x * .6, p.x);
  L.rgb += vec3(1., .82, .55) * .035 * arcW;
  float arcC = exp(-(((ra - R.y * (uSmall > .5 ? 1.18 : 1.2)) / (R.y * .012))*((ra - R.y * (uSmall > .5 ? 1.18 : 1.2)) / (R.y * .012)))) * smoothstep(R.x * .3, R.x * .85, p.x);
  L.rgb += vec3(.75, .88, 1.) * .03 * arcC;
  /* the instruments' glow reflected in the windshield above the console */
  for (int k = 0; k < 4; k++) {
    vec2 c = uG[k].xy; vec2 m = vec2(c.x, uCon.y - (c.y - uCon.y) * .5 - 26.);
    vec2 d = (p - m) / vec2(uG[k].z * 1.1, uG[k].z * .55);
    L.rgb += ICE * uG[k].w * .02 * exp(-dot(d, d));
  }
  /* ---- canopy frame ---- */
  /* top bow */
  float xc = (p.x / R.x - .5) * 2.;
  float top = p.y - (uSmall > .5 ? 10. : 14.) - 38. * xc * xc;
  paint(L, vec3(.006, .007, .011), 1. - smoothstep(-1., 1., top));
  L.rgb += ICE * .18 * exp(-((top / 1.6)*(top / 1.6))) * uPanel;
  /* centre post, curving down onto the console */
  if (uSmall < .5 && p.y > uPost.y - 2. && p.y < uPost.w + 30.) {
    float tt = clamp((p.y - uPost.y) / (uPost.w - uPost.y), 0., 1.);
    float x = mix(uPost.x, uPost.z, tt) - 26. * sin(PI * tt) * (uSmall > .5 ? .5 : 1.);
    float wd = mix(7., 13., tt) * (uSmall > .5 ? .8 : 1.);
    float d = abs(p.x - x) - wd;
    paint(L, vec3(.007, .008, .012), 1. - smoothstep(-.8, .8, d));
    L.rgb += GOLD * .30 * exp(-(((p.x - (x - wd)) / 1.4)*((p.x - (x - wd)) / 1.4))) * step(d, 3.) * uPanel;
    L.rgb += ICE * .22 * exp(-(((p.x - (x + wd)) / 1.4)*((p.x - (x + wd)) / 1.4))) * step(d, 3.) * uPanel;
  }
  /* door frame at the right */
  float yy = p.y / R.y;
  float dx = uDoor + 34. * ((max(1. - yy, 0.))*(max(1. - yy, 0.))) - 20. * yy;
  float dd = abs(p.x - dx) - (uSmall > .5 ? 7. : 11.);
  paint(L, vec3(.006, .007, .011), 1. - smoothstep(-.8, .8, dd));
  L.rgb += ICE * .16 * exp(-(((p.x - (dx - (uSmall > .5 ? 7. : 11.))) / 1.4)*((p.x - (dx - (uSmall > .5 ? 7. : 11.))) / 1.4))) * uPanel;
  paint(L, vec3(.006, .007, .011), smoothstep(dx - 1., dx + 1., p.x));
  /* ---- console ---- */
  /* a pedestal that widens toward the floor, under a curved hood */
  float fy = clamp((p.y - uCon.y) / (R.y - uCon.y), 0., 1.);
  float hw = uCon.z * (1. + .38 * fy);
  float hood = uCon.y - 10. * (1. - (((p.x - uCon.x) / (uCon.z * 1.06))*((p.x - uCon.x) / (uCon.z * 1.06))));
  float sd = max(abs(p.x - uCon.x) - hw, hood - p.y);
  float cm = 1. - smoothstep(-.8, .8, sd);
  vec3 cb = mix(vec3(.018, .021, .03), vec3(.006, .007, .011), smoothstep(0., .8, fy));
  paint(L, cb, cm);
  float topEdge = exp(-(((p.y - hood) / 1.2)*((p.y - hood) / 1.2))) * step(abs(p.x - uCon.x), hw);
  L.rgb += ICE * uPanel * topEdge * .55 * (1. - pow(abs(p.x - uCon.x) / hw, 4.));
  L.rgb += GOLD * uPanel * .18 * exp(-(((p.x - (uCon.x - hw)) / 1.3)*((p.x - (uCon.x - hw)) / 1.3))) * step(hood, p.y) * (1. - fy);
  /* a soft shadow the hood throws on the face */
  paint(L, vec3(0.), cm * .35 * exp(-(p.y - hood) / 18.) * step(hood, p.y));
  /* ---- the instruments ---- */
  for (int k = 0; k < 4; k++) gauge(k, p, L);
  /* sill below: the cockpit floor fades to dark */
  paint(L, vec3(.004, .005, .008), smoothstep(R.y * .9, R.y * 1.02, p.y) * .9);
  o = L;
}`;

  NS.scenes.panel = {
    still: .5,
    async init(E) {
      H = await K.heightfield(E, "living/data/mhome.png", "living/data/mhome.json", EXAG);
      T = K.terrain(E, H, { contour: 100, major: 500 });
      SKY = K.sky(E);
      COCK = E.program(E.QV, COCKPIT_FS);
      const u0 = .6, v0 = .478;
      const w0 = H.world(u0, v0), w1 = H.world(.74, .31);
      const d = Math.hypot(w1[0] - w0[0], w1[2] - w0[2]);
      FWD = [(w1[0] - w0[0]) / d, (w1[2] - w0[2]) / d];
      P0 = [w0[0], T.hMesh(w0[0], w0[2]), w0[2]];
      DUST = K.sprites(E, E.SMALL ? 110 : 220);
      LAB = E.label("<span>From the pilot seat</span>", "gold");
      E.post.threshold = .95; E.post.knee = .55; E.post.bloom = .95; E.post.exposure = 1.0;
      E.post.vignette = .6; E.post.saturation = 1.06; E.post.ca = .006; E.post.warm = .12;
      NS.debug = { P0, FWD, H, T };
    },

    frame(E, S) {
      const gl = E.gl, e = E.ease;
      const t = S.t;
      if (tStart == null) tStart = t;
      const tS = E.REDUCED ? 99 : FIX != null ? FIX : t - tStart;
      const tt = E.REDUCED ? 14 : FIX != null ? FIX + 8 : t;

      /* ---- the start-up ---- */
      const panel = e.smooth((tS - .7) / .9);
      const gw = [0, 1, 2, 3].map(k => e.smooth((tS - .9 - k * .22) / .6));
      const eng = e.inOut((tS - 1.9) / 1.9), rot = e.inOut((tS - 2.3) / 2.4);
      const rate = rot;
      const join = Math.exp(-Math.pow((tS - 4.75) / .4, 2)) * (E.REDUCED ? 0 : 1);
      const lift = e.smooth((tS - 5.4) / 3.2);
      const hov = e.smooth((tS - 6.5) / 3);
      /* self-test sweep on airspeed and altimeter */
      const sweep = e.pulse(tS, 1.5, 2.2, 2.4, 3.2);

      /* ---- the aircraft: on the ground, then a gentle hover ---- */
      const eyeH = 1.9 + 1.5 * lift + hov * (.18 * Math.sin(tt * .61) + .08 * Math.sin(tt * 1.37 + 1));
      const pitch = -.07 + .02 * lift + hov * (.012 * Math.sin(tt * .7) + .006 * Math.sin(tt * 1.9 + 2));
      const roll = hov * (.018 * Math.sin(tt * .53 + 1) + .008 * Math.sin(tt * 1.7));
      const yaw = hov * .025 * Math.sin(tt * .21) + .012 * Math.sin(tt * .13);
      const shake = rate * (1 - lift) * .0025 * Math.sin(tt * 23);
      const drift = hov * .5 * Math.sin(tt * .17);

      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      const f2 = [FWD[0] * cy - FWD[1] * sy, FWD[0] * sy + FWD[1] * cy];
      const rt = [-f2[1], f2[0]];
      const eye = [P0[0] + rt[0] * drift, P0[1] + eyeH, P0[2] + rt[1] * drift];
      const cp = Math.cos(pitch + shake), spp = Math.sin(pitch + shake);
      const fwd = [f2[0] * cp, spp, f2[1] * cp];
      const r3 = [-f2[1], 0, f2[0]];                              /* right */
      const u0 = [r3[1] * fwd[2] - r3[2] * fwd[1], r3[2] * fwd[0] - r3[0] * fwd[2], r3[0] * fwd[1] - r3[1] * fwd[0]];
      const cr = Math.cos(roll), sr = Math.sin(roll);
      const up = [u0[0] * cr + r3[0] * sr, u0[1] * cr + r3[1] * sr, u0[2] * cr + r3[2] * sr];
      const small = E.aspect < 1;
      const FOV = small ? 1.3 : 1.0;
      const proj = E.M.persp(FOV, E.aspect, .3, 90000);
      if (E.SMALL) proj[9] = -.1; else proj[8] = -.14;
      const view = E.M.look(eye, [eye[0] + fwd[0], eye[1] + fwd[1], eye[2] + fwd[2]], up);
      const vp = E.M.mul(proj, view);
      const pxs = K.pxScale(E, FOV);

      /* golden hour, the sun low behind the left shoulder */
      const A = K.atmos({ sunAz: Math.PI * 1.05, sunEl: .07, sun: [3.3, 1.6, .58], zenith: [.012, .02, .055], horizon: [.46, .26, .12] });
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      SKY.draw(A, vp, eye, tt, { stars: 0, cloud: .45 });
      T.draw(A, vp, eye, tt, { fog: 26000, glow: .2, shadows: true });

      /* rotor wash: gold dust blown out across the ground ahead */
      const dk = rate * (.35 + .65 * lift) * (E.REDUCED ? .8 : 1);
      if (dk > .02) {
        const Rn = E.rng(9); let n = 0;
        for (let i = 0; i < DUST.n; i++) {
          const a = Math.atan2(FWD[1], FWD[0]) - .25 + Rn() * 1.35, sp = 2.5 + Rn() * 5, life = 1.5 + Rn() * 1.6, ph = (tt * .9 + Rn() * life) % life, age = ph / life;
          const r = 4 + sp * ph * (1 - age * .3);
          const x = P0[0] + Math.cos(a) * r, z = P0[2] + Math.sin(a) * r;
          DUST.pos.set([x, T.hMesh(x, z) + .1 + age * age * 1.2 + Rn() * .25, z], n * 3);
          const b = (1 - age) * (1 - age) * dk * (.3 + Rn() * .4);
          DUST.col.set([1.2 * b, .72 * b, .32 * b], n * 3); DUST.size[n] = .05 + Rn() * .07; n++;
        }
        DUST.upload(n); DUST.draw(vp, pxs, { min: 1.1 * E.scale, max: 9 * E.scale, core: .4 });
      }

      /* ---- the cockpit, drawn over the world in screen space (css px) ---- */
      const W = E.cssW, Hh = E.cssH;
      let con, G, post, door;
      if (small) {
        const cx = W * .56, top = Hh * .38, r = Math.min(40, W * .1), gx = r * 1.3, gy = r * 2.45;
        con = [cx, top, gx + r * 1.3, top + gy + r * 2.4];
        G = [[cx - gx, top + r * 1.35], [cx + gx, top + r * 1.35], [cx - gx, top + r * 1.35 + gy], [cx + gx, top + r * 1.35 + gy]].map(q => [q[0], q[1], r]);
        post = [W * .2, 0, cx, top + 6]; door = W - 16;
      } else {
        const cx = W * .705, top = Math.max(Hh * .5, 380), r = Math.min(64, Hh * .075), gx = r * 1.3, gy = r * 2.5;
        con = [cx, top, gx + r * 1.3, top + gy + r * 2.4];
        G = [[cx - gx, top + r * 1.38], [cx + gx, top + r * 1.38], [cx - gx, top + r * 1.38 + gy], [cx + gx, top + r * 1.38 + gy]].map(q => [q[0], q[1], r]);
        post = [W * .5, 0, cx - gx * .15, top + 4]; door = W - 34;
      }
      /* layout order: 0 tach, 1 airspeed, 2 attitude, 3 altimeter  (grid: tach | attitude / airspeed | altimeter) */
      const slot = [G[0], G[2], G[1], G[3]];
      const gv = new Float32Array(16);
      slot.forEach((q, k) => gv.set([q[0], q[1], q[2], gw[k]], k * 4));
      const T0 = -2.36, T100 = 1.05;
      const needles = [
        -2.62 + .9 * sweep * 1.9 + hov * .025 * Math.sin(tt * .9),                     /* airspeed */
        .6 + 3.2 * sweep + lift * .05 + hov * .02 * Math.sin(tt * .61),                  /* altimeter */
        T0 + (T100 - T0) * eng * (1 + .015 * Math.sin(tt * 3) * (1 - lift)),           /* engine */
        T0 + (T100 - T0) * rot                                                           /* rotor */
      ];
      if (E.REDUCED) { needles[2] = T100; needles[3] = T100; }

      gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      COCK.use().f2("uRes", E.W, E.H).f1("uScale", E.scale).f1("uT", tt)
        .f4("uCon", con[0], con[1], con[2], con[3]).v4("uG", gv).f4("uN", needles[0], needles[1], needles[2], needles[3])
        .f2("uAtt", roll * 1.6, pitch * 1.6 + .07).f1("uJoin", join).f1("uSpin", tt * (1.5 + 38 * rate)).f1("uRate", E.REDUCED ? 1 : rate)
        .f1("uPanel", panel).f1("uDust", dk).f4("uPost", post[0], post[1], post[2], post[3]).f1("uDoor", door).f1("uSmall", small ? 1 : 0);
      E.tri();
      gl.disable(gl.BLEND); gl.depthMask(true);
      /* the page's own words, once you are flying */
      const lo = e.smooth((tS - 5.6) / 1.2);
      if (LAB._o !== lo) { LAB.style.opacity = lo.toFixed(3); LAB._o = lo; }
      LAB.style.transform = `translate3d(${con[0].toFixed(1)}px,${(con[1] - 16).toFixed(1)}px,0)`;
    }
  };
})();
