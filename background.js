// AI Interview Bot - Background Service Worker (MV3)
// Handles context menus, hotkeys, storage, and API calls

const DEFAULT_SETTINGS = {
  apiUrl: "",
  apiKey: "",
  apiKeyHeader: "Authorization",
  useBearer: true,
  authScheme: "bearer", // none | bearer | basic | raw (legacy useBearer still supported)
  // Generic JSON mode fields
  questionField: "question",
  contextField: "context",
  topicField: "topic",
  responsePath: "answer", // JSON path to extract answer (e.g., "choices.0.message.content")

  // Provider preset (simple switch for common APIs)
  providerPreset: "hf-inference", // "generic" | "hf-inference" | "openai-compatible"
  modelId: "meta-llama/Llama-3.1-8B-Instruct",
  systemPrompt: "You are a concise assistant for interview questions. Answer clearly and briefly.",
  temperature: 0.2,
  maxTokens: 512,
  timeoutMs: 45000,
};

function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => {
      resolve(items);
    });
  });
}

function saveSettings(patch) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(patch, () => resolve());
  });
}

function parseByPath(obj, path) {
  if (!path) return obj;
  const parts = String(path).split(".");
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    if (p.endsWith("]")) {
      const [key, idxStr] = p.split("[");
      const idx = parseInt(idxStr, 10);
      cur = key ? cur[key] : cur;
      cur = Array.isArray(cur) ? cur[idx] : undefined;
    } else {
      cur = cur[p];
    }
  }
  return cur;
}

function buildPrompt({ question, context = "", topic = "", systemPrompt }) {
  const pieces = [];
  if (systemPrompt) pieces.push(systemPrompt);
  if (topic) pieces.push(`Topic: ${topic}`);
  if (context) pieces.push(`Context: ${context}`);
  pieces.push(`Question: ${question}`);
  pieces.push("Answer succinctly.");
  return pieces.filter(Boolean).join("\n\n");
}

async function callApi({ question, context = "", topic = "" }) {
  const settings = await loadSettings();
  const headers = { "Content-Type": "application/json", "Accept": "application/json" };
  applyAuthHeader(headers, settings);
  // Force Bearer for Hugging Face tokens to avoid 401 when misconfigured
  if ((settings.providerPreset || "") === "hf-inference") {
    const headerName = settings.apiKeyHeader || "Authorization";
    const cur = headers[headerName] || "";
    const key = settings.apiKey || "";
    if (key && key.startsWith("hf_") && !/^Bearer\s/i.test(cur)) {
      headers[headerName] = `Bearer ${key}`;
    }
  }

  // Provider-specific handling
  const preset = settings.providerPreset || "generic";
  let url = settings.apiUrl || "";
  let body;

  if (preset === "hf-inference") {
    const model = settings.modelId || "meta-llama/Llama-3.1-8B-Instruct";
    if (!url) url = `https://api-inference.huggingface.co/models/${model}`;
    const prompt = buildPrompt({ question, context, topic, systemPrompt: settings.systemPrompt });
    body = {
      inputs: prompt,
      parameters: {
        max_new_tokens: Math.max(16, settings.maxTokens || 512),
        temperature: Number(settings.temperature ?? 0.2),
        return_full_text: false,
      },
    };
  } else if (preset === "openai-compatible") {
    // e.g., Together, Fireworks, OpenRouter (OpenAI format)
    if (!url) throw new Error("API URL is required for OpenAI-compatible preset.");
    const model = settings.modelId || "meta-llama/Llama-3.1-8B-Instruct";
    const sys = settings.systemPrompt || "You are a concise assistant.";
    const userContent = buildPrompt({ question, context, topic, systemPrompt: "" });
    body = {
      model,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: userContent },
      ],
      temperature: Number(settings.temperature ?? 0.2),
      max_tokens: Math.max(16, settings.maxTokens || 512),
      stream: false,
    };
  } else {
    // Generic JSON (original behavior)
    if (!url) throw new Error("API URL is not configured. Set it in Options.");
    body = {};
    body[settings.questionField || "question"] = question;
    if (context) body[settings.contextField || "context"] = context;
    if (topic) body[settings.topicField || "topic"] = topic;
  }

  const res = await fetchWithTimeout(url, { method: "POST", headers, body: JSON.stringify(body) }, settings.timeoutMs || 45000);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const brief = summarizeResponse(text);
    throw new Error(`API error ${res.status} (${preset}) at ${url}: ${brief}`);
  }

  // Parse response
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return await res.text();
  }

  const json = await res.json();
  if (preset === "hf-inference") {
    // HF Inference can return an array [{generated_text: "..."}] or object with generated_text
    if (Array.isArray(json) && json.length) {
      const first = json[0];
      return first?.generated_text || JSON.stringify(first);
    }
    return json?.generated_text || JSON.stringify(json);
  }
  if (preset === "openai-compatible") {
    const ans = json?.choices?.[0]?.message?.content || json?.choices?.[0]?.text;
    return ans || JSON.stringify(json);
  }
  // Generic path
  const value = parseByPath(json, settings.responsePath || "answer");
  return value == null ? JSON.stringify(json) : (typeof value === "string" ? value : JSON.stringify(value));
}

