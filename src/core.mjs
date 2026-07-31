import {
  access,
  copyFile,
  cp,
  mkdir,
  readFile,
  stat,
  writeFile
} from "node:fs/promises";
import { constants as fsConstants, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export const APPLICATION_STATES = new Set([
  "discovered",
  "eligible",
  "tailored",
  "documents_ready",
  "form_started",
  "blocked",
  "skipped",
  "submitted"
]);

const PRIVATE_ANSWER_PATTERN = /password|passcode|otp|one.?time|verification.?code|token|secret|captcha/i;
const REQUIRED_CANDIDATE_FILES = [
  "profile.json",
  "facts.md",
  "resume.tex",
  "cover-letter-sample.md",
  "cover-letter-template.tex"
];

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function slugify(value) {
  return normalizeText(value)
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "job";
}

export function canonicalizeUrl(value) {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    throw new Error(`Invalid job URL: ${value}`);
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Job URL must use HTTP or HTTPS.");
  }

  url.hash = "";
  const removable = [
    "currentJobId",
    "refId",
    "referenceId",
    "source",
    "src",
    "trackingId",
    "trk"
  ];
  for (const key of [...url.searchParams.keys()]) {
    if (removable.includes(key) || key.toLowerCase().startsWith("utm_")) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();
  url.hostname = url.hostname.toLowerCase();
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

function jobPairKey(company, role) {
  return `${normalizeText(company)}::${normalizeText(role)}`;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function pathFromRoot(root, value) {
  if (!value) return null;
  return isAbsolute(value) ? value : resolve(root, value);
}

function portablePath(root, value) {
  if (!value) return null;
  const absolute = pathFromRoot(root, value);
  const local = relative(root, absolute);
  return local && !local.startsWith("..") && !isAbsolute(local)
    ? local.replaceAll("\\", "/")
    : absolute;
}

async function assertReadableFile(path, label) {
  try {
    await access(path, fsConstants.R_OK);
    if (!(await stat(path)).isFile()) throw new Error("not a file");
  } catch {
    throw new Error(`${label} is not a readable file: ${path}`);
  }
}

export async function initializeCandidate(root, { force = false } = {}) {
  const source = join(root, "candidate.example");
  const target = join(root, "candidate");
  await access(source, fsConstants.R_OK);

  if (existsSync(target) && !force) {
    return { created: false, path: target };
  }

  await cp(source, target, { recursive: true, force });
  return { created: true, path: target };
}

function getPath(value, dottedPath) {
  return dottedPath.split(".").reduce((current, key) => current?.[key], value);
}

export async function validateCandidate(root) {
  const candidateDir = join(root, "candidate");
  const errors = [];
  for (const file of REQUIRED_CANDIDATE_FILES) {
    const path = join(candidateDir, file);
    if (!existsSync(path)) errors.push(`Missing candidate/${file}`);
  }

  const profilePath = join(candidateDir, "profile.json");
  let profile = null;
  if (existsSync(profilePath)) {
    try {
      profile = await readJson(profilePath);
    } catch (error) {
      errors.push(`candidate/profile.json is invalid JSON: ${error.message}`);
    }
  }

  if (profile) {
    const required = [
      "identity.fullName",
      "identity.email",
      "identity.phone",
      "identity.location",
      "identity.linkedin",
      "search.targetTitles",
      "search.locations",
      "search.maxPostingAgeHours"
    ];
    for (const field of required) {
      const value = getPath(profile, field);
      const missing = value === undefined
        || value === null
        || value === ""
        || (Array.isArray(value) && value.length === 0);
      if (missing) errors.push(`Missing profile field: ${field}`);
    }

    const serialized = JSON.stringify(profile);
    if (/YOUR_[A-Z_]+|YOUR COUNTRY|YOUR PREFERRED LOCATION|YYYY-MM/.test(serialized)) {
      errors.push("candidate/profile.json still contains placeholder values.");
    }
    if (typeof profile.eligibility?.authorizedToWork !== "boolean") {
      errors.push("eligibility.authorizedToWork must be true or false.");
    }
    if (typeof profile.eligibility?.needsSponsorship !== "boolean") {
      errors.push("eligibility.needsSponsorship must be true or false.");
    }
    const maxAge = Number(profile.search?.maxPostingAgeHours);
    if (!Number.isFinite(maxAge) || maxAge <= 0) {
      errors.push("search.maxPostingAgeHours must be a positive number.");
    }
  }

  for (const file of ["facts.md", "resume.tex", "cover-letter-sample.md"]) {
    const path = join(candidateDir, file);
    if (!existsSync(path)) continue;
    const content = await readFile(path, "utf8");
    if (/Replace this|YOUR (?:FULL NAME|EMAIL|PHONE|ROLE|DEGREE|PROJECT)/i.test(content)) {
      errors.push(`candidate/${file} still contains example placeholders.`);
    }
  }

  return { ok: errors.length === 0, errors, profile };
}

export function sanitizeAnswers(value, parentKey = "") {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAnswers(item, parentKey));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        PRIVATE_ANSWER_PATTERN.test(key)
          ? "[REDACTED]"
          : sanitizeAnswers(item, key)
      ])
    );
  }
  return PRIVATE_ANSWER_PATTERN.test(parentKey) ? "[REDACTED]" : value;
}

