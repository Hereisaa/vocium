# Security Policy / 安全政策

## Supported Versions / 支援版本

Vocium is pre-1.0; only the latest release receives security fixes.

| Version | Supported |
|---------|-----------|
| 0.1.x   | ✅        |
| < 0.1   | ❌        |

## Security model / 安全模型

Vocium is **local-first and BYOK** (bring-your-own-key):

- API keys live only in your local `vocium-config.json` and are never committed,
  logged, or transmitted anywhere except the STT/LLM provider **you** configure.
- Audio you record is sent only to your configured provider for transcription.
- Keys are read inside the app process only (the voice core runs in the app's own
  webview); there is no external server or IPC surface that exposes them.

API 金鑰僅存於本機 `vocium-config.json`，除了你設定的 STT/LLM 供應商外不會外傳；
錄音僅送往你設定的供應商。金鑰只在 App 自己的行程內讀取（語音核心跑在 App 的 webview 裡），沒有對外的伺服器或 IPC 介面會暴露它。

## Reporting a Vulnerability / 回報漏洞

**Please do not open a public issue for security problems.**
請勿用公開 issue 回報安全問題。

Use GitHub's **private vulnerability reporting**:
**Security** tab → **Report a vulnerability**
(https://github.com/Hereisaa/vocium/security/advisories/new)

We aim to acknowledge reports within 7 days. Once a fix is released, we are happy
to credit reporters who wish to be named.
