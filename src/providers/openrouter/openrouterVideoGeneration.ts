import type {
  ProviderNativeVideoGenerationRequest,
  ProviderNativeVideoGenerationResult,
  ProviderNativeVideoResolution,
} from "@/types/provider/featureInterfaces";
import { log } from "@/utils/misc/logger";
import { pollForCompletion } from "@/utils/async/pollForCompletion";

/** Shape returned by the external HTTP helper */
interface ExternalHttpResponse {
  status: number;
  headers: Record<string, string>;
  bodyBuffer: Buffer;
}

/**
 * PowerShell 7 (pwsh) inline script that reads a JSON request envelope from stdin and
 * performs the HTTP request using Invoke-WebRequest.
 *
 * Why Invoke-WebRequest instead of .NET HttpClient?
 *   HttpClient in pwsh still triggers Cloudflare's bot detection for reasons unclear
 *   (possibly different HTTP/2 SETTINGS or missing default headers). Invoke-WebRequest
 *   uses a different code path internally and is confirmed to bypass Cloudflare consistently.
 *
 * Input (stdin JSON): { url: string, method: string, headers: Record<string,string>, body?: string }
 * Output (stdout JSON): { status: number, bodyBase64: string }
 *
 * The response body is base64-encoded so binary content (MP4 video) survives the text pipe.
 * -SkipHttpErrorCheck prevents throwing on non-2xx status codes (PowerShell 7+ feature).
 */
const PWSH_HTTP_SCRIPT = `
$ErrorActionPreference = 'Stop'
$req = [Console]::In.ReadToEnd() | ConvertFrom-Json
$headers = @{}
foreach ($h in $req.headers.PSObject.Properties) {
  if ($h.Name -ne 'Content-Type') { $headers[$h.Name] = $h.Value }
}
$params = @{
  Uri = $req.url
  Method = $req.method
  Headers = $headers
  UseBasicParsing = $true
  SkipHttpErrorCheck = $true
  TimeoutSec = 120
}
if ($req.method -eq 'POST' -and $req.body) {
  $params.Body = $req.body
  $params.ContentType = 'application/json'
}
$resp = Invoke-WebRequest @params
if ($resp.Content -is [byte[]]) {
  $bodyB64 = [Convert]::ToBase64String($resp.Content)
} else {
  $bodyB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes([string]$resp.Content))
}
$out = @{ status = [int]$resp.StatusCode; bodyBase64 = $bodyB64 }
[Console]::Out.Write(($out | ConvertTo-Json -Compress))
`;

/**
 * HTTP helper that spawns PowerShell 7 (pwsh) to make requests using Invoke-WebRequest.
 *
 * Why not use Bun's fetch or node:https?
 *   Bun's BoringSSL stack produces a non-standard TLS/HTTP fingerprint that Cloudflare
 *   identifies and serves cached HTML to, rather than routing to the API origin.
 *   Bun's node:https shim shares the same fingerprint. Even system curl on Windows lacks
 *   HTTP/2 support, which Cloudflare also uses for bot detection.
 *
 * Why PowerShell 7's Invoke-WebRequest?
 *   It uses .NET's built-in HTTP stack with Schannel TLS and proper HTTP/2 negotiation,
 *   producing a fingerprint that Cloudflare allows through consistently. Request data is
 *   piped via stdin as JSON (no shell escaping issues), and the response body is
 *   base64-encoded so binary content (MP4 video) survives the text pipe.
 *
 * @param url - The full URL to request (must be HTTPS)
 * @param method - HTTP method (GET or POST)
 * @param headers - HTTP headers to include in the request
 * @param body - Optional JSON body string for POST requests
 * @returns Object with HTTP status code, response headers (empty), and raw body as a Buffer
 */
