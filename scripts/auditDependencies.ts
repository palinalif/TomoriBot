import { readFile } from "node:fs/promises";

/**
 * CI dependency audit gate.
 *
 * Uses `bun audit --json --audit-level=high` as the advisory source, then applies
 * a repo-owned accepted-risk policy keyed by advisory id and lockfile path.
 * This keeps Matrix-only accepted risk narrow without hiding the same advisory
 * if it appears elsewhere in the dependency graph.
 */
type AuditSeverity = "low" | "moderate" | "high" | "critical";

interface AuditAdvisory {
  id: number;
  url: string;
  title: string;
  severity: AuditSeverity;
  vulnerable_versions: string;
}

type AuditResult = Record<string, AuditAdvisory[]>;

interface LockfileWorkspace {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface LockfilePackageMeta {
  dependencies?: Record<string, string>;
}

type LockfilePackageEntry = [string, string, LockfilePackageMeta?, ...unknown[]];

interface Lockfile {
  workspaces: Record<string, LockfileWorkspace>;
  packages: Record<string, LockfilePackageEntry>;
}

interface AcceptedRiskPolicy {
  packageName: string;
  advisoryIds: number[];
  allowedPathFragments: string[][];
  rationale: string;
  removal: string;
}

interface EvaluatedFinding {
  packageName: string;
  advisory: AuditAdvisory;
  paths: string[][];
}

interface AcceptedFinding extends EvaluatedFinding {
  policy: AcceptedRiskPolicy;
}

const BLOCKING_SEVERITIES = new Set<AuditSeverity>(["high", "critical"]);

// Bun audit reports advisories at the package level, not the dependency-path level.
// Each accepted-risk entry here is therefore intentionally narrow:
// - exact package name
// - exact advisory id(s)
// - every reachable lockfile path for that package must stay inside the approved chain(s)
const ACCEPTED_RISK_POLICIES: readonly AcceptedRiskPolicy[] = [
  {
    packageName: "lodash",
    advisoryIds: [1115806],
    allowedPathFragments: [["matrix-appservice-bridge", "@vector-im/matrix-bot-sdk"]],
    rationale:
      "Accepted only for the Matrix bridge dependency chain. TomoriBot disables matrix-appservice-bridge file stores and blocks encrypted Matrix rooms, so this remains a scoped temporary exception rather than a blanket lodash ignore.",
    removal:
      "Remove this exception once the supported Matrix dependency chain no longer resolves the advisory, then rerun `bun install`, `bun audit`, `bun run check`, and `bun run lint`.",
  },
] as const;

function extractJsonObject(output: string): string {
  const trimmed = output.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("bun audit did not return parseable JSON output");
  }

  return trimmed.slice(firstBrace, lastBrace + 1);
}

async function runCommand(command: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const process = Bun.spawn({
    cmd: command,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);

  return { stdout, stderr, exitCode };
}

async function runAudit(): Promise<AuditResult> {
  const { stdout, stderr, exitCode } = await runCommand(["bun", "audit", "--json", "--audit-level=high"]);

  if (!stdout.trim()) {
    const details = stderr.trim() ? ` stderr: ${stderr.trim()}` : "";
    throw new Error(`bun audit returned no JSON output (exit code ${exitCode}).${details}`);
  }

  try {
    return JSON.parse(extractJsonObject(stdout)) as AuditResult;
  } catch (error) {
    const details = stderr.trim() ? ` stderr: ${stderr.trim()}` : "";
    throw new Error(
      `Failed to parse bun audit JSON output: ${error instanceof Error ? error.message : String(error)}.${details}`,
    );
  }
}

async function readLockfile(): Promise<Lockfile> {
  const contents = await readFile("bun.lock", "utf8");
  const normalized = contents.replace(/,\s*([}\]])/g, "$1");
  return JSON.parse(normalized) as Lockfile;
}

function getRootWorkspace(lockfile: Lockfile): LockfileWorkspace {
  const workspace = lockfile.workspaces[""];
  if (!workspace) {
    throw new Error("bun.lock is missing the root workspace entry");
  }

  return workspace;
}

function getPackageMeta(entry: LockfilePackageEntry): LockfilePackageMeta {
  const rawMeta = entry[2];
  if (!rawMeta || typeof rawMeta !== "object" || Array.isArray(rawMeta)) {
    return {};
  }

  return rawMeta as LockfilePackageMeta;
}

function getResolvedPackageName(entry: LockfilePackageEntry): string {
  const descriptor = entry[0];
  const npmAliasIndex = descriptor.indexOf("@npm:");
  if (npmAliasIndex > 0) {
    return descriptor.slice(0, npmAliasIndex);
  }

  const versionSeparatorIndex = descriptor.lastIndexOf("@");
  return versionSeparatorIndex > 0 ? descriptor.slice(0, versionSeparatorIndex) : descriptor;
}

function resolveDependencyKey(
  packages: Record<string, LockfilePackageEntry>,
  dependencyName: string,
  parentKey?: string,
): string | null {
  if (parentKey) {
    const nestedKey = `${parentKey}/${dependencyName}`;
    if (nestedKey in packages) {
      return nestedKey;
    }
  }

  if (dependencyName in packages) {
    return dependencyName;
  }

  return null;
}

