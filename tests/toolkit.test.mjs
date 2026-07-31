import test from "node:test";
import assert from "node:assert/strict";
import {
  access,
  cp,
  mkdir,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";
import { join } from "node:path";
import {
  canonicalizeUrl,
  createJobWorkspace,
  diagnoseEnvironment,
  generateReport,
  initializeCandidate,
  loadLedger,
  recordApplication,
  sanitizeAnswers,
  validateCandidate
} from "../src/core.mjs";

const repositoryRoot = process.cwd();
let testRoot;

async function completeCandidate(root) {
  const candidateDir = join(root, "candidate");
  const profile = {
    identity: {
      fullName: "Example Candidate",
      email: "candidate@example.com",
      phone: "+1 555 555 5555",
      location: "Toronto, Ontario, Canada",
      linkedin: "https://www.linkedin.com/in/example",
      portfolio: "https://example.com"
    },
    eligibility: {
      authorizedToWork: true,
      needsSponsorship: false,
      countries: ["Canada"],
      currentlyEnrolled: true,
      graduationDate: "2027-05"
    },
    search: {
      keywords: ["intern", "internship"],
      targetTitles: ["Software Engineer Intern"],
      locations: ["Toronto", "Remote"],
      maxPostingAgeHours: 24,
      internshipOnly: true,
      excludeReposts: true,
      excludedCompanies: []
    },
    defaults: {},
    answers: {}
  };
  await writeFile(join(candidateDir, "profile.json"), `${JSON.stringify(profile, null, 2)}\n`);
  await writeFile(join(candidateDir, "facts.md"), "# Facts\n\n- Verified JavaScript project.\n");
  await writeFile(
    join(candidateDir, "resume.tex"),
    "\\documentclass{article}\\begin{document}Example Candidate\\end{document}\n"
  );
  await writeFile(
    join(candidateDir, "cover-letter-sample.md"),
    "# Style\n\nDirect, specific, and factual.\n"
  );
}

test.beforeEach(async () => {
  testRoot = join(
    repositoryRoot,
    `runtime-test-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
  await mkdir(testRoot, { recursive: true });
  await cp(join(repositoryRoot, "candidate.example"), join(testRoot, "candidate.example"), {
    recursive: true
  });
});

test.afterEach(async () => {
  const expectedPrefix = join(repositoryRoot, "runtime-test-");
  assert.ok(testRoot.startsWith(expectedPrefix));
  await rm(testRoot, { recursive: true, force: true });
});

test("candidate initialization is non-destructive and validation finds placeholders", async () => {
  const first = await initializeCandidate(testRoot);
  const second = await initializeCandidate(testRoot);
  assert.equal(first.created, true);
  assert.equal(second.created, false);

  const incomplete = await validateCandidate(testRoot);
  assert.equal(incomplete.ok, false);
  assert.ok(incomplete.errors.some((error) => error.includes("placeholder")));

  await completeCandidate(testRoot);
  const complete = await validateCandidate(testRoot);
  assert.equal(complete.ok, true, complete.errors.join("\n"));
});

test("job workspaces enforce posting age, repost policy, and deduplication", async () => {
  await initializeCandidate(testRoot);
  await completeCandidate(testRoot);
  const descriptionPath = join(testRoot, "description.txt");
  await writeFile(descriptionPath, "Build production JavaScript systems.\n");

  const first = await createJobWorkspace(testRoot, {
    company: "Example Corp",
    role: "Software Engineer Intern",
    url: "https://jobs.example.com/123?utm_source=linkedin&trk=abc",
    postingAgeHours: 3,
    descriptionFile: descriptionPath
  });
  assert.equal(first.accepted, true);
  assert.equal(first.application.status, "discovered");
  await access(join(testRoot, first.application.documentPaths.resumeTex));
  await access(join(testRoot, first.application.documentPaths.coverLetterTex));

  const duplicate = await createJobWorkspace(testRoot, {
    company: "Example Corp",
    role: "Software Engineer Intern",
    url: "https://jobs.example.com/123?utm_source=other",
    postingAgeHours: 1
  });
  assert.equal(duplicate.accepted, false);
  assert.equal(duplicate.reason, "duplicate");

  const repost = await createJobWorkspace(testRoot, {
    company: "Other Corp",
    role: "Product Intern",
    url: "https://jobs.example.com/456",
    postingAgeHours: 2,
    reposted: true
  });
  assert.equal(repost.accepted, false);
  assert.equal(repost.application.status, "skipped");
  assert.ok(repost.application.policyReasons.includes("repost"));

  const old = await createJobWorkspace(testRoot, {
    company: "Old Corp",
    role: "Data Intern",
    url: "https://jobs.example.com/789",
    postingAgeHours: 25
  });
  assert.equal(old.accepted, false);
  assert.ok(old.application.policyReasons.includes("posting-too-old"));
});

test("confirmed submissions are fail-closed and sensitive answers are redacted", async () => {
  await initializeCandidate(testRoot);
  await completeCandidate(testRoot);
  const created = await createJobWorkspace(testRoot, {
    company: "Example Corp",
    role: "Software Engineer Intern",
    url: "https://jobs.example.com/confirmed",
    postingAgeHours: 1
  });
  const jobId = created.application.id;

  await assert.rejects(
    recordApplication(testRoot, { job: jobId, state: "submitted" }),
    /Refusing to record submitted/
  );

  const resume = join(testRoot, "resume.pdf");
  const coverLetter = join(testRoot, "cover-letter.pdf");
  const answers = join(testRoot, "answers.json");
  await writeFile(resume, "test resume");
  await writeFile(coverLetter, "test letter");
  await writeFile(
    answers,
    JSON.stringify({
      authorizedToWork: "Yes",
      password: "never-store-this",
      nested: { otpCode: "123456", yearsOfExperience: "2" }
    })
  );

  const result = await recordApplication(testRoot, {
    job: jobId,
    state: "submitted",
    confirmation: "Application received",
    confirmationUrl: "https://jobs.example.com/confirmed/success",
    resume,
    coverLetter,
    answersFile: answers
  });
  assert.equal(result.status, "submitted");
  assert.equal(result.answers.password, "[REDACTED]");
  assert.equal(result.answers.nested.otpCode, "[REDACTED]");
  assert.equal(result.answers.nested.yearsOfExperience, "2");

  const ledger = await loadLedger(testRoot);
  assert.equal(ledger.applications[0].status, "submitted");

  const report = await generateReport(testRoot);
  assert.equal(report.counts.submitted, 1);
  const reportText = await readFile(report.outputPath, "utf8");
  assert.match(reportText, /Application received/);
});

test("URL canonicalization removes tracking parameters", () => {
  const first = canonicalizeUrl("https://WWW.LinkedIn.com/jobs/view/123/?trk=abc&utm_source=x");
  const second = canonicalizeUrl("https://www.linkedin.com/jobs/view/123");
  assert.equal(first, second);
});

test("answer sanitizer recursively redacts secret-bearing fields", () => {
  assert.deepEqual(
    sanitizeAnswers({
      email: "candidate@example.com",
      verificationCode: "999999",
      nested: [{ token: "secret", answer: "Yes" }]
    }),
    {
      email: "candidate@example.com",
      verificationCode: "[REDACTED]",
      nested: [{ token: "[REDACTED]", answer: "Yes" }]
    }
  );
});

test("environment doctor distinguishes local prerequisites from external Chrome control", async () => {
  await initializeCandidate(testRoot);
  await completeCandidate(testRoot);
  await mkdir(
    join(testRoot, ".agents", "skills", "apply-jobs-end-to-end", "references"),
    { recursive: true }
  );
  await writeFile(
    join(testRoot, ".agents", "skills", "apply-jobs-end-to-end", "SKILL.md"),
    "# Test skill\n"
  );
  await writeFile(
    join(
      testRoot,
      ".agents",
      "skills",
      "apply-jobs-end-to-end",
      "references",
      "workflow.md"
    ),
    "# Test workflow\n"
  );
  await writeFile(join(testRoot, ".gitignore"), "candidate/\nruntime/\n");
  const latexEngine = join(testRoot, process.platform === "win32" ? "tectonic.exe" : "tectonic");
  await writeFile(latexEngine, "");
  const previousLatexEngine = process.env.LATEX_ENGINE;
  process.env.LATEX_ENGINE = latexEngine;

  let result;
  try {
    result = await diagnoseEnvironment(testRoot, {
      nodeVersion: "22.11.0",
      findExecutable: () => null
    });
  } finally {
    if (previousLatexEngine === undefined) {
      delete process.env.LATEX_ENGINE;
    } else {
      process.env.LATEX_ENGINE = previousLatexEngine;
    }
  }

  assert.equal(result.ok, true);
  assert.equal(result.checks.find((check) => check.id === "candidate").status, "pass");
  assert.equal(result.checks.find((check) => check.id === "latex").status, "pass");
  assert.equal(result.checks.find((check) => check.id === "chrome").status, "external");
});