export async function loadLedger(root) {
  const path = join(root, "runtime", "ledger.json");
  if (!existsSync(path)) {
    return { version: 1, applications: [] };
  }
  const ledger = await readJson(path);
  if (!Array.isArray(ledger.applications)) {
    throw new Error("runtime/ledger.json is invalid: applications must be an array.");
  }
  return ledger;
}

async function saveLedger(root, ledger) {
  await writeJson(join(root, "runtime", "ledger.json"), ledger);
}

function resolvePostingAgeHours({ postingAgeHours, postedAt, now = new Date() }) {
  if (postingAgeHours !== undefined && postingAgeHours !== null && postingAgeHours !== "") {
    const numeric = Number(postingAgeHours);
    if (!Number.isFinite(numeric) || numeric < 0) {
      throw new Error("--posting-age-hours must be a non-negative number.");
    }
    return numeric;
  }
  if (!postedAt) return null;
  const parsed = new Date(postedAt);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid --posted-at date: ${postedAt}`);
  return Math.max(0, (now.getTime() - parsed.getTime()) / 3_600_000);
}

export async function createJobWorkspace(root, input) {
  const company = String(input.company || "").trim();
  const role = String(input.role || "").trim();
  if (!company) throw new Error("--company is required.");
  if (!role) throw new Error("--role is required.");
  if (!input.url) throw new Error("--url is required.");

  const candidate = await validateCandidate(root);
  if (!candidate.profile) {
    throw new Error("Initialize and complete candidate/profile.json before adding jobs.");
  }

  const canonicalUrl = canonicalizeUrl(input.url);
  const ledger = await loadLedger(root);
  const pairKey = jobPairKey(company, role);
  const duplicate = ledger.applications.find((item) =>
    item.canonicalUrl === canonicalUrl
    || jobPairKey(item.company, item.role) === pairKey
  );
  if (duplicate) {
    return {
      accepted: false,
      reason: "duplicate",
      duplicateOf: duplicate.id,
      application: duplicate
    };
  }

  const createdAt = new Date().toISOString();
  const urlHash = createHash("sha256").update(canonicalUrl).digest("hex").slice(0, 8);
  const id = `${slugify(company)}-${slugify(role)}-${urlHash}`.slice(0, 120);
  const applicationDir = join(root, "runtime", "applications", id);
  await mkdir(applicationDir, { recursive: true });

  const postingAgeHours = resolvePostingAgeHours(input);
  const maxPostingAgeHours = Number(candidate.profile.search?.maxPostingAgeHours || 24);
  const policyReasons = [];
  if (input.reposted === true) policyReasons.push("repost");
  if (postingAgeHours === null) policyReasons.push("posting-age-unknown");
  if (postingAgeHours !== null && postingAgeHours > maxPostingAgeHours) {
    policyReasons.push("posting-too-old");
  }
  const accepted = policyReasons.length === 0;
  const state = accepted ? "discovered" : "skipped";

  let descriptionPath = null;
  if (input.descriptionFile) {
    const source = pathFromRoot(root, input.descriptionFile);
    await assertReadableFile(source, "Job description");
    descriptionPath = join(applicationDir, "job-description.txt");
    await copyFile(source, descriptionPath);
  } else if (input.description) {
    descriptionPath = join(applicationDir, "job-description.txt");
    await writeFile(descriptionPath, String(input.description).trimEnd() + "\n", "utf8");
  }

  const documentPaths = {
    resumeTex: null,
    coverLetterTex: null,
    atsKeywords: null,
    answers: null,
    changeLog: null
  };
  if (accepted) {
    const resumeTex = join(applicationDir, "resume.tex");
    const coverLetterTex = join(applicationDir, "cover-letter.tex");
    const atsKeywords = join(applicationDir, "ats-keywords.json");
    const answers = join(applicationDir, "answers.json");
    const changeLog = join(applicationDir, "change-log.md");
    await copyFile(join(root, "candidate", "resume.tex"), resumeTex);
    await copyFile(join(root, "candidate", "cover-letter-template.tex"), coverLetterTex);
    await writeJson(atsKeywords, { required: [], preferred: [], usedTruthfully: [] });
    await writeJson(answers, {});
    await writeFile(
      changeLog,
      `# Tailoring change log\n\nCompany: ${company}\n\nRole: ${role}\n\n## Added or emphasized\n\n## Removed or compressed\n\n## Verification notes\n`,
      "utf8"
    );
    documentPaths.resumeTex = portablePath(root, resumeTex);
    documentPaths.coverLetterTex = portablePath(root, coverLetterTex);
    documentPaths.atsKeywords = portablePath(root, atsKeywords);
    documentPaths.answers = portablePath(root, answers);
    documentPaths.changeLog = portablePath(root, changeLog);
  }

  const job = {
    id,
    company,
    role,
    url: String(input.url),
    canonicalUrl,
    source: String(input.source || "LinkedIn"),
    postedAt: input.postedAt || null,
    postingAgeHours,
    reposted: input.reposted === true,
    maxPostingAgeHours,
    policyReasons,
    status: state,
    createdAt,
    updatedAt: createdAt,
    workspace: portablePath(root, applicationDir),
    descriptionPath: portablePath(root, descriptionPath),
    documentPaths
  };
  await writeJson(join(applicationDir, "job.json"), job);

  const application = {
    ...job,
    events: [{
      state,
      at: createdAt,
      note: accepted ? "Job workspace created." : `Policy skip: ${policyReasons.join(", ")}`
    }]
  };
  ledger.applications.push(application);
  await saveLedger(root, ledger);
  return {
    accepted,
    reason: accepted ? null : policyReasons.join(","),
    application
  };
}

