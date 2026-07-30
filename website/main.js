/**
 * VideoSearch AI landing — scroll reveals + product image scale
 */
(function () {
  const year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  // Mobile nav
  const toggle = document.getElementById("navToggle");
  const links = document.getElementById("navLinks");
  toggle?.addEventListener("click", () => links?.classList.toggle("open"));
  links?.querySelectorAll("a").forEach((a) => {
    a.addEventListener("click", () => links.classList.remove("open"));
  });

  // Scroll reveal
  const reveals = document.querySelectorAll("[data-reveal]");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
    );
    reveals.forEach((el, i) => {
      el.style.transitionDelay = `${Math.min(i % 6, 5) * 0.06}s`;
      io.observe(el);
    });
  } else {
    reveals.forEach((el) => el.classList.add("is-visible"));
  }

})();
