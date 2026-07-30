# Source-system audit

This template was separated from `TAShaikhh/SalishaApply` on July 30, 2026.

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

The source suite was run again during separation. 41 of 42 tests passed. Those
tests prove local mock flows for Greenhouse and Ashby, field discovery and
filling, uploads, confirmed-submission auditing, deduplication, posting-age and
repost policy, internship and transcript policy, prompt-injection detection,
answer workspaces, and local credential metadata.

The remaining integration test failed because the edited source controller did
not become healthy. Inspection showed that its HTTP listener was nested inside
the request callback, so the server never began listening. That controller was
not used for the live applications and was not copied into this template.

## Not used or not proven

### Current edited AutoApply controller

The source working tree contained large uncommitted edits to
`autoapply/src/controller/server.js`. Syntax checks passed, but the automatic
endpoint integration test failed because the server never started. The edits
also changed control flow and CAPTCHA states. That file was not used as the
basis of this template.

### AI CAPTCHA bypass

The AutoApply test named `captcha_tools` only verifies creation of a local
challenge metadata bundle without AI solver modules. The `ai-captcha-bypass`
folder was not wired into the working application controller, and no live
CAPTCHA-solving path was proven. It is intentionally excluded.

### Fully unattended guarantee

Ordinary forms with known factual answers can run without interaction after
setup. Universal zero-input operation is not a valid guarantee because sites
can present CAPTCHA, device verification, personal attestations, missing
documents, ambiguous questions, or changed interfaces.
