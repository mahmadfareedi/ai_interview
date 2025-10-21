# AI Interview Desktop (Windows overlay)

System-wide caption-style answers for interviews. Copy any question (from Zoom/Teams/Meet or anywhere) and a bottom overlay shows the AI answer automatically.

Why this approach
- Works across apps, not just Chrome tabs
- No fragile DOM hooks into meeting UIs
- Low friction: copy a question → get answer

Quick start
- Install Node 18+
- cd `desktop-app`
- npm install
- npm run dev (or npm start)

Settings
- Tray → “Show Settings”
- Configure API URL/key, request fields, response path
- Turn on “Clipboard to Ask” and tweak detection (min length, require ?) and cooldown
- Customize caption bar: font size, width, bottom margin, auto-hide duration

How it works
- The app watches the clipboard for text changes (polling ~0.8s)
- If text looks like a question (configurable), it POSTs to your API
- Shows a non-interactive, always-on-top caption bar with Q / A

API contract
- JSON POST to your endpoint with fields: `question`, `context` (optional), `topic`
- Response is parsed via Response Path (dot path, default `answer`)
- Adjust `src/main.js → callApi()` if your API differs further

Notes
- For full auto (no copying): we can add microphone/system audio transcription (WASAPI loopback on Windows) or OCR on caption regions. Clipboard flow is the most reliable cross-app baseline without complex setup.
- The overlay is click-through to avoid interrupting; control via Tray.

