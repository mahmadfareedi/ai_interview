// Injected into pages to render a floating overlay with answers

(() => {
  const OVERLAY_ID = "ai-interview-bot-overlay";
  const CAPTION_ID = "ai-interview-bot-caption";
  let overlayEl;
  let questionEl;
  let answerEl;
  let drag = { active: false, x: 0, y: 0, left: 0, top: 0 };

  // Auto-answer settings (synced with options)
  const DEFAULT_AUTO = {
    autoEnabled: false,
    autoSites: { meet: true, zoom: true, teams: true },
    showCaptionBar: true,
    cooldownSeconds: 12,
    requireQuestionMark: false,
    minLength: 20,
    defaultTopic: "general",
    captionDurationSeconds: 12,
  };

  let autoCfg = { ...DEFAULT_AUTO };
  let captionEl;
  let hideCaptionTimer;
  let lastAskAt = 0;
  let recentHashes = new Set();
  const MAX_HASHES = 50;

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

    if (autoCfg.showCaptionBar) {
      showCaption(question, answer);
    }
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

  // -------- Caption bar ---------
  function ensureCaption() {
    captionEl = document.getElementById(CAPTION_ID);
    if (captionEl) return captionEl;
    captionEl = document.createElement("div");
    captionEl.id = CAPTION_ID;
    captionEl.style.display = "none";
    captionEl.innerHTML = `
      <div class="aib-line aib-q"></div>
      <div class="aib-line aib-a"></div>
    `;
    document.documentElement.appendChild(captionEl);
    return captionEl;
  }

  function showCaption(question, answer) {
    ensureCaption();
    const q = captionEl.querySelector('.aib-q');
    const a = captionEl.querySelector('.aib-a');
    if (q) q.textContent = question ? `Q: ${question}` : "";
    if (a) a.textContent = answer ? `A: ${answer}` : "";
    captionEl.style.display = "block";
    clearTimeout(hideCaptionTimer);
    hideCaptionTimer = setTimeout(() => {
      captionEl.style.display = "none";
    }, (autoCfg.captionDurationSeconds || 12) * 1000);
  }

  // -------- Auto listeners ---------
  function siteMatches() {
    const h = location.hostname;
    if (/meet\.google\.com$/.test(h)) return autoCfg.autoSites.meet !== false;
    if (/(^|\.)zoom\.(us|com)$/.test(h)) return autoCfg.autoSites.zoom !== false;
    if (/teams\.microsoft\.com$/.test(h)) return autoCfg.autoSites.teams !== false;
    return false;
  }

  function loadAutoSettings(cb) {
    try {
      chrome.storage.sync.get(DEFAULT_AUTO, (cfg) => {
        autoCfg = { ...DEFAULT_AUTO, ...cfg, autoSites: { ...DEFAULT_AUTO.autoSites, ...(cfg.autoSites || {}) } };
        cb?.();
      });
    } catch (_) {
      cb?.();
    }
  }

  function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = (h << 5) - h + s.charCodeAt(i);
      h |= 0;
    }
    return h.toString(36);
  }

  function looksLikeQuestion(text) {
    const t = (text || "").trim();
    if (t.length < (autoCfg.minLength || 0)) return false;
    const lower = t.toLowerCase();
    const QUESTION_WORDS = [
      "what", "why", "how", "when", "which", "where", "who",
      "can you", "could you", "would you", "should we", "do you",
      "tell me", "explain", "describe", "walk me", "difference", "compare",
      "is there", "are there", "have you", "will this"
    ];
    const hasQMark = /\?/.test(t);
    const hasQWord = QUESTION_WORDS.some(w => lower.startsWith(w) || lower.includes(` ${w} `));
    if (autoCfg.requireQuestionMark) return hasQMark && hasQWord;
    return hasQMark || hasQWord;
  }

  const CANDIDATE_SELECTORS = [
    '[aria-live="polite"]',
    '[aria-live="assertive"]',
    '[role="alert"]',
    '[data-is-caption]',
    '[data-caption]',
    '[data-is-transcript]',
    '.caption', '.captions', '.transcript', '.live-transcript', '.live-captions',
  ];

  let pollTimer;
  let lastSeenText = "";

  async function maybeAskAuto(text) {
    if (!text || !looksLikeQuestion(text)) return;
    const now = Date.now();
    const coolMs = (autoCfg.cooldownSeconds || 12) * 1000;
    if (now - lastAskAt < coolMs) return;
    const h = hashStr(text);
    if (recentHashes.has(h)) return;

    // Maintain recent hashes set size
    recentHashes.add(h);
    if (recentHashes.size > MAX_HASHES) {
      const first = recentHashes.values().next().value;
      recentHashes.delete(first);
    }

    lastAskAt = now;
    try {
      const res = await chrome.runtime.sendMessage({ type: 'ask', source: 'auto', question: text, topic: autoCfg.defaultTopic || 'general' });
      if (res?.ok) {
        if (autoCfg.showCaptionBar) showCaption(text, res.answer || "");
        // Also keep overlay updated, if user opened it
        try { chrome.runtime.sendMessage({ type: 'show-answer', question: text, answer: res.answer || '' }); } catch(_) {}
      }
    } catch (_) {}
  }

  function pollCaptions() {
    try {
      let combined = "";
      for (const sel of CANDIDATE_SELECTORS) {
        document.querySelectorAll(sel).forEach((el) => {
          // Skip hidden or offscreen elements
          const style = window.getComputedStyle(el);
          if (style && (style.visibility === 'hidden' || style.display === 'none')) return;
          const txt = el.innerText || el.textContent || "";
          if (txt) combined += "\n" + txt;
        });
      }
      combined = combined.trim();
      if (!combined || combined === lastSeenText) return;
      // Heuristic: use the last non-empty line
      const lines = combined.split(/\n+/).map(s => s.trim()).filter(Boolean);
      const lastLine = lines[lines.length - 1];
      lastSeenText = combined;
      if (lastLine) maybeAskAuto(lastLine);
    } catch (_) {}
  }

  function startAutoIfNeeded() {
    if (!autoCfg.autoEnabled) return;
    if (!siteMatches()) return;
    if (pollTimer) return;
    pollTimer = setInterval(pollCaptions, 1000);
  }

  loadAutoSettings(() => {
    startAutoIfNeeded();
  });
})();
