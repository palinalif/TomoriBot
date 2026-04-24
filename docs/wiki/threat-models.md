# TomoriBot Threat Model

This document comprehensively outlines the threat model for TomoriBot, analyzed from an adversarial (red team) perspective. We categorize potential threats using the **STRIDE** framework (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege) and group them by their primary attack vector.

Each table lists the vulnerability, its risk level, industry-standard mitigations, where they are implemented, and any accepted residual risks or assumptions.

---

## 1. Database Attack Vectors

This vector focuses on malicious user inputs designed to compromise the backend database (PostgreSQL/SQLite) directly.

| Threat (STRIDE) | Specific Vulnerability / Scenario | Risk | Mitigation Strategy | Implementation Area | Accepted Residual Risk & Assumptions |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Elevation of Privilege** | **Classic SQL Injection (SQLi):** Malicious inputs in Discord messages, command arguments, or persona definitions attempting to drop tables or modify configurations. | Critical | Parameterized Queries (Template Literals), Strict ORM abstraction. | `src/db/` | **Minimal Risk:** Bun's `sql\`` tagged template literals automatically parameterize inputs. We assume developers do not bypass this by using unsafe raw string concatenation. |
| **Information Disclosure** | **Cross-Tenant Data Leakage:** A bug in a query allows User A to read User B's private chat histories, persona prompts, or saved API keys. | High | Strict Context Scoping, Tenant IDs (`userId`, `guildId`) required on all `SELECT` queries. | `src/db/`, `src/ai/conditioning-memory.ts` | **Accepted Risk:** Developer error (forgetting a `WHERE` clause) could cause leaks. We rely on code reviews and strict TS types to enforce tenant scoping. |
| **Tampering** | **Mass Data Deletion:** A user exploiting a missing authorization check on a delete command (e.g., `wipe_memory`) to delete another user's data. | High | Role-Based Access Control (RBAC), Row-Level Security checks in application logic. | `src/commands/`, `src/utils/discord/` | The bot explicitly validates the Discord `interaction.user.id` against the target row's owner before executing `DELETE`. |
| **Denial of Service** | **Query Exhaustion (Algorithmic Complexity):** A user submits extremely large or complex vector search queries that lock up the database CPU. | Medium | Query Timeouts, Application-Level Rate Limiting, Connection Pooling limits. | `src/utils/cooldowns/`, Database config | If the database handles complex `pgvector` queries poorly under load, the bot may experience degraded performance. |

---

## 2. Model Context Protocol (MCP) Vectors

TomoriBot connects to Model Context Protocol (MCP) servers to extend its toolset. These servers can be local or remote, presenting a unique attack surface.

| Threat (STRIDE) | Specific Vulnerability / Scenario | Risk | Mitigation Strategy | Implementation Area | Accepted Residual Risk & Assumptions |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Elevation of Privilege** | **Malicious Local MCP Execution:** An administrator installs a third-party local MCP server that contains malware or executes arbitrary shell commands on the host. | Critical | Network Segmentation (Docker), Principle of Least Privilege (Host OS). | `src/mcp/`, Host Environment | **Assumption:** The host administrator *only* configures trusted MCP servers. TomoriBot does not deeply sandbox network calls or file access made *by* the local MCP server itself. |
| **Information Disclosure** | **Remote MCP SSRF (Server-Side Request Forgery):** A remote MCP server URL is configured to point to an internal network IP (e.g., `localhost:5432`, `169.254.169.254`), exposing internal services. | High | DNS Resolution Validation, IP Blocklisting, Strict TLS requirements for remote URLs. | `src/utils/mcp/mcpUrlSecurity.ts` | **Development vs Production:** In development, localhost and HTTP are permitted for local testing. In production (`RUN_ENV="production"`), the bot strictly enforces HTTPS and blocks all connections resolving to private/loopback IP ranges (`10.x.x.x`, `127.x.x.x`, etc.), mitigating SSRF. To connect local MCP servers in production, users must use a secure tunnel (e.g., Cloudflare Tunnels, ngrok) to expose them via a public HTTPS URL. |
| **Tampering** | **MCP Tool Prompt Injection:** A user instructs the LLM to invoke an MCP tool (like file-writer or database-reader) with malicious arguments, bypassing application logic. | High | Execution-Level Whitelisting, Parameter Validation *within* the MCP Server. | `src/tools/`, MCP Server implementation | **Accepted Risk:** If an MCP server exposes a dangerous tool (e.g., `execute_bash`), TomoriBot *will* pass the LLM's arguments to it. Security relies on the MCP server safely handling inputs and TomoriBot administrators gating tool access via Discord roles. |
| **Spoofing / Tampering** | **MCP Definition Prompt Injection:** A maliciously crafted MCP server provides tool names or descriptions designed to silently alter the LLM's system prompt or behavior just by being registered and loaded into context. | Medium | Context Scoping, Architectural Isolation. | `src/ai/context-assembly.ts`, `src/db/` | **Assumption:** Administrators must not register untrusted MCP servers. **Blast Radius Control:** Even if the LLM is compromised via an MCP definition, TomoriBot's architecture ensures the LLM has no raw database or filesystem access. It can only interact with data scoped to the current user/guild context (e.g., local memories). |

