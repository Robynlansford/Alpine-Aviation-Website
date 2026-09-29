/* =====================================================================
   LIVING PAGES — finishing layer (DOM only, no WebGL)
     .lp-rise        sections rise in as they arrive
     .lp-route       a rail that lights each step as it scrolls past
     [data-count]    counts up to a real number from the page when seen
   Reduced motion: everything is simply shown.
   ===================================================================== */
(function () {
  "use strict";
  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.documentElement.classList.add("lp-js");

  const rise = [...document.querySelectorAll(".lp-rise")];
  if (REDUCED || !("IntersectionObserver" in window)) rise.forEach(el => el.classList.add("in"));
  else {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px" });
    rise.forEach(el => io.observe(el));
  }

  const routes = [...document.querySelectorAll(".lp-route")];
  function lightRoutes() {
    const mid = innerHeight * .62;
    routes.forEach(r => {
      const items = [...r.children];
      const rb = r.getBoundingClientRect();
      const f = REDUCED ? 1 : Math.min(1, Math.max(0, (mid - rb.top) / Math.max(1, rb.height)));
      r.style.setProperty("--lp-route", f.toFixed(3));
      items.forEach(li => { const b = li.getBoundingClientRect(); li.classList.toggle("lit", REDUCED || b.top + 14 < mid); });
    });
  }
  if (routes.length) { lightRoutes(); addEventListener("scroll", lightRoutes, { passive: true }); addEventListener("resize", lightRoutes, { passive: true }); }

  const counts = [...document.querySelectorAll("[data-count]")];
  counts.forEach(el => {
    const to = parseFloat(el.dataset.count), dec = (el.dataset.count.split(".")[1] || "").length, pre = el.dataset.pre || "", suf = el.dataset.suf || "";
    const fmt = v => pre + v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + suf;
    if (REDUCED) { el.textContent = fmt(to); return; }
    el.textContent = fmt(0);
    const io = new IntersectionObserver(es => {
      if (!es[0].isIntersecting) return; io.disconnect();
      const t0 = performance.now(), dur = 1800;
      (function tick(now) { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 4); el.textContent = fmt(to * e); if (k < 1) requestAnimationFrame(tick); })(t0);
    }, { threshold: .6 });
    io.observe(el);
  });
})();