function applyAuthHeader(headers, settings) {
  const headerName = settings.apiKeyHeader || "Authorization";
  const scheme = settings.authScheme || (settings.useBearer ? "bearer" : "raw");
  if (scheme === "none") return;

  if (scheme === "bearer") {
    const apiKey = settings.apiKey || "";
    if (!apiKey) return;
    headers[headerName] = `Bearer ${apiKey}`;
    return;
  }

  if (scheme === "basic") {
    const user = settings.basicUsername || "";
    const pass = settings.basicPassword || "";
    let encoded;
    if (user || pass) {
      encoded = btoa(`${user}:${pass}`);
    } else if ((settings.apiKey || "").includes(":")) {
      encoded = btoa(settings.apiKey);
    } else if (isProbablyBase64(settings.apiKey || "")) {
      encoded = settings.apiKey;
    } else if (settings.apiKey) {
      // Last resort: treat apiKey as raw pair and encode it
      encoded = btoa(settings.apiKey);
    } else {
      return;
    }
    headers[headerName] = `Basic ${encoded}`;
    return;
  }

  // raw value in the header
  if (settings.apiKey) headers[headerName] = settings.apiKey;
}

function isProbablyBase64(s) {
  if (!s || s.length < 12 || s.length % 4 !== 0) return false;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(s);
}

function fetchWithTimeout(url, options, timeoutMs) {
  return new Promise((resolve, reject) => {
    const ctrl = new AbortController();
    const id = setTimeout(() => {
      try { ctrl.abort(); } catch (_) {}
      reject(new Error(`Request timed out after ${timeoutMs} ms`));
    }, Math.max(1000, timeoutMs || 30000));
    fetch(url, { ...(options || {}), signal: ctrl.signal })
      .then((res) => { clearTimeout(id); resolve(res); })
      .catch((err) => { clearTimeout(id); reject(err); });
  });
}

function summarizeResponse(text) {
  if (!text) return "";
  const t = String(text).trim();
  if (/<!doctype html/i.test(t) || /<html[\s>]/i.test(t)) {
    return "HTML page returned (likely wrong endpoint or auth redirect)";
  }
  return t.slice(0, 240);
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function getSelectionFromTab(tabId) {
  const [{ result } = {}] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => window.getSelection && String(window.getSelection()) || "",
  });
  return result || "";
}

async function showAnswerOverlay(tabId, payload) {
  // Ensure content script is ready; send a ping first
  try {
    await chrome.tabs.sendMessage(tabId, { type: "ping" });
  } catch (_) {
    // If content script failed, try to inject (for pages not matched earlier)
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
      await chrome.scripting.insertCSS({ target: { tabId }, files: ["content.css"] });
    } catch (e) {
      // Ignore injection errors (e.g., chrome:// pages)
    }
  }

  try {
    await chrome.tabs.sendMessage(tabId, { type: "show-answer", ...payload });
  } catch (e) {
    // If overlay cannot be shown (e.g., restricted pages), fallback to a notification
    const text = (payload.answer || "").slice(0, 1800);
    chrome.notifications.create({
      type: "basic",
      iconUrl: "",
      title: "AI Answer",
      message: text || "(No response)",
    });
  }
}

async function handleAsk({ source, question, context, topic }) {
  const tab = await getActiveTab();
  const tabId = tab?.id;

  if (!question && tabId) {
    question = await getSelectionFromTab(tabId);
  }

  if (!question || !question.trim()) {
    throw new Error("No question provided. Select text or type in the popup.");
  }

  const answer = await callApi({ question, context, topic });

  if (tabId && source !== "auto") {
    await showAnswerOverlay(tabId, { question, answer, topic });
  }
  return { question, answer };
}

// Context menu and command wiring
chrome.runtime.onInstalled.addListener(async () => {
  chrome.contextMenus.create({
    id: "ask-ai-selection",
    title: "Ask AI about selection",
    contexts: ["selection"],
  });

  // Seed defaults on first install
  await saveSettings(DEFAULT_SETTINGS);
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "ask-ai-selection" || !tab?.id) return;
  try {
    const selection = info.selectionText || (await getSelectionFromTab(tab.id));
    const answer = await callApi({ question: selection });
    await showAnswerOverlay(tab.id, { question: selection, answer });
  } catch (e) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "",
      title: "AI Interview Bot",
      message: String(e?.message || e),
    });
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "ask-selection") return;
  try {
    await handleAsk({ source: "command" });
  } catch (e) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "",
      title: "AI Interview Bot",
      message: String(e?.message || e),
    });
  }
});

// Messages from popup/options/content
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === "ask") {
      try {
        const { question, context, topic, source } = message;
        const result = await handleAsk({ source: source || "popup", question, context, topic });
        sendResponse({ ok: true, ...result });
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
      return;
    }
    if (message?.type === "test-call") {
      // Perform a quick health check using a small prompt
      try {
        const answer = await callApi({ question: message.prompt || "ping" });
        sendResponse({ ok: true, answer });
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
      return;
    }
    if (message?.type === "ping") {
      sendResponse({ ok: true });
      return;
    }
  })();
  return true; // async response
});
