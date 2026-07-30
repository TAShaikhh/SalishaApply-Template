# Source-system audit

This template was separated from `TAShaikhh/SalishaApply` on July 30, 2026.

## Verification snapshot

The separated tree was verified again on July 30, 2026:

- `npm.cmd test` in this repository passed all 6 tests.
- The example resume and cover-letter LaTeX sources both compiled to PDF with
  Tectonic.
- `npm.cmd run studio:test` in the source Career Ops project passed every
  Resume Studio test.
- `node --check src/controller/server.js` in the source AutoApply project
  passed, confirming that the edited controller is syntactically valid.
- `npm.cmd test` in the source AutoApply project passed 40 of 42 tests. The
  two failures were the automatic endpoint and package integration tests
  described below.

These checks verify the local toolkit and document workflow. They do not turn
the external Codex Chrome capability into repository source code, and they do
not prove CAPTCHA solving or universal unattended submission.

## Proven components

### Codex plus Chrome

The actual live LinkedIn searches and employer-site submissions were performed
by Codex through the user's existing signed-in Chrome browser. This is a host
capability, not the `autoapply` controller.

### Career Ops Resume Studio

The local Resume Studio test suite passed all tests during separation. Covered
behavior included keyword extraction, job-description normalization, stable
scorecards, truthful profile tailoring, unsupported-technology rejection,
LaTeX rendering, cover-letter header layout, and document compression.

This clean template packages the workflow and generic document inputs rather
than the original application, its personal data, or its dependency tree.

### AutoApply modules

The source suite was run again during separation. 40 of 42 tests passed. Those
tests prove local mock flows for Greenhouse and Ashby, field discovery and
filling, uploads, confirmed-submission auditing, deduplication, posting-age and
repost policy, internship and transcript policy, prompt-injection detection,
answer workspaces, and local credential metadata.

The automatic endpoint integration test failed because the edited source
controller did not become healthy. Inspection showed that its server creation
and listener are nested inside `makeObservation()`, so `startController()`
returns without starting the HTTP server. Most of the observation pipeline is
also nested under the CAPTCHA-detected branch, and that branch references an
undefined `automationReady` value. The controller passes a syntax check but is
not operational.

The package integration test failed while counting generated PDF pages because
the installed `pdf-parse` module no longer matched the call site:
`TypeError: pdfParse is not a function`. The separate Resume Studio test suite
still passed every test. Neither source integration failure affects this
template because the broken controller and the source dependency tree were not
copied.

## Not used or not proven

### Current edited AutoApply controller

The source working tree contained large uncommitted edits to
`autoapply/src/controller/server.js`. Syntax checks passed, but the automatic
endpoint integration test failed because the server never started. The edits
also changed control flow and CAPTCHA states. That file was not used as the
basis of this template.

### AI CAPTCHA bypass

The AutoApply test named `captcha_tools` only verifies creation of a local
challenge metadata bundle without AI solver modules. In the current edited
controller, `captureCaptchaBundle` is imported but never called. The protocol
accepts a `captcha` action name, but the controller has no action endpoint that
executes it. The `ai-captcha-bypass` folder remains a separate demo project and
is not wired into the controller, Codex Chrome control, or the confirmed live
application workflow. No live CAPTCHA-solving path is active or proven, so it
is intentionally excluded.

### Fully unattended guarantee

Ordinary forms with known factual answers can run without interaction after
setup. Universal zero-input operation is not a valid guarantee because sites
can present CAPTCHA, device verification, personal attestations, missing
documents, ambiguous questions, or changed interfaces.