async function externalHttpRequest(
  url: string,
  method: "GET" | "POST",
  headers: Record<string, string>,
  body?: string,
): Promise<ExternalHttpResponse> {
  // 1. Validate URL scheme — only HTTPS allowed to prevent protocol attacks
  if (!url.startsWith("https://")) {
    throw new Error(`externalHttpRequest: URL must use HTTPS, got: ${url.slice(0, 80)}`);
  }

  // 2. Sanitize header values — strip CRLF to prevent header injection
  const sanitizedHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    sanitizedHeaders[key] = value.replace(/[\r\n]/g, "");
  }

  // 3. Build the request envelope that pwsh reads from stdin
  const requestEnvelope = JSON.stringify({ url, method, headers: sanitizedHeaders, body });

  // 4. Spawn pwsh (PowerShell 7) with the inline HTTP script
  //    -NoProfile: skip user profile loading for faster startup
  //    -NonInteractive: no prompts — fail immediately on errors
  const proc = Bun.spawn(["pwsh", "-NoProfile", "-NonInteractive", "-Command", PWSH_HTTP_SCRIPT], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });

  // 5. Write the request envelope to stdin and close it
  proc.stdin.write(requestEnvelope);
  proc.stdin.end();

  // 6. Collect stdout and stderr in parallel
  const [rawOutput, rawStderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(`pwsh HTTP request failed (exit ${exitCode}): ${rawStderr.slice(0, 500)}`);
  }

  // 7. Parse the JSON response envelope from pwsh
  let envelope: { status: number; bodyBase64: string };
  try {
    envelope = JSON.parse(rawOutput) as typeof envelope;
  } catch {
    throw new Error(`pwsh HTTP response is not valid JSON: ${rawOutput.slice(0, 300)}`);
  }

  // 8. Decode the base64 body back to a Buffer (handles both JSON and binary MP4 content)
  const bodyBuffer = Buffer.from(envelope.bodyBase64, "base64");

  return { status: envelope.status, headers: {}, bodyBuffer };
}

/** OpenRouter alpha video generation endpoint */
const OPENROUTER_VIDEO_URL = "https://openrouter.ai/api/alpha/videos";

/** Polling interval for OpenRouter video jobs (30 seconds, per OpenRouter docs) */
const POLL_INTERVAL_MS = 30_000;

/** Maximum poll attempts before timeout (~10 minutes at 30s intervals) */
const MAX_POLL_ATTEMPTS = 20;

function selectClosestSupportedDuration(
  requestedDuration: number | undefined,
  supportedDurations: readonly number[],
): number {
  const fallbackTarget = requestedDuration ?? supportedDurations[0];
  return supportedDurations.reduce((best, current) =>
    Math.abs(current - fallbackTarget) < Math.abs(best - fallbackTarget) ? current : best,
  );
}

function normalizeOpenRouterOptions(
  model: string,
  requestedDuration: number | undefined,
  requestedResolution: ProviderNativeVideoResolution | undefined,
): { duration: number; resolution: ProviderNativeVideoResolution } {
  const normalizedModel = model.toLowerCase();

  if (normalizedModel.includes("google/veo")) {
    const resolution = requestedResolution === "1080p" ? "1080p" : "720p";
    // Veo requires exactly 8 seconds for 1080p output (provider constraint, not configurable)
    const duration = resolution === "1080p" ? 8 : selectClosestSupportedDuration(requestedDuration, [4, 6, 8]);
    return { duration, resolution };
  }

  if (normalizedModel.includes("openai/sora")) {
    return {
      duration: selectClosestSupportedDuration(requestedDuration, [4, 8, 12, 16, 20]),
      resolution: requestedResolution === "1080p" ? "1080p" : "720p",
    };
  }

  if (normalizedModel.includes("seedance")) {
    return {
      duration: Math.min(Math.max(requestedDuration ?? 5, 4), 12),
      resolution: requestedResolution ?? "720p",
    };
  }

  return {
    duration: Math.min(Math.max(requestedDuration ?? 5, 1), 20),
    resolution: requestedResolution ?? "720p",
  };
}

/** Shape of the OpenRouter video job creation response */
interface OpenRouterVideoSubmitResponse {
  id?: string;
  polling_url?: string;
  status?: string;
  error?: string;
}

/** Shape of the OpenRouter video job poll response (confirmed via live API) */
interface OpenRouterVideoPollResponse {
  id?: string;
  generation_id?: string;
  polling_url?: string;
  status?: "pending" | "in_progress" | "completed" | "failed" | "cancelled" | "expired";
  unsigned_urls?: string[];
  error?: string;
  usage?: {
    cost?: number;
    is_byok?: boolean;
  };
}