function hasConfirmation(confirmation) {
  return Boolean(
    confirmation?.text?.trim()
    || confirmation?.url?.trim()
    || confirmation?.id?.trim()
  );
}

export async function recordApplication(root, input) {
  const state = String(input.state || "").trim();
  if (!APPLICATION_STATES.has(state)) {
    throw new Error(`Unsupported --state. Use one of: ${[...APPLICATION_STATES].join(", ")}`);
  }
  const ledger = await loadLedger(root);
  const application = ledger.applications.find((item) => item.id === input.job);
  if (!application) throw new Error(`Unknown job workspace: ${input.job}`);

  const confirmation = {
    text: String(input.confirmation || "").trim(),
    url: String(input.confirmationUrl || "").trim(),
    id: String(input.confirmationId || "").trim(),
    screenshot: portablePath(root, input.confirmationScreenshot)
  };
  if (state === "submitted" && !hasConfirmation(confirmation)) {
    throw new Error(
      "Refusing to record submitted without --confirmation, --confirmation-url, or --confirmation-id."
    );
  }

  for (const [label, value] of [
    ["Resume", input.resume],
    ["Cover letter", input.coverLetter],
    ["Confirmation screenshot", input.confirmationScreenshot],
    ["Answers", input.answersFile]
  ]) {
    if (value) await assertReadableFile(pathFromRoot(root, value), label);
  }

  let answers = null;
  if (input.answersFile) {
    answers = sanitizeAnswers(await readJson(pathFromRoot(root, input.answersFile)));
  }

  const at = new Date().toISOString();
  const event = {
    state,
    at,
    note: String(input.note || "").trim(),
    documents: {
      resume: portablePath(root, input.resume),
      coverLetter: portablePath(root, input.coverLetter)
    },
    answers,
    confirmation: state === "submitted" ? confirmation : null
  };
  application.status = state;
  application.updatedAt = at;
  application.events.push(event);
  if (state === "submitted") {
    application.submittedAt = at;
    application.confirmation = confirmation;
    application.documents = event.documents;
    application.answers = answers;
  }

  await saveLedger(root, ledger);
  const jobPath = join(root, application.workspace, "job.json");
  await writeJson(jobPath, {
    ...application,
    events: undefined
  });
  return application;
}

