/**
 * VideoSearch AI landing — reveals, stage walkthrough, install tabs
 */
(function () {
  if (window.lucide) window.lucide.createIcons();

  const year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  const toggle = document.getElementById("navToggle");
  const links = document.getElementById("navLinks");
  toggle?.addEventListener("click", () => links?.classList.toggle("open"));
  links?.querySelectorAll("a").forEach((a) => {
    a.addEventListener("click", () => links.classList.remove("open"));
  });

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

  const stageBtns = [...document.querySelectorAll("[data-stage]")];
  const panes = [...document.querySelectorAll("[data-pane]")];
  let stageIdx = 0;
  let stageTimer = 0;

  function showStage(id) {
    stageBtns.forEach((b) => {
      const on = b.getAttribute("data-stage") === id;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    panes.forEach((p) => p.classList.toggle("is-on", p.getAttribute("data-pane") === id));
    stageIdx = Math.max(0, stageBtns.findIndex((b) => b.getAttribute("data-stage") === id));
  }

  function nextStage() {
    if (!stageBtns.length) return;
    stageIdx = (stageIdx + 1) % stageBtns.length;
    showStage(stageBtns[stageIdx].getAttribute("data-stage") || "search");
  }

  function armStage() {
    window.clearInterval(stageTimer);
    stageTimer = window.setInterval(nextStage, 4200);
  }

  stageBtns.forEach((b) => {
    b.addEventListener("click", () => {
      showStage(b.getAttribute("data-stage") || "search");
      armStage();
    });
  });
  if (stageBtns.length) armStage();

  document.querySelectorAll("[data-install]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-install");
      document.querySelectorAll("[data-install]").forEach((b) => {
        b.classList.toggle("is-on", b === btn);
      });
      document.querySelectorAll("[data-install-pane]").forEach((p) => {
        p.classList.toggle("is-on", p.getAttribute("data-install-pane") === id);
      });
    });
  });

  const counters = document.querySelectorAll("[data-count]");
  if (counters.length && "IntersectionObserver" in window) {
    const cio = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target;
          const to = Number(el.getAttribute("data-count") || 0);
          const start = performance.now();
          const tick = (now) => {
            const t = Math.min(1, (now - start) / 700);
            el.textContent = String(Math.round(to * t));
            if (t < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
          cio.unobserve(el);
        }
      },
      { threshold: 0.4 }
    );
    counters.forEach((el) => cio.observe(el));
  }

  initLiveDemo();
})();

