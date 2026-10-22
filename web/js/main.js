(function () {
  document.documentElement.classList.add("js");

  const progressBar = document.getElementById("scroll-progress");
  const updateProgress = () => {
    const el = document.documentElement;
    const max = el.scrollHeight - el.clientHeight;
    progressBar.style.width = (max > 0 ? (el.scrollTop / max) * 100 : 0) + "%";
  };
  document.addEventListener("scroll", updateProgress, { passive: true });
  window.addEventListener("resize", updateProgress, { passive: true });
  updateProgress();

  const toggle = document.getElementById("nav-toggle");
  const links = document.getElementById("nav-links");

  toggle.addEventListener("click", () => {
    const open = links.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });

  links.addEventListener("click", (e) => {
    if (e.target.tagName === "A") {
      links.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    }
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".nav")) {
      links.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    }
  });

  const reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("visible"));
  }

  document.querySelectorAll(".copy-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const text = btn.dataset.copy || "";
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      const original = btn.textContent;
      btn.textContent = "Đã sao chép ✓";
      setTimeout(() => {
        btn.textContent = original;
      }, 1800);
    });
  });
})();
