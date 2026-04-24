/**
 * Runs `bun audit` and suppresses known ghost vulnerabilities that have no
 * available patch (archived/abandoned packages). Exits with a non-zero code
 * only if advisories outside the ghost list are found.
 *
 * Ghost vulnerabilities suppressed:
 *   - GHSA-p8p7-x288-28g6 — request<=2.88.2 SSRF; `request` was archived in
 *     2020 and will never receive a fix. Reaches us via:
 *     matrix-appservice-bridge → @vector-im/matrix-bot-sdk → request
 */

const GHOST_ADVISORIES = new Set(["GHSA-P8P7-X288-28G6"]);

// Run `bun audit` and capture combined stdout + stderr
const proc = Bun.spawn(["bun", "audit"], { stderr: "pipe", stdout: "pipe" });
const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
await proc.exited;

const combined = stdout + stderr;

// Extract all advisory IDs found in the output (format: GHSA-xxxx-xxxx-xxxx)
const foundIds = [...combined.matchAll(/GHSA-[a-z0-9]+-[a-z0-9]+-[a-z0-9]+/gi)].map((m) => m[0].toUpperCase());
const realVulns = foundIds.filter((id) => !GHOST_ADVISORIES.has(id));

if (realVulns.length > 0) {
  // Unknown advisories — print full output and fail
  process.stdout.write(combined);
  process.exit(1);
} else if (foundIds.length > 0) {
  // Only ghost advisories — report clean with a note
  console.log("✓ No actionable vulnerabilities found.");
  //console.log(`  (${foundIds.length} suppressed ghost advisory with no available patch: ${[...foundIds].join(", ")})`);
  process.exit(0);
} else {
  // Truly clean
  process.stdout.write(combined);
  process.exit(0);
}