/**
 * Generate a video using OpenRouter's alpha video generation API.
 *
 * Flow:
 *   1. POST to /api/alpha/videos with model, prompt, and parameters
 *   2. Receive a job ID with "pending" status
 *   3. Poll every 30s via GET /api/alpha/videos/:jobId until "completed" or "failed"
 *   4. Download the MP4 from the unsigned_urls or content endpoint
 *
 * Supported models: google/veo-3.1, bytedance/seedance-1-5-pro, alibaba/wan-2.6, openai/sora-2-pro
 *
 * @param request - Video generation request with apiKey, model, prompt, and optional parameters
 * @returns Raw MP4 video data as a Buffer, or null values on failure
 */
export async function generateOpenRouterNativeVideo(
  request: ProviderNativeVideoGenerationRequest,
): Promise<ProviderNativeVideoGenerationResult> {
  const normalizedOptions = normalizeOpenRouterOptions(request.model, request.durationSeconds, request.resolution);

  // 1. Build request body.
  //    OpenRouter's alpha video endpoint accepts a unified format and maps params to each provider.
  //    Most params (generate_audio, resolution, duration) are universal.
  //    Exception: Seedance uses "ratio" internally (not "aspect_ratio"), but OpenRouter may not
  //    translate this for us — so we omit aspect_ratio for Seedance to avoid strict-validation failures.
  const body: Record<string, unknown> = {
    model: request.model,
    prompt: request.prompt,
    generate_audio: request.generateAudio ?? false,
    duration: normalizedOptions.duration,
    resolution: normalizedOptions.resolution,
  };

  // aspect_ratio is supported by all OpenRouter video models — OpenRouter normalizes it to
  // each provider's native field (e.g. "ratio" for Seedance) internally.
  if (request.aspectRatio) {
    body.aspect_ratio = request.aspectRatio;
  }

  // Add reference images for image-to-video.
  // Prefer the source URL over base64 — embedding large base64 payloads in the JSON body
  // can exceed OpenRouter's CDN body size limit and cause an HTML error page (200) to be returned.
  if (request.referenceImages && request.referenceImages.length > 0) {
    body.input_references = request.referenceImages.map((ref) => ({
      type: "image_url",
      image_url: {
        url: ref.url ?? `data:${ref.mimeType};base64,${ref.data}`,
      },
    }));
  }

  log.info(
    `OpenRouter video generation: submitting request (model: ${request.model}, aspectRatio: ${request.aspectRatio ?? "default"}, durationSeconds: ${normalizedOptions.duration}, resolution: ${normalizedOptions.resolution}, hasReferenceImages: ${!!(request.referenceImages && request.referenceImages.length > 0)})`,
  );

  const apiHeaders = {
    Authorization: `Bearer ${request.apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const submitBodyJson = JSON.stringify(body);

  // 2. Submit the generation request via external HTTP helper (bypasses Bun's TLS fingerprint issue)
  const submitRaw = await externalHttpRequest(OPENROUTER_VIDEO_URL, "POST", apiHeaders, submitBodyJson);

  const submitBodyText = submitRaw.bodyBuffer.toString("utf8");

  if (submitRaw.status < 200 || submitRaw.status >= 300) {
    log.error(
      `OpenRouter video generation request failed (model: ${request.model}, status: ${submitRaw.status})`,
      new Error(submitBodyText),
    );
    throw new Error(`OpenRouter video generation failed: ${submitRaw.status} — ${submitBodyText.slice(0, 200)}`);
  }

  let submitResult: OpenRouterVideoSubmitResponse;
  try {
    submitResult = JSON.parse(submitBodyText) as OpenRouterVideoSubmitResponse;
  } catch {
    log.error(
      `OpenRouter video generation: submit response is not JSON (status ${submitRaw.status})`,
      new Error(submitBodyText.slice(0, 500)),
    );
    throw new Error(`OpenRouter video generation failed: non-JSON response — ${submitBodyText.slice(0, 200)}`);
  }

  const jobId = submitResult.id;
  const pollingUrl = submitResult.polling_url;

  if (!jobId || !pollingUrl) {
    log.error(
      "OpenRouter video generation returned incomplete response",
      new Error(`Missing ${!jobId ? "job ID" : "polling_url"}: ${submitBodyText.slice(0, 300)}`),
    );
    throw new Error("OpenRouter video generation returned incomplete response (missing job ID or polling_url)");
  }

  log.info(
    `OpenRouter video generation: job submitted, polling for completion (jobId: ${jobId}, pollingUrl: ${pollingUrl})`,
  );

  // 3. Poll for completion using the polling_url returned by the submit response.
  //    The URL format is determined by OpenRouter and may differ from a simple ID-based path.
  const pollHeaders = {
    Authorization: `Bearer ${request.apiKey}`,
    Accept: "application/json",
  };

  const completedJob = await pollForCompletion<OpenRouterVideoPollResponse>({
    pollFn: async () => {
      const pollRaw = await externalHttpRequest(pollingUrl, "GET", pollHeaders);
      const pollBodyText = pollRaw.bodyBuffer.toString("utf8");

      if (pollRaw.status < 200 || pollRaw.status >= 300) {
        // Short-circuit on permanent auth errors — retrying won't help for 401/403
        // Note: 404 is NOT terminal here. OpenRouter's async job system may return 404 briefly
        // after submission due to eventual consistency — the job takes a few seconds to propagate.
        if (pollRaw.status === 401 || pollRaw.status === 403) {
          return {
            done: true,
            error: `OpenRouter video poll: terminal HTTP error (jobId: ${jobId}, status: ${pollRaw.status}): ${pollBodyText.slice(0, 200)}`,
          };
        }
        log.warn(
          `OpenRouter video poll request failed (jobId: ${jobId}, status: ${pollRaw.status}): ${pollBodyText.slice(0, 200)}`,
        );
        return { done: false };
      }

      let pollResult: OpenRouterVideoPollResponse;
      try {
        pollResult = JSON.parse(pollBodyText) as OpenRouterVideoPollResponse;
      } catch {
        log.warn(
          `OpenRouter video poll: response is not JSON (jobId: ${jobId}, status: ${pollRaw.status}): ${pollBodyText.slice(0, 200)}`,
        );
        return { done: false };
      }

      switch (pollResult.status) {
        case "completed":
          return { done: true, result: pollResult };
        case "failed":
          return {
            done: true,
            error: `OpenRouter video generation failed: ${pollResult.error ?? "unknown error"}`,
          };
        case "cancelled":
          return { done: true, error: "OpenRouter video generation was cancelled" };
        case "expired":
          return { done: true, error: "OpenRouter video generation expired" };
        default:
          // "pending" or "in_progress"
          return { done: false };
      }
    },
    intervalMs: POLL_INTERVAL_MS,
    maxAttempts: MAX_POLL_ATTEMPTS,
    logLabel: "OpenRouterVideoGeneration",
  });

  // 4. Download the video
  //    Use unsigned_urls if available, otherwise use the content endpoint.
  //    The video file may not be immediately available after the poll returns "completed"
  //    due to eventual consistency in OpenRouter's storage — retry a few times on 404.
  const videoUrl = completedJob.unsigned_urls?.[0] ?? `${OPENROUTER_VIDEO_URL}/${jobId}/content?index=0`;

  log.info(`OpenRouter video generation: downloading video (jobId: ${jobId}, url: ${videoUrl.slice(0, 80)})`);

  const maxDownloadAttempts = 4;
  const downloadRetryDelayMs = 5_000;
  const downloadHeaders = { Authorization: `Bearer ${request.apiKey}` };

  let videoRaw = await externalHttpRequest(videoUrl, "GET", downloadHeaders);

  for (let attempt = 2; attempt <= maxDownloadAttempts && videoRaw.status === 404; attempt++) {
    log.warn(
      `OpenRouter video download returned 404, retrying in ${downloadRetryDelayMs / 1000}s (jobId: ${jobId}, attempt: ${attempt}/${maxDownloadAttempts})`,
    );
    await new Promise((resolve) => setTimeout(resolve, downloadRetryDelayMs));
    videoRaw = await externalHttpRequest(videoUrl, "GET", downloadHeaders);
  }

  if (videoRaw.status < 200 || videoRaw.status >= 300) {
    log.error(`Failed to download OpenRouter video (jobId: ${jobId})`, new Error(`HTTP ${videoRaw.status}`));
    return { videoData: null, mimeType: null };
  }

  const videoData = videoRaw.bodyBuffer;

  log.info(`OpenRouter video generation: download complete (jobId: ${jobId}, sizeBytes: ${videoData.length})`);

  return {
    videoData,
    mimeType: "video/mp4",
    durationSeconds: normalizedOptions.duration,
  };
}