---

## 3. Custom Endpoint & External API Vectors

TomoriBot allows users to configure custom AI providers (e.g., OpenAI-compatible endpoints, TTS servers).

| Threat (STRIDE) | Specific Vulnerability / Scenario | Risk | Mitigation Strategy | Implementation Area | Accepted Residual Risk & Assumptions |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Information Disclosure** | **Custom Endpoint SSRF:** A user configures a custom LLM endpoint URL pointing to an internal AWS metadata endpoint or internal API, forcing the bot to fetch sensitive data. | High | IP Validation (No local/private IPs), Protocol Enforcement (HTTPS only in production). | `src/utils/security/userRemoteFetch.ts` | **Development vs Production:** Similar to MCP, custom endpoint validation in `fetchUserRemoteUrl` resolves hostnames to verify they do not point to internal infrastructure. This strict validation is enabled by default in production. |
| **Information Disclosure** | **API Key Exfiltration via Rogue Endpoint:** A user sets a custom endpoint URL to an attacker-controlled server and triggers a command that sends their API key (e.g., OpenRouter key) in the `Authorization` header to the attacker. | High | Provider-Specific Credential Resolution, Endpoint URL pinning. | `src/utils/provider/credentialResolver.ts` | The bot explicitly attaches API keys *only* to the specific provider domain or custom endpoint explicitly configured for that credential. |
| **Spoofing** | **DNS Rebinding / Man-in-the-Middle:** An attacker spoofs a custom API endpoint to intercept requests or return malicious payloads (e.g., fake tool call responses). | Medium | TLS/HTTPS Enforcement (`rejectUnauthorized`), Pinned DNS requests where supported. | `src/utils/security/userRemoteFetch.ts` | **Assumption:** The underlying OS DNS resolver and CA certificates are not compromised. |

---

## 4. LLM & Persona Vectors

This vector focuses on the non-deterministic nature of LLMs and how attackers manipulate the AI's generation process.

| Threat (STRIDE) | Specific Vulnerability / Scenario | Risk | Mitigation Strategy | Implementation Area | Accepted Residual Risk & Assumptions |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Tampering** | **Persona Jailbreaking (Prompt Injection):** A user crafts a message to override the system prompt, causing the bot to act out of character, ignore safety guidelines, or leak its instructions. | Medium | System Prompt Separation (Developer Messages), Output formatting enforcement. | `src/ai/context-assembly.ts` | **Accepted Risk:** Perfect defense against jailbreaks is impossible. We consider persona deviation a moderate risk, provided it does not lead to tool abuse. |
| **Elevation of Privilege** | **Unauthorized Tool Invocation via Injection:** A user tricks the LLM into outputting a tool-call request (e.g., `<tool>update_memory</tool>`) for a command they do not have permission to run. | Medium | Execution-Layer RBAC. Tool calls are strictly validated against Discord permissions *before* execution. | `src/handlers/tool-handler.ts` | **Overstated Risk:** TomoriBot natively *does not have* tools to ban users, read host files, or wipe the DB. The worst native tools can do is edit/delete the bot's own recent messages or modify local user memories. Severe impact is only possible if an admin intentionally registers a dangerous MCP server (covered in Section 2). The LLM operates with the privilege of the user invoking it. |
| **Denial of Service** | **Context Window Exhaustion / Credit Draining:** A user sends massive text walls or complex recursive requests designed to consume maximum tokens, draining the host's API credits or crashing the parser. | High | Hard Token Limits (Text Truncation), Token Bucket Rate Limiting, User Quotas. | `src/utils/quota/`, `src/ai/text-flushing.ts` | We rely on strict character limits on incoming messages and robust cooldown systems to prevent localized API spam. Distributed DoS is mitigated by Discord. |
| **Denial of Service** | **Financial Exhaustion (API Spam):** A malicious actor rapidly triggers bot commands or replies specifically to drain the administrator's paid API credits. | High | Guild/User Quotas, Channel Whitelisting, and Rate Limiting. | `src/systems/cooldown-system.md`, `src/utils/db/channelWhitelist.ts` | Server admins must configure `/whitelist` and `/quota` limits. We assume admins actively set reasonable limits to prevent unbounded API spend. |

