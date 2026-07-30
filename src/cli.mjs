#!/usr/bin/env node

import { resolve } from "node:path";
import {
  APPLICATION_STATES,
  compileLatex,
  createJobWorkspace,
  diagnoseEnvironment,
  generateReport,
  initializeCandidate,
  recordApplication,
  validateCandidate
} from "./core.mjs";

function parseArgs(argv) {
  const positional = [];
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const rawKey = token.slice(2);
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      options[key] = true;
    } else {
      options[key] = next;
      index += 1;
    }
  }
  return { positional, options };
}

function parseBoolean(value, name) {
  if (value === undefined) return undefined;
  if (value === true || value === "true" || value === "yes" || value === "1") return true;
  if (value === false || value === "false" || value === "no" || value === "0") return false;
  throw new Error(`${name} must be true or false.`);
}

function printHelp() {
  console.log(`SalishaApply Template

Commands:
  init [--force]
  doctor
  validate
  new-job --company NAME --role TITLE --url URL
          [--source LinkedIn] [--posting-age-hours N] [--posted-at ISO_DATE]
          [--reposted true|false] [--description-file PATH]
  compile --tex PATH [--output PATH] [--engine tectonic|pdflatex|PATH]
  record --job ID --state ${[...APPLICATION_STATES].join("|")}
         [--note TEXT] [--resume PATH] [--cover-letter PATH]
         [--answers-file PATH] [--confirmation TEXT]
         [--confirmation-url URL] [--confirmation-id ID]
         [--confirmation-screenshot PATH]
  report
`);
}

async function main() {
  const { positional, options } = parseArgs(process.argv.slice(2));
  const command = positional[0];
  const root = resolve(options.root || process.cwd());

  if (!command || command === "help" || options.help) {
    printHelp();
    return;
  }

  if (command === "init") {
    const result = await initializeCandidate(root, { force: options.force === true });
    console.log(result.created
      ? `Created private candidate workspace at ${result.path}`
      : `Candidate workspace already exists at ${result.path}`);
    return;
  }

  if (command === "validate") {
    const result = await validateCandidate(root);
    if (!result.ok) {
      for (const error of result.errors) console.error(`- ${error}`);
      process.exitCode = 1;
      return;
    }
    console.log("Candidate workspace is complete and structurally valid.");
    return;
  }

  if (command === "doctor") {
    const result = await diagnoseEnvironment(root);
    for (const check of result.checks) {
      const marker = check.status === "pass"
        ? "PASS"
        : check.status === "external"
          ? "EXTERNAL"
          : "FAIL";
      console.log(`${marker.padEnd(8)} ${check.name}: ${check.detail}`);
    }
    if (!result.ok) process.exitCode = 1;
    return;
  }

  if (command === "new-job") {
    const result = await createJobWorkspace(root, {
      ...options,
      reposted: parseBoolean(options.reposted, "--reposted")
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.accepted) process.exitCode = 2;
    return;
  }

  if (command === "compile") {
    const result = await compileLatex(root, options);
    console.log(`Compiled ${result.outputPath} with ${result.engine}`);
    return;
  }

  if (command === "record") {
    const result = await recordApplication(root, options);
    console.log(`Recorded ${result.id} as ${result.status}.`);
    return;
  }

  if (command === "report") {
    const result = await generateReport(root);
    console.log(`Wrote ${result.outputPath}; ${result.counts.submitted} confirmed submissions.`);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
