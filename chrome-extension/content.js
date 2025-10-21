// Injected into pages to render a floating overlay with answers

(() => {
  const OVERLAY_ID = "ai-interview-bot-overlay";
  let overlayEl;
  let questionEl;
  let answerEl;
  let drag = { active: false, x: 0, y: 0, left: 0, top: 0 };

  function ensureOverlay() {
    overlayEl = document.getElementById(OVERLAY_ID);
    if (overlayEl) return overlayEl;

    overlayEl = document.createElement("div");
    overlayEl.id = OVERLAY_ID;

    overlayEl.innerHTML = `
      <div class="aib-header" id="aib-drag">
        <span class="aib-title">AI Interview Bot</span>
        <div class="aib-actions">
          <button class="aib-btn" id="aib-copy" title="Copy answer">Copy</button>
          <button class="aib-btn" id="aib-close" title="Close">✕</button>
        </div>
      </div>
      <div class="aib-body">
        <div class="aib-label">Question</div>
        <div class="aib-question" id="aib-question"></div>
        <div class="aib-label">Answer</div>
        <div class="aib-answer" id="aib-answer"></div>
      </div>
    `;

    document.documentElement.appendChild(overlayEl);

    questionEl = overlayEl.querySelector("#aib-question");
    answerEl = overlayEl.querySelector("#aib-answer");

    overlayEl.querySelector("#aib-close").addEventListener("click", () => {
      overlayEl.style.display = "none";
    });

    overlayEl.querySelector("#aib-copy").addEventListener("click", () => {
      const text = answerEl?.innerText || "";
      try {
        navigator.clipboard?.writeText(text).catch(() => {});
      } catch (_) {}
      // Fallback copy
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch (_) {}
      ta.remove();
    });

    // Dragging
    const dragHandle = overlayEl.querySelector("#aib-drag");
    dragHandle.addEventListener("mousedown", (e) => {
      drag.active = true;
      const rect = overlayEl.getBoundingClientRect();
      drag.x = e.clientX;
      drag.y = e.clientY;
      drag.left = rect.left;
      drag.top = rect.top;
      e.preventDefault();
    });
    window.addEventListener("mousemove", (e) => {
      if (!drag.active) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      overlayEl.style.left = Math.max(8, drag.left + dx) + "px";
      overlayEl.style.top = Math.max(8, drag.top + dy) + "px";
    });
    window.addEventListener("mouseup", () => (drag.active = false));

    return overlayEl;
  }

  function renderAnswer({ question, answer, topic }) {
    ensureOverlay();
    overlayEl.style.display = "block";
    if (questionEl) questionEl.textContent = question || "";
    if (answerEl) answerEl.textContent = answer || "";
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "show-answer") {
      renderAnswer(msg);
      sendResponse?.({ ok: true });
      return true;
    }
    if (msg?.type === "ping") {
      sendResponse?.({ ok: true });
      return true;
    }
    return undefined;
  });
})();