function markdownCell(value) {
  return String(value ?? "")
    .replaceAll("|", "\\|")
    .replace(/\r?\n/g, " ")
    .trim();
}

export async function generateReport(root) {
  const ledger = await loadLedger(root);
  const counts = Object.fromEntries(
    [...APPLICATION_STATES].map((state) => [
      state,
      ledger.applications.filter((item) => item.status === state).length
    ])
  );
  const lines = [
    "# Application audit",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    `Total tracked: ${ledger.applications.length}`,
    `Confirmed submitted: ${counts.submitted}`,
    "",
    "| Company | Role | Status | Posting age | URL | Confirmation |",
    "|---|---|---:|---:|---|---|"
  ];
  for (const item of ledger.applications) {
    const confirmation = item.confirmation?.text
      || item.confirmation?.id
      || item.confirmation?.url
      || "";
    lines.push(
      `| ${markdownCell(item.company)} | ${markdownCell(item.role)} | ${markdownCell(item.status)} | ${
        item.postingAgeHours === null ? "unknown" : `${Number(item.postingAgeHours).toFixed(1)}h`
      } | ${markdownCell(item.canonicalUrl)} | ${markdownCell(confirmation)} |`
    );
  }
  lines.push("", "## State counts", "");
  for (const [state, count] of Object.entries(counts)) {
    lines.push(`- ${state}: ${count}`);
  }
  lines.push("");

  const outputPath = join(root, "runtime", "application-report.md");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, lines.join("\n"), "utf8");
  return { outputPath, counts, total: ledger.applications.length };
}