---

## 5. Discord Integration & Webhook Vectors

TomoriBot relies heavily on Discord's API and uses Webhooks for bridging and persona impersonation.

| Threat (STRIDE) | Specific Vulnerability / Scenario | Risk | Mitigation Strategy | Implementation Area | Accepted Residual Risk & Assumptions |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Spoofing / Information Disclosure** | **Webhook Token Theft:** An attacker extracts the Discord Webhook URL/Token (e.g., from DB leak or logging) and uses it to send malicious messages spoofing the bot or legitimate users. | High | Secret Encryption in Transit/At Rest, Restricting Webhook permissions in Discord. | `src/utils/discord/webhookManager.ts` | Webhooks are strictly tied to specific channels. We rely on Discord's native webhook security; if the token leaks, only that specific channel is affected. |
| **Denial of Service** | **Discord API Rate Limit Exhaustion:** Malicious interactions forcing the bot to rapidly edit messages, create webhooks, or fetch history, causing global Discord API bans (429s). | Medium | Client-side Rate Limiting, Request Queues. | `discord.js` native queue, `src/utils/discord/` | Discord.js handles 429 backoffs natively. Severe abuse is mitigated by user-level cooldowns before Discord's global limits are hit. |

---

## 6. File & Asset Processing Vectors

The bot downloads and parses files uploaded by users, such as avatars, PDFs, or source code for the `read_file` tool.

| Threat (STRIDE) | Specific Vulnerability / Scenario | Risk | Mitigation Strategy | Implementation Area | Accepted Residual Risk & Assumptions |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Denial of Service** | **"Zip Bomb" / Parser Exploitation:** A user uploads a maliciously crafted, highly compressed PDF or text file that consumes excessive CPU/RAM when `pdf-parse` or the bot attempts to read it, crashing the node process. | High | Hard File Size Limits (8MB Default), File Extension Blocklists, Timeout constraints. | `src/utils/documents/textExtractor.ts`, `src/utils/security/safeDownload.ts` | **Accepted Risk:** While we block massive files and binary extensions, a perfectly crafted 7.9MB PDF could theoretically still stall the single-threaded Node.js event loop. We rely on standard process managers (Docker/PM2) to restart the bot if it OOMs. |
| **Information Disclosure** | **Asset SSRF via Redirects:** A user provides a URL for a character reference or avatar that redirects to an internal AWS/Cloud service. | Medium | `fetchUserRemoteUrl` wrapper for all user-provided URLs. | `src/storage/`, `src/utils/security/userRemoteFetch.ts` | All outbound requests to arbitrary URLs use the SSRF-protected fetcher. Discord native attachments are already hosted on Discord's CDN, so they are safe to fetch. |

## Guidelines for Contributors

1. **Defense in Depth:** Never assume the LLM will follow rules. Always enforce security constraints (permissions, tenant scoping) in the classical application code (TypeScript), not just in the prompt.
2. **Use the Wrappers:** When making HTTP requests to user-provided URLs, always use `fetchUserRemoteUrl` to prevent SSRF.
3. **Database Safety:** Always use Bun's `sql\`` template literal for dynamic values. Never concatenate strings into queries.