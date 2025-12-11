## Context
- Task: Audit and fix i18n for `HandleRegistry` and `SaveGitlabProviderCompose`.
- Goal: Remove hardcoded strings, ensure translation keys exist across locales, and keep field-to-API mappings unchanged.

## Plan
1) List all translation keys used in `HandleRegistry`; identify hardcoded strings (e.g., default name) needing i18n.  
2) Verify required keys in `apps/dokploy/public/locales/*/settings.json` (at least `en`, `zh-Hans`, `zh-Hant`); add missing entries.  
3) Update `HandleRegistry` to use i18n key for default registry name, aligned with schema/toast messaging.  
4) Collect translation keys from `SaveGitlabProviderCompose`; verify presence in `apps/dokploy/public/locales/*/common.json` (same locales); add missing entries.  
5) Re-check code mapping vs API payloads; run lint check on touched files.

## Notes
- Keep payload structure intact; only adjust text/validation messages.
- Prefer minimal new keys, reused across locales with placeholder translations if needed.

