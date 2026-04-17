/**
 * Gemma 4 Embedded Tool Call Parser
 *
 * Gemma 4 running locally (e.g. via KoboldCPP at 4-bit quant) sometimes leaks its
 * internal tool-call vocabulary tokens into `delta.content` instead of emitting a
 * proper `delta.tool_calls` structure. The hallucinated format looks like:
 *
 *   <|tool_call>call:update_short_term_memory{summary:<|"|>...<|"|>}<tool_call|>
 *
 * This parser is a stateful chunk-by-chunk scanner that:
 * 1. Passes normal text through unchanged.
 * 2. Detects the `<|tool_call>` start token and begins buffering.
 * 3. Parses the complete block once `<tool_call|>` is found.
 * 4. Attempts a best-effort parse if the stream ends mid-block (truncation recovery).
 *
 * Args format inside the block:
 *   - String values:     key:<|"|>value<|"|>
 *   - Non-string values: key:rawValue  (numbers, booleans, bare identifiers)
 */

import { log } from "@/utils/misc/logger";
import type { FunctionCall } from "@/types/provider/interfaces";

const START_TOKEN = "<|tool_call>";
const END_TOKEN = "<tool_call|>";

export interface GemmaFeedResult {
  /** Visible text to emit (may be empty string). */
  visibleText: string;
  /** Completed function call, if one was fully parsed from this chunk. */
  functionCall: FunctionCall | null;
}

export interface GemmaFlushResult {
  /**
   * Any text that was held back at the end of the last idle chunk waiting for
   * a possible START_TOKEN continuation that never arrived. Must be emitted
   * before the stream terminates.
   */
  pendingText: string;
  /** Parsed function call recovered from a truncated accumulation buffer. */
  functionCall: FunctionCall | null;
}

export class GemmaToolCallParser {
  private mode: "idle" | "accumulating" = "idle";
  /**
   * Tail held back during idle scanning for a partial START_TOKEN prefix.
   * Only non-empty when the last chunk ended with a genuine prefix of START_TOKEN
   * (e.g. `<`, `<|`, `<|t`...). In practice this is almost always empty because
   * normal model output does not end with `<|`.
   */
  private scanHoldback = "";
  /** Raw content accumulated between START_TOKEN and END_TOKEN. */
  private toolBuffer = "";

  /** True while inside a tool call block (START seen, END not yet seen). */
  get isAccumulating(): boolean {
    return this.mode === "accumulating";
  }

  /**
   * Feed one text chunk from `delta.content`.
   * Returns visible text to emit and any completed tool call.
   */
  feed(text: string): GemmaFeedResult {
    if (this.mode === "idle") {
      return this.scanForStart(text);
    }
    return this.accumulate(text);
  }