function findOnPath(command) {
  const locator = process.platform === "win32" ? "where.exe" : "which";
  const result = spawnSync(locator, [command], { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) return null;
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || null;
}

function resolveLatexEngine(requested) {
  const candidate = requested || process.env.LATEX_ENGINE || "";
  if (candidate) {
    const absolute = isAbsolute(candidate) ? candidate : findOnPath(candidate);
    if (absolute && existsSync(absolute)) return absolute;
    throw new Error(`Requested LaTeX engine was not found: ${candidate}`);
  }
  return findOnPath("tectonic") || findOnPath("pdflatex");
}

export async function diagnoseEnvironment(root, overrides = {}) {
  const findExecutable = overrides.findExecutable || findOnPath;
  const nodeVersion = String(overrides.nodeVersion || process.versions.node);
  const nodeMajor = Number.parseInt(nodeVersion.split(".")[0], 10);
  const checks = [{
    id: "node",
    name: "Node.js",
    status: Number.isFinite(nodeMajor) && nodeMajor >= 20 ? "pass" : "fail",
    detail: `v${nodeVersion}; version 20 or newer is required`
  }];

  const candidate = await validateCandidate(root);
  checks.push({
    id: "candidate",
    name: "Candidate files",
    status: candidate.ok ? "pass" : "fail",
    detail: candidate.ok
      ? "private candidate profile and document sources are complete"
      : candidate.errors.join("; ") || "run npm run init and complete candidate/"
  });

  let latexEngine = overrides.latexEngine || null;
  let latexDetail = "";
  if (!latexEngine && process.env.LATEX_ENGINE) {
    try {
      latexEngine = resolveLatexEngine(process.env.LATEX_ENGINE);
    } catch (error) {
      latexDetail = error.message;
    }
  }
  if (!latexEngine) {
    latexEngine = findExecutable("tectonic") || findExecutable("pdflatex");
  }
  checks.push({
    id: "latex",
    name: "LaTeX",
    status: latexEngine ? "pass" : "fail",
    detail: latexEngine || latexDetail || "install Tectonic or pdflatex"
  });

  const skillPath = join(root, ".agents", "skills", "apply-jobs-end-to-end", "SKILL.md");
  const workflowPath = join(
    root,
    ".agents",
    "skills",
    "apply-jobs-end-to-end",
    "references",
    "workflow.md"
  );
  const skillComplete = existsSync(skillPath) && existsSync(workflowPath);
  checks.push({
    id: "skill",
    name: "Codex workflow",
    status: skillComplete ? "pass" : "fail",
    detail: skillComplete
      ? ".agents skill and operational workflow are present"
      : "the repository-local Codex skill is incomplete"
  });

  const ignorePath = join(root, ".gitignore");
  let ignoreText = "";
  if (existsSync(ignorePath)) ignoreText = await readFile(ignorePath, "utf8");
  const privatePathsIgnored = /(?:^|\n)candidate\/\s*(?:\n|$)/.test(ignoreText)
    && /(?:^|\n)runtime\/\s*(?:\n|$)/.test(ignoreText);
  checks.push({
    id: "privacy",
    name: "Private paths",
    status: privatePathsIgnored ? "pass" : "fail",
    detail: privatePathsIgnored
      ? "candidate/ and runtime/ are excluded from Git"
      : ".gitignore must exclude candidate/ and runtime/"
  });

  checks.push({
    id: "chrome",
    name: "Chrome control",
    status: "external",
    detail: "provided by the ChatGPT desktop app; verify the Chrome plugin and signed-in sessions in the app"
  });

  return {
    ok: checks.every((check) => check.status === "pass" || check.status === "external"),
    checks
  };
}

export async function compileLatex(root, input) {
  const texPath = pathFromRoot(root, input.tex);
  if (!texPath) throw new Error("--tex is required.");
  await assertReadableFile(texPath, "LaTeX source");

  const outputPath = pathFromRoot(
    root,
    input.output || join(dirname(texPath), `${basename(texPath, ".tex")}.pdf`)
  );
  const outputDir = dirname(outputPath);
  await mkdir(outputDir, { recursive: true });

  const engine = resolveLatexEngine(input.engine);
  if (!engine) {
    throw new Error(
      "No LaTeX engine found. Install Tectonic or pdflatex, or set LATEX_ENGINE."
    );
  }

  const engineName = basename(engine).toLowerCase();
  const args = engineName.startsWith("tectonic")
    ? ["--keep-logs", "--outdir", outputDir, texPath]
    : [
        "-interaction=nonstopmode",
        "-halt-on-error",
        `-output-directory=${outputDir}`,
        texPath
      ];
  const result = spawnSync(engine, args, {
    cwd: dirname(texPath),
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) {
    const diagnostic = `${result.stdout || ""}\n${result.stderr || ""}`.trim().slice(-4000);
    throw new Error(`LaTeX compilation failed.\n${diagnostic}`);
  }

  const generatedPath = join(outputDir, `${basename(texPath, ".tex")}.pdf`);
  if (!existsSync(generatedPath)) {
    throw new Error(`LaTeX engine completed without producing ${generatedPath}`);
  }
  if (resolve(generatedPath) !== resolve(outputPath)) {
    await copyFile(generatedPath, outputPath);
  }
  return { engine, outputPath, log: String(result.stdout || "").slice(-2000) };
}
