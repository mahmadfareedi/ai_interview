const $ = (sel) => document.querySelector(sel);

const els = {
  apiUrl: $("#apiUrl"),
  apiKey: $("#apiKey"),
  apiKeyHeader: $("#apiKeyHeader"),
  authScheme: $("#authScheme"),
  basicUsername: $("#basicUsername"),
  basicPassword: $("#basicPassword"),
  questionField: $("#questionField"),
  contextField: $("#contextField"),
  topicField: $("#topicField"),
  responsePath: $("#responsePath"),
  providerPreset: $("#providerPreset"),
  modelId: $("#modelId"),
  temperature: $("#temperature"),
  maxTokens: $("#maxTokens"),
  systemPrompt: $("#systemPrompt"),
  save: $("#save"),
  test: $("#test"),
  status: $("#status"),
  // Auto settings
  autoEnabled: $("#autoEnabled"),
  defaultTopic: $("#defaultTopic"),
  cooldownSeconds: $("#cooldownSeconds"),
  minLength: $("#minLength"),
  siteMeet: $("#siteMeet"),
  siteZoom: $("#siteZoom"),
  siteTeams: $("#siteTeams"),
  requireQuestionMark: $("#requireQuestionMark"),
  showCaptionBar: $("#showCaptionBar"),
  captionDurationSeconds: $("#captionDurationSeconds"),
  saveAuto: $("#saveAuto"),
  statusAuto: $("#statusAuto"),
};

const DEFAULTS = {
  apiUrl: "",
  apiKey: "",
  apiKeyHeader: "Authorization",
  useBearer: true, // legacy
  authScheme: "bearer",
  basicUsername: "",
  basicPassword: "",
  questionField: "question",
  contextField: "context",
  topicField: "topic",
  responsePath: "answer",
  providerPreset: "hf-inference",
  modelId: "meta-llama/Llama-3.1-8B-Instruct",
  temperature: 0.2,
  maxTokens: 512,
  systemPrompt: "You are a concise assistant for interview questions. Answer clearly and briefly.",
  // Auto defaults (keep in sync with content.js)
  autoEnabled: false,
  autoSites: { meet: true, zoom: true, teams: true },
  showCaptionBar: true,
  cooldownSeconds: 12,
  requireQuestionMark: false,
  minLength: 20,
  defaultTopic: "general",
  captionDurationSeconds: 12,
};

function load() {
  chrome.storage.sync.get(DEFAULTS, (cfg) => {
    els.apiUrl.value = cfg.apiUrl || "";
    els.apiKey.value = cfg.apiKey || "";
    els.apiKeyHeader.value = cfg.apiKeyHeader || "Authorization";
    // Back-compat: map legacy useBearer to authScheme
    const scheme = cfg.authScheme || (cfg.useBearer ? "bearer" : (cfg.apiKey ? "raw" : "none"));
    els.authScheme.value = scheme;
    els.basicUsername.value = cfg.basicUsername || "";
    els.basicPassword.value = cfg.basicPassword || "";
    els.questionField.value = cfg.questionField || "question";
    els.contextField.value = cfg.contextField || "context";
    els.topicField.value = cfg.topicField || "topic";
    els.responsePath.value = cfg.responsePath || "answer";
    els.providerPreset.value = cfg.providerPreset || "hf-inference";
    els.modelId.value = cfg.modelId || "meta-llama/Llama-3.1-8B-Instruct";
    els.temperature.value = String(cfg.temperature ?? 0.2);
    els.maxTokens.value = String(cfg.maxTokens ?? 512);
    els.systemPrompt.value = cfg.systemPrompt || "You are a concise assistant for interview questions. Answer clearly and briefly.";
    // Auto
    els.autoEnabled.checked = !!cfg.autoEnabled;
    els.defaultTopic.value = cfg.defaultTopic || "general";
    els.cooldownSeconds.value = String(cfg.cooldownSeconds ?? 12);
    els.minLength.value = String(cfg.minLength ?? 20);
    els.siteMeet.checked = cfg.autoSites?.meet !== false;
    els.siteZoom.checked = cfg.autoSites?.zoom !== false;
    els.siteTeams.checked = cfg.autoSites?.teams !== false;
    els.requireQuestionMark.checked = !!cfg.requireQuestionMark;
    els.showCaptionBar.checked = cfg.showCaptionBar !== false;
    els.captionDurationSeconds.value = String(cfg.captionDurationSeconds ?? 12);
  });
  toggleBasicRow();
}

function save() {
  const patch = {
    apiUrl: els.apiUrl.value.trim(),
    apiKey: els.apiKey.value.trim(),
    apiKeyHeader: els.apiKeyHeader.value.trim() || "Authorization",
    authScheme: els.authScheme.value,
    basicUsername: els.basicUsername.value.trim(),
    basicPassword: els.basicPassword.value,
    questionField: els.questionField.value.trim() || "question",
    contextField: els.contextField.value.trim() || "context",
    topicField: els.topicField.value.trim() || "topic",
    responsePath: els.responsePath.value.trim() || "answer",
    providerPreset: els.providerPreset.value,
    modelId: els.modelId.value.trim() || "meta-llama/Llama-3.1-8B-Instruct",
    temperature: Math.max(0, parseFloat(els.temperature.value || "0.2") || 0.2),
    maxTokens: Math.max(16, parseInt(els.maxTokens.value || "512", 10) || 512),
    systemPrompt: els.systemPrompt.value.trim(),
  };
  chrome.storage.sync.set(patch, () => {
    els.status.textContent = "Saved.";
    setTimeout(() => (els.status.textContent = ""), 1500);
  });
}

async function testCall() {
  els.status.textContent = "Testing…";
  try {
    await new Promise((r) => chrome.runtime.sendMessage({ type: "test-call", prompt: "ping" }, r));
    els.status.textContent = "Check popup/notification for response.";
  } catch (e) {
    els.status.textContent = String(e?.message || e);
  } finally {
    setTimeout(() => (els.status.textContent = ""), 2500);
  }
}

function saveAuto() {
  const patch = {
    autoEnabled: !!els.autoEnabled.checked,
    defaultTopic: els.defaultTopic.value || "general",
    cooldownSeconds: Math.max(0, parseInt(els.cooldownSeconds.value || "12", 10) || 12),
    minLength: Math.max(0, parseInt(els.minLength.value || "20", 10) || 20),
    autoSites: {
      meet: !!els.siteMeet.checked,
      zoom: !!els.siteZoom.checked,
      teams: !!els.siteTeams.checked,
    },
    requireQuestionMark: !!els.requireQuestionMark.checked,
    showCaptionBar: !!els.showCaptionBar.checked,
    captionDurationSeconds: Math.max(3, parseInt(els.captionDurationSeconds.value || "12", 10) || 12),
  };
  chrome.storage.sync.set(patch, () => {
    els.statusAuto.textContent = "Saved.";
    setTimeout(() => (els.statusAuto.textContent = ""), 1500);
  });
}

els.save.addEventListener("click", save);
els.test.addEventListener("click", testCall);
els.saveAuto.addEventListener("click", saveAuto);
els.authScheme.addEventListener("change", toggleBasicRow);

document.addEventListener("DOMContentLoaded", load);

function toggleBasicRow() {
  const row = document.querySelector('#basicAuthRow');
  if (!row) return;
  row.style.display = (els.authScheme.value === 'basic') ? '' : 'none';
}
