const $ = (sel) => document.querySelector(sel);

const els = {
  apiUrl: $("#apiUrl"),
  apiKey: $("#apiKey"),
  apiKeyHeader: $("#apiKeyHeader"),
  useBearer: $("#useBearer"),
  questionField: $("#questionField"),
  contextField: $("#contextField"),
  topicField: $("#topicField"),
  responsePath: $("#responsePath"),
  save: $("#save"),
  test: $("#test"),
  status: $("#status"),
};

const DEFAULTS = {
  apiUrl: "",
  apiKey: "",
  apiKeyHeader: "Authorization",
  useBearer: true,
  questionField: "question",
  contextField: "context",
  topicField: "topic",
  responsePath: "answer",
};

function load() {
  chrome.storage.sync.get(DEFAULTS, (cfg) => {
    els.apiUrl.value = cfg.apiUrl || "";
    els.apiKey.value = cfg.apiKey || "";
    els.apiKeyHeader.value = cfg.apiKeyHeader || "Authorization";
    els.useBearer.value = String(!!cfg.useBearer);
    els.questionField.value = cfg.questionField || "question";
    els.contextField.value = cfg.contextField || "context";
    els.topicField.value = cfg.topicField || "topic";
    els.responsePath.value = cfg.responsePath || "answer";
  });
}

function save() {
  const patch = {
    apiUrl: els.apiUrl.value.trim(),
    apiKey: els.apiKey.value.trim(),
    apiKeyHeader: els.apiKeyHeader.value.trim() || "Authorization",
    useBearer: els.useBearer.value === "true",
    questionField: els.questionField.value.trim() || "question",
    contextField: els.contextField.value.trim() || "context",
    topicField: els.topicField.value.trim() || "topic",
    responsePath: els.responsePath.value.trim() || "answer",
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

els.save.addEventListener("click", save);
els.test.addEventListener("click", testCall);

document.addEventListener("DOMContentLoaded", load);

