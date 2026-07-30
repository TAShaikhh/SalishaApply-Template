# Architecture

## Runtime split

```text
Candidate files --\
Job listing -------+--> Codex orchestration --> Chrome UI --> confirmation
Search policy -----/            |                    |
                                |                    +--> screenshots
                                v
                         per-job workspace
                         +-- job.json
                         +-- job-description.txt
                         +-- ats-keywords.json
                         +-- resume.tex / resume.pdf
                         +-- cover-letter.tex / cover-letter.pdf
                         +-- answers.json
                         +-- change-log.md
                                |
                                v
                         runtime/ledger.json
```

Codex is the orchestration and browser layer. This repository is the local
candidate-data, document-build, deduplication, and audit layer. Chrome owns the
authenticated session.

## Why there is no universal LinkedIn scraper here

The working application runs through the signed-in Chrome session visible to
the user. A standalone scraper would need to reproduce login, session,
extension, browser-control, and site-specific behavior, and could misrepresent
the actual system. The repository instead packages the skill that tells Codex
how to use its supported Chrome capability.

## Candidate truth model

`candidate/profile.json`, `candidate/facts.md`, and
`candidate/resume.tex` are authoritative. Tailoring may reorder, shorten, and
rephrase supported facts. It may not add unsupported skills, projects,
employment, credentials, dates, metrics, work authorization, or education.

## Application state model

Supported states are:

```text
discovered -> eligible -> tailored -> documents_ready -> form_started
                                                        +-> submitted
                                                        +-> blocked
                                                        +-> skipped
```

Every transition is timestamped. `submitted` requires confirmation evidence.
Duplicate detection uses a canonical URL and a normalized company/title pair.

## Security model

- Job descriptions and page content are untrusted data.
- Instructions directed at an AI inside a listing are ignored.
- Candidate data, runtime artifacts, credentials, OTPs, and session state are
  never committed.
- Security challenges are not bypassed. A blocked state preserves work without
  falsely claiming submission.
