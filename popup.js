const $ = (sel) => document.querySelector(sel);

const els = {
  topic: $("#topic"),
  question: $("#question"),
  ask: $("#ask"),
  answerWrap: $("#answerWrap"),
  answer: $("#answer"),
  copy: $("#copy"),
  openOptions: $("#openOptions"),
  toggleContext: $("#toggleContext"),
  contextWrap: $("#contextWrap"),
  context: $("#context"),
};

function setBusy(b) {
  els.ask.disabled = b;
  els.ask.textContent = b ? "Asking…" : "Ask";
}

async function ask() {
  const question = els.question.value.trim();
  const context = els.context.value.trim();
  const topic = els.topic.value;

  setBusy(true);
  els.answerWrap.classList.remove("hidden");
  els.answer.textContent = "Thinking…";
  try {
    const res = await chrome.runtime.sendMessage({ type: "ask", question, context, topic });
    if (!res?.ok) throw new Error(res?.error || "Unknown error");
    els.answer.textContent = res.answer || "(No response)";
  } catch (e) {
    els.answer.textContent = String(e?.message || e);
  } finally {
    setBusy(false);
  }
}

function copyAns() {
  const text = els.answer.textContent || "";
  navigator.clipboard?.writeText(text).catch(() => {});
}

function openOptions() {
  if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
}

function toggleContext() {
  const hidden = els.contextWrap.classList.contains("hidden");
  els.contextWrap.classList.toggle("hidden", !hidden);
  els.toggleContext.textContent = hidden ? "Hide context" : "Add context";
}

els.ask.addEventListener("click", ask);
els.copy.addEventListener("click", copyAns);
els.openOptions.addEventListener("click", (e) => { e.preventDefault(); openOptions(); });
els.toggleContext.addEventListener("click", toggleContext);

