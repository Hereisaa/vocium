# Configuration

Config file location — created automatically on first launch:
`%APPDATA%\vocium\vocium-config.json` (Windows)
`~/Library/Application Support/vocium/vocium-config.json` (macOS)
Edit via **Tray → Vocium → Settings…** (three tabs: General / Speech-to-Text / AI Polish), or edit the file directly.

```jsonc
{
  "hotkey": "Ctrl+Shift+Space",
  "sttProvider": "groq",               // "groq" | "openai" | "gemini" | "mock"
  "groqApiKey": "<your-groq-key>",
  "groqModel": "whisper-large-v3-turbo",
  "openaiApiKey": "<your-openai-key>", // optional; fill in when using the OpenAI provider
  "openaiModel": "whisper-1",
  "openaiBaseUrl": "",                 // optional; leave empty to use api.openai.com
  "geminiApiKey": "<your-gemini-key>", // optional; fill in when using the Gemini provider
  "geminiModel": "gemini-3.5-flash",
  "inputMode": "toggle",               // "toggle" | "ptt" (push-to-talk mode)
  "vadTrim": false,                    // whether to enable automatic silence trimming
  "maxListenMs": 30000,
  "dragLocked": false
}
```

## API keys (BYOK)

Vocium has no server and no bundled key — each provider has its own field, and keys are stored only on your device.
Set keys via **Tray → Vocium → Settings…**.

| Provider | Get a key | Notes |
|---|---|---|
| **Groq** (recommended) | [console.groq.com](https://console.groq.com) | — |
| **OpenAI** | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | Optional custom **Base URL** for a compatible third-party endpoint |
| **Gemini** | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | — |

> **Privacy** — cloud providers (Groq, OpenAI, Gemini) send your audio to their servers for transcription. For fully offline use, wait for **Local STT** (roadmap).

## AI Polish

Optional LLM cleanup pass applied after transcription, before text injection. Off by default; enable in **Settings → AI Polish**.
Polish categories:

| Category | Behavior |
|---|---|
| **基礎校正** (Basic correction, `light`) | Restores punctuation, breaks into paragraphs, and fixes obvious mis-recognitions. Filler words are left untouched. |
| **話語潤飾** (Full polish, `full`) | Everything `light` does, plus removes filler words and smooths sentence flow. |
| **自訂 Prompt** (Custom prompt, `custom`) | Uses your own custom system prompt. |

Polish keys follow the same BYOK model: `groq`/`openai`/`gemini` automatically reuse the matching STT key unless you configure a polish-specific override; `claude` uses its own dedicated `claudeApiKey`. Any failure (no key, network error, timeout) falls back gracefully to the unpolished transcript — the transcription pipeline is never blocked by a polish failure.

Post-processing pipeline order: **STT → AI Polish → Traditional/Simplified conversion → text injection** (each step is optional).