function initLiveDemo() {
  const root = document.querySelector("[data-live-demo]");
  if (!root) return;

  const VIDEO_ID = "IHZwWFHWa-w";
  const fmt = (s) => {
    const n = Math.max(0, Math.floor(s));
    const m = Math.floor(n / 60);
    const r = n % 60;
    return `${m}:${String(r).padStart(2, "0")}`;
  };

  const events = [
    { t: 18, kind: "topic", note: "Recap — what a neural network is", detail: "CC chapter · 0:18–1:40", from: "CC" },
    { t: 48, kind: "mark", note: "The network is just a function of many weights", detail: "“It’s not magic — it’s a function.”", from: "CC" },
    { t: 92, kind: "shot", img: `https://i.ytimg.com/vi/${VIDEO_ID}/1.jpg`, detail: "Digit 9 on the pixel grid", from: "CC" },
    { t: 108, kind: "topic", note: "The cost function", detail: "CC chapter · 1:48–4:10", from: "CC" },
    { t: 128, kind: "mark", note: "Cost measures how wrong the output is", detail: "Average squared error over the training set.", from: "CC" },
    { t: 168, kind: "topic", note: "The cost landscape", detail: "CC chapter · 2:48–6:20", from: "CC" },
    { t: 188, kind: "shot", img: `https://i.ytimg.com/vi/${VIDEO_ID}/2.jpg`, detail: "3D cost surface", from: "CC" },
    { t: 210, kind: "mark", note: "Think of cost as a landscape we walk downhill", detail: "High-dimensional, but the picture still holds.", from: "CC" },
    { t: 248, kind: "topic", note: "Gradient descent", detail: "CC chapter · 4:08–8:40", from: "CC" },
    { t: 268, kind: "mark", note: "Take a small step in the steepest downhill direction", detail: "That direction is the negative gradient.", from: "CC" },
    { t: 292, kind: "shot", img: `https://i.ytimg.com/vi/${VIDEO_ID}/3.jpg`, detail: "Step arrows on the surface", from: "CC" },
    { t: 330, kind: "mark", note: "This is gradient descent", detail: "Repeat: compute gradient, step, update weights.", from: "CC" },
    { t: 372, kind: "topic", note: "Partial derivatives & slope", detail: "CC chapter · 6:12–10:05", from: "CC" },
    { t: 402, kind: "mark", note: "Each weight gets its own partial derivative", detail: "How much cost changes if we nudge that one weight.", from: "CC" },
    { t: 448, kind: "shot", img: `https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault.jpg`, detail: "Pause and ponder frame", from: "CC" },
    { t: 490, kind: "topic", note: "Learning rate", detail: "CC chapter · 8:10–12:30", from: "CC" },
    { t: 518, kind: "mark", note: "Step size is the learning rate", detail: "Too big overshoots. Too small crawls.", from: "CC" },
    { t: 575, kind: "mark", note: "Local minima are not the end of the story", detail: "In practice the landscape is more forgiving.", from: "CC" },
    { t: 620, kind: "topic", note: "Why this scales to millions of weights", detail: "CC chapter · 10:20–14:40", from: "CC" },
    { t: 655, kind: "mark", note: "Backprop is just an efficient gradient", detail: "Same idea — organized so we can compute it fast.", from: "CC" },
    { t: 710, kind: "shot", img: `https://i.ytimg.com/vi/${VIDEO_ID}/mqdefault.jpg`, detail: "Network diagram recap", from: "CC" },
    { t: 760, kind: "topic", note: "Intuition recap", detail: "CC chapter · 12:40–17:20", from: "CC" },
    { t: 805, kind: "mark", note: "Learning is walking downhill on cost", detail: "That one picture is the whole algorithm.", from: "CC" },
    { t: 880, kind: "topic", note: "What’s next — backpropagation", detail: "CC chapter · 14:40–end", from: "CC" },
    { t: 930, kind: "mark", note: "Next video: how we actually compute the gradient", detail: "Tees up the chain rule / backprop chapter.", from: "CC" },
    { t: 160, kind: "source", label: "3blue1brown.com (spoken in CC)", kindLabel: "CC", url: "https://www.3blue1brown.com", from: "CC" },
    { t: 805, kind: "source", label: "Essence of linear algebra (spoken)", kindLabel: "CC", url: "https://www.3blue1brown.com/topics/linear-algebra", from: "CC" },
    { t: 40, kind: "source", label: "Lesson page — Gradient descent", kindLabel: "Bio", url: "https://www.3blue1brown.com/lessons/gradient-descent", from: "Bio" },
    { t: 40, kind: "source", label: "Manim — the animation engine", kindLabel: "Bio", url: "https://github.com/3b1b/manim", from: "Bio" },
    { t: 40, kind: "source", label: "Support the channel", kindLabel: "Bio", url: "https://www.patreon.com/3blue1brown", from: "Bio" },
    { t: 40, kind: "source", label: "Full neural-networks series", kindLabel: "Bio", url: "https://www.3blue1brown.com/topics/neural-networks", from: "Bio" },
  ];

  const topicsEl = root.querySelector('[data-demo-list="topics"]');
  const marksEl = root.querySelector('[data-demo-list="marks"]');
  const shotsEl = root.querySelector('[data-demo-list="shots"]');
  const sourcesEl = root.querySelector('[data-demo-list="sources"]');
  const nTopics = root.querySelector('[data-demo-n="topics"]');
  const bioEl = root.querySelector("[data-demo-bio]");
  const phoneClock = root.querySelector("[data-demo-phone-clock]");
  const phoneFeed = root.querySelector("[data-demo-phone-feed]");
  const nMarks = root.querySelector('[data-demo-n="marks"]');
  const nShots = root.querySelector('[data-demo-n="shots"]');
  const nSources = root.querySelector('[data-demo-n="sources"]');

  const durationGuess = 1260;
  let duration = durationGuess;
  let player = null;

  function seek(t) {
    if (player && typeof player.seekTo === "function") {
      player.seekTo(t, true);
      if (typeof player.playVideo === "function") player.playVideo();
    }
  }

  events.forEach((e, i) => {
    if (e.kind === "topic") {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "live-card is-on";
      b.innerHTML = `<em>${fmt(e.t)}</em><span>${e.note}<small>${e.detail || "From CC"}</small></span>`;
      b.addEventListener("click", () => seek(e.t));
      topicsEl?.appendChild(b);
      e.el = b;
    } else if (e.kind === "mark") {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "live-card is-on";
      b.innerHTML = `<em>${fmt(e.t)}</em><span>${e.note}<small>Your note</small></span>`;
      b.addEventListener("click", () => seek(e.t));
      marksEl?.appendChild(b);
      e.el = b;
    } else if (e.kind === "shot") {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "live-shot is-on";
      b.innerHTML = `<img src="${e.img}" alt="Shot at ${fmt(e.t)}" /><b>${fmt(e.t)}</b>`;
      b.title = e.detail || fmt(e.t);
      b.addEventListener("click", () => seek(e.t));
      shotsEl?.appendChild(b);
      e.el = b;
    } else if (e.kind === "source") {
      const a = document.createElement("a");
      a.className = "live-card is-on";
      a.href = e.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.innerHTML = `<em>${e.kindLabel}</em><span>${e.label}<small>${e.from} · ${e.url.replace(/^https?:\/\//, "")}</small></span>`;
      sourcesEl?.appendChild(a);
      e.el = a;
    }
    e._i = i;
  });

  fillPhone();
  sync(0);
  if (window.lucide) window.lucide.createIcons({ attrs: { "stroke-width": 2.2 } });

  function counts() {
    const c = { topic: 0, mark: 0, shot: 0, source: 0 };
    events.forEach((e) => {
      c[e.kind] = (c[e.kind] || 0) + 1;
    });
    return c;
  }

  function fillPhone() {
    if (!phoneFeed) return;
    phoneFeed.innerHTML = "";
    events
      .filter((e) => e.kind === "mark" || e.kind === "topic")
      .sort((a, b) => a.t - b.t)
      .forEach((row) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "live-phone-row";
        b.dataset.t = String(row.t);
        b.innerHTML = `<em>${fmt(row.t)}</em><span>${row.note}</span>`;
        b.addEventListener("click", () => seek(row.t));
        phoneFeed.appendChild(b);
      });
  }

  function sync(t) {
    if (phoneClock) phoneClock.textContent = fmt(t);
    phoneFeed?.querySelectorAll("[data-t]").forEach((btn) => {
      btn.classList.toggle("is-now", Math.abs(t - Number(btn.dataset.t)) < 12);
    });
    events.forEach((e) => {
      e.el?.classList.add("is-on");
      e.el?.classList.toggle("is-now", Math.abs(t - e.t) < 12);
    });
    const c = counts();
    if (nTopics) nTopics.textContent = String(c.topic);
    if (nMarks) nMarks.textContent = String(c.mark);
    if (nShots) nShots.textContent = String(c.shot);
    if (nSources) nSources.textContent = String(c.source);
    if (bioEl) bioEl.hidden = false;
  }

  function setDemoTab(id) {
    root.querySelectorAll("[data-demo-tab]").forEach((b) => {
      b.classList.toggle("is-on", b.getAttribute("data-demo-tab") === id);
    });
    root.querySelectorAll("[data-demo-pane]").forEach((p) => {
      p.classList.toggle("is-on", p.getAttribute("data-demo-pane") === id);
    });
  }

  root.querySelectorAll("[data-demo-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setDemoTab(btn.getAttribute("data-demo-tab"));
    });
  });

  root.querySelector("[data-demo-phone-play]")?.addEventListener("click", () => {
    if (player && typeof player.playVideo === "function") player.playVideo();
  });

  let fakeT = 40;
  let fakeTimer = 0;
  function startFakeClock() {
    window.clearInterval(fakeTimer);
    fakeTimer = window.setInterval(() => {
      fakeT += 1;
      if (fakeT > 400) fakeT = 40;
      sync(fakeT);
    }, 1000);
  }

  function playerBox() {
    const frame = root.querySelector(".live-player-frame");
    const w = Math.round(frame?.clientWidth || 640);
    const h = Math.round(frame?.clientHeight || Math.round(w * 9 / 16));
    return { w: Math.max(320, w), h: Math.max(180, h) };
  }

  function fitPlayer() {
    if (!player || typeof player.setSize !== "function") return;
    const { w, h } = playerBox();
    player.setSize(w, h);
  }

  function startPlayer() {
    if (!window.YT || !window.YT.Player) {
      startFakeClock();
      return;
    }
    const mount = document.getElementById("yt-demo");
    if (!mount) {
      startFakeClock();
      return;
    }
    const { w, h } = playerBox();
    player = new window.YT.Player("yt-demo", {
      videoId: VIDEO_ID,
      width: w,
      height: h,
      host: "https://www.youtube-nocookie.com",
      playerVars: {
        autoplay: 1,
        mute: 1,
        controls: 1,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
        loop: 1,
        playlist: VIDEO_ID,
        start: 42,
        origin: window.location.origin,
      },
      events: {
        onReady: (ev) => {
          try {
            duration = ev.target.getDuration() || durationGuess;
          } catch (_) {}
          fitPlayer();
          ev.target.mute();
          ev.target.playVideo();
          window.setInterval(() => {
            try {
              sync(ev.target.getCurrentTime() || 0);
            } catch (_) {}
          }, 400);
        },
        onStateChange: (ev) => {
          if (ev.data === window.YT.PlayerState.ENDED) {
            ev.target.seekTo(42, true);
            ev.target.playVideo();
          }
        },
      },
    });
    const frame = root.querySelector(".live-player-frame");
    if (frame && typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => fitPlayer());
      ro.observe(frame);
    } else {
      window.addEventListener("resize", fitPlayer);
    }
  }

  if (window.YT && window.YT.Player) {
    startPlayer();
  } else {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function () {
      if (typeof prev === "function") prev();
      startPlayer();
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    s.onerror = startFakeClock;
    document.head.appendChild(s);
    window.setTimeout(() => {
      if (!player) startFakeClock();
    }, 5000);
  }
}