function collectPathsToPackage(lockfile: Lockfile, targetPackageName: string): string[][] {
  const rootWorkspace = getRootWorkspace(lockfile);
  const rootName = rootWorkspace.name ?? "workspace";
  const rootDependencies = new Set([
    ...Object.keys(rootWorkspace.dependencies ?? {}),
    ...Object.keys(rootWorkspace.devDependencies ?? {}),
  ]);
  const discoveredPaths = new Set<string>();

  function visit(currentKey: string, path: string[], seenKeys: Set<string>): void {
    const entry = lockfile.packages[currentKey];
    const currentName = getResolvedPackageName(entry);

    if (currentName === targetPackageName) {
      discoveredPaths.add(path.join(" -> "));
    }

    const dependencies = getPackageMeta(entry).dependencies ?? {};
    for (const dependencyName of Object.keys(dependencies)) {
      const childKey = resolveDependencyKey(lockfile.packages, dependencyName, currentKey);
      if (!childKey || seenKeys.has(childKey)) {
        continue;
      }

      const childEntry = lockfile.packages[childKey];
      const childName = getResolvedPackageName(childEntry);
      const nextSeenKeys = new Set(seenKeys);
      nextSeenKeys.add(childKey);
      visit(childKey, [...path, childName], nextSeenKeys);
    }
  }

  for (const dependencyName of rootDependencies) {
    const dependencyKey = resolveDependencyKey(lockfile.packages, dependencyName);
    if (!dependencyKey) {
      continue;
    }

    const entry = lockfile.packages[dependencyKey];
    const resolvedName = getResolvedPackageName(entry);
    visit(dependencyKey, [rootName, resolvedName], new Set([dependencyKey]));
  }

  return [...discoveredPaths].map((path) => path.split(" -> "));
}

function pathMatchesPolicy(path: string[], policy: AcceptedRiskPolicy): boolean {
  return policy.allowedPathFragments.some((requiredFragments) =>
    requiredFragments.every((fragment) => path.includes(fragment)),
  );
}

function findAcceptedRiskPolicy(packageName: string, advisoryId: number, paths: string[][]): AcceptedRiskPolicy | null {
  if (paths.length === 0) {
    return null;
  }

  for (const policy of ACCEPTED_RISK_POLICIES) {
    if (policy.packageName !== packageName || !policy.advisoryIds.includes(advisoryId)) {
      continue;
    }

    if (paths.every((path) => pathMatchesPolicy(path, policy))) {
      return policy;
    }
  }

  return null;
}

function printFinding(prefix: string, finding: EvaluatedFinding): void {
  console.log(`${prefix} ${finding.packageName} - ${finding.advisory.title}`);
  console.log(`  Severity: ${finding.advisory.severity}`);
  console.log(`  Advisory: ${finding.advisory.url}`);
  console.log(`  Vulnerable versions: ${finding.advisory.vulnerable_versions}`);
  if (finding.paths.length === 0) {
    console.log("  Paths: <unable to resolve from bun.lock>");
  } else {
    console.log("  Paths:");
    for (const path of finding.paths) {
      console.log(`    - ${path.join(" -> ")}`);
    }
  }
}

async function main(): Promise<void> {
  console.log("Running dependency vulnerability scan...");

  const [auditResult, lockfile] = await Promise.all([runAudit(), readLockfile()]);
  const acceptedFindings: AcceptedFinding[] = [];
  const blockingFindings: EvaluatedFinding[] = [];

  for (const [packageName, advisories] of Object.entries(auditResult)) {
    const blockingAdvisories = advisories.filter((advisory) => BLOCKING_SEVERITIES.has(advisory.severity));
    if (blockingAdvisories.length === 0) {
      continue;
    }

    const paths = collectPathsToPackage(lockfile, packageName);

    for (const advisory of blockingAdvisories) {
      const finding: EvaluatedFinding = {
        packageName,
        advisory,
        paths,
      };

      const policy = findAcceptedRiskPolicy(packageName, advisory.id, paths);
      if (policy) {
        acceptedFindings.push({ ...finding, policy });
      } else {
        blockingFindings.push(finding);
      }
    }
  }

  if (acceptedFindings.length > 0) {
    console.log("");
    console.log("Accepted high/critical dependency findings:");
    for (const finding of acceptedFindings) {
      printFinding("-", finding);
      console.log(`  Rationale: ${finding.policy.rationale}`);
      console.log(`  Removal: ${finding.policy.removal}`);
    }
  }

  if (blockingFindings.length > 0) {
    console.log("");
    console.log("Blocking high/critical dependency findings:");
    for (const finding of blockingFindings) {
      printFinding("-", finding);
    }
    process.exit(1);
  }

  console.log("");
  console.log("No unapproved high or critical vulnerabilities found in dependencies.");
}

main().catch((error) => {
  console.error("Dependency audit policy failed:");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