  /**
   * Called when the stream ends. Returns any held-back visible text and any
   * function call recovered from a truncated accumulation buffer.
   */
  flush(): GemmaFlushResult {
    if (this.mode !== "accumulating") {
      const pendingText = this.scanHoldback;
      this.reset();
      return { pendingText, functionCall: null };
    }

    // Stream ended mid-accumulation — attempt a best-effort parse.
    log.info("CustomGemmaToolParser: Stream ended during tool call accumulation — attempting truncated parse");
    const functionCall = this.parseBlock(this.toolBuffer);
    this.reset();

    if (!functionCall) {
      log.warn("CustomGemmaToolParser: Truncated parse failed — discarding partial tool call");
    }
    return { pendingText: "", functionCall };
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private scanForStart(text: string): GemmaFeedResult {
    const combined = this.scanHoldback + text;
    const idx = combined.indexOf(START_TOKEN);

    if (idx !== -1) {
      // Found it: emit text before the token, start accumulating after it.
      const visibleText = combined.slice(0, idx);
      this.scanHoldback = "";
      this.toolBuffer = combined.slice(idx + START_TOKEN.length);
      this.mode = "accumulating";
      // The end token may already be present in the same chunk.
      return this.checkForEnd(visibleText);
    }

    // No full match. Only hold back the minimum tail that is a genuine prefix
    // of START_TOKEN — normal prose never ends with `<|` so holdback is usually "".
    const holdback = this.longestSuffixPrefix(combined);
    this.scanHoldback = holdback;
    return { visibleText: combined.slice(0, combined.length - holdback.length), functionCall: null };
  }

  private accumulate(text: string): GemmaFeedResult {
    this.toolBuffer += text;
    return this.checkForEnd("");
  }

  private checkForEnd(prependVisible: string): GemmaFeedResult {
    const endIdx = this.toolBuffer.indexOf(END_TOKEN);
    if (endIdx === -1) {
      return { visibleText: prependVisible, functionCall: null };
    }

    const block = this.toolBuffer.slice(0, endIdx);
    this.reset();

    const functionCall = this.parseBlock(block);
    if (!functionCall) {
      // Parse failed — emit raw block as text so nothing is silently dropped.
      log.warn(`CustomGemmaToolParser: Failed to parse block — emitting as text: ${block.slice(0, 200)}`);
      return { visibleText: prependVisible + block, functionCall: null };
    }

    return { visibleText: prependVisible, functionCall };
  }

  /**
   * Returns the longest suffix of `text` that is also a prefix of START_TOKEN,
   * excluding the full START_TOKEN itself (that case is handled by indexOf above).
   * This is how we safely hold back only the minimum necessary chars.
   */
  private longestSuffixPrefix(text: string): string {
    for (let len = Math.min(text.length, START_TOKEN.length - 1); len > 0; len--) {
      if (text.endsWith(START_TOKEN.slice(0, len))) {
        return text.slice(text.length - len);
      }
    }
    return "";
  }

  /**
   * Parse the raw content between START_TOKEN and END_TOKEN (or end of stream).
   *
   * Expected format: call:{toolName}{key:<|"|>value<|"|>, ...}
   */
  private parseBlock(block: string): FunctionCall | null {
    // 1. Try the full well-formed pattern: call:name{...}
    const full = block.match(/^call:(\w+)\{([\s\S]*)\}$/);
    if (full) {
      return this.buildCall(full[1], full[2]);
    }

    // 2. Truncation recovery: closing brace may be missing.
    const open = block.match(/^call:(\w+)\{([\s\S]*)$/);
    if (open) {
      log.info(`CustomGemmaToolParser: Recovering truncated call for "${open[1]}"`);
      return this.buildCall(open[1], open[2]);
    }

    log.warn(`CustomGemmaToolParser: Unrecognised block format: ${block.slice(0, 200)}`);
    return null;
  }

  /**
   * Build a FunctionCall from a parsed tool name and raw args string.
   *
   * Gemma 4 produces two string-value formats depending on quant level:
   *   Format A (special token markers): key:<|"|>value<|"|>
   *   Format B (standard JSON-style):   key: "value"  or  key:"value"
   */
  private buildCall(name: string, argsStr: string): FunctionCall {
    const args: Record<string, unknown> = {};
    const matchedKeys = new Set<string>();

    // 1. Format A — special token string markers: key:<|"|>value<|"|>
    for (const m of argsStr.matchAll(/(\w+):\s*<\|"\|>([\s\S]*?)<\|"\|>/g)) {
      args[m[1]] = m[2];
      matchedKeys.add(m[1]);
    }

    // 2. Format B — standard double-quoted strings: key: "value" or key:"value"
    //    Lazy quantifier stops at the first closing quote to keep args separate.
    for (const m of argsStr.matchAll(/(\w+):\s*"([\s\S]*?)"/g)) {
      if (matchedKeys.has(m[1])) continue;
      args[m[1]] = m[2];
      matchedKeys.add(m[1]);
    }

    // 3. Non-string args: key:rawValue (number / boolean / bare identifier).
    //    Only for keys not already captured above.
    for (const m of argsStr.matchAll(/(\w+):\s*([\w.-]+)/g)) {
      if (matchedKeys.has(m[1])) continue;

      const raw = m[2];
      if (raw === "true") args[m[1]] = true;
      else if (raw === "false") args[m[1]] = false;
      else if (!Number.isNaN(Number(raw))) args[m[1]] = Number(raw);
      else args[m[1]] = raw;
    }

    log.info(`CustomGemmaToolParser: Parsed "${name}" → ${JSON.stringify(args)}`);
    return { name, args };
  }

  private reset(): void {
    this.mode = "idle";
    this.scanHoldback = "";
    this.toolBuffer = "";
  }
}
