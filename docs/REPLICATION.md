# Replication guide

This guide reproduces the workflow that was actually used. It does not replace
the ChatGPT desktop app's Codex Chrome control with an unrelated scraper or
claim that the source project's experimental CAPTCHA code powers applications.

## Components

| Layer | Installed where | Purpose |
|---|---|---|
| ChatGPT desktop app with Codex | User's machine | Orchestrates the batch and follows the repository skill |
| Chrome control | ChatGPT desktop app capability | Uses the user's visible, signed-in Chrome tabs |
| This repository | Local clone | Candidate truth, LaTeX sources, deduplication, artifacts, and audit |
| Tectonic or pdflatex | User's machine | Compiles job-specific PDFs |
| LinkedIn and employer sessions | Chrome profile | Authentication owned by the user |

The repository is intentionally dependency-free JavaScript. Browser control is
external because that is the path used in practice.

## 1. Clone and initialize

```powershell
git clone https://github.com/TAShaikhh/SalishaApply-Template.git
cd SalishaApply-Template
npm.cmd run init
```

Replace every placeholder under `candidate/`:

- `profile.json`: identity, eligibility, search rules, and reusable answers;
- `facts.md`: verified experience, education, projects, skills, dates, and
  metrics;
- `resume.tex`: the master resume design and content;
- `cover-letter-sample.md`: the candidate's preferred voice;
- `cover-letter-template.tex`: the cover-letter layout.

These files stay local because `candidate/` is excluded from Git.

## 2. Install a LaTeX engine

Install Tectonic or a TeX distribution that provides `pdflatex`. If the
executable is not on `PATH`, set `LATEX_ENGINE` to its absolute path.

Run the preflight:

```powershell
npm.cmd run doctor
npm.cmd run validate
npm.cmd test
```

`doctor` verifies Node.js, candidate inputs, a LaTeX engine, the Codex skill,
and privacy ignore rules. Chrome control is reported as `EXTERNAL` because only
the ChatGPT desktop app can verify that capability.

## 3. Install and prepare Chrome control

1. Install the ChatGPT desktop app and select Codex, or turn on ChatGPT Work.
2. Open the Plugins Directory and install **Chrome**.
3. Follow the setup flow to install the official ChatGPT Chrome extension,
   approve its requested permissions, and confirm the side panel loads.
4. Use the same Chrome profile for the extension, LinkedIn, and employer
   application sessions.
5. In Chrome's extension manager, open the ChatGPT extension's **Details** page
   and enable **Allow access to file URLs** so PDFs can be uploaded.

Then:

1. Sign in to LinkedIn.
2. Sign in to the email account used for employer verification, if authorized.
3. Allow LinkedIn and intended employer sites when Chrome control requests
   access. **Allow for all sites** can remove recurring site-access prompts, but
   it does not waive separate confirmations for consequential actions.
4. Keep password storage in Chrome or the operating-system credential store.
5. Do not copy cookies, passwords, OTPs, or session files into this repository.

This is one-time environment setup, not part of each application.

## 4. Open the clone in the ChatGPT desktop app

The repository includes
`.agents/skills/apply-jobs-end-to-end/SKILL.md`. Start a Codex task in the clone
and use a request such as:

> Use `$apply-jobs-end-to-end`. Search LinkedIn for roles matching
> `candidate/profile.json`, enforce the configured posting-age and repost rules,
> tailor truthful LaTeX resume and cover-letter PDFs, complete ordinary
> application forms through my signed-in Chrome session, submit where the site
> permits it, and maintain the confirmation-backed audit.

Codex then uses the private candidate files and the operational workflow in the
skill. Each job receives its own directory under `runtime/applications/`.

## 5. Verify results

Generate the local report:

```powershell
npm.cmd run report
```

Only applications with employer confirmation evidence are counted as
`submitted`. Review `runtime/application-report.md` and the per-job workspaces
for documents, non-secret answers, change logs, and confirmation screenshots.

## What can be unattended

After one-time setup, an ordinary application can proceed without routine user
input when:

- Chrome is already signed in;
- every required answer exists in the candidate truth files;
- the form accepts normal browser interaction and PDF uploads;
- no unavailable document or personal attestation is required;
- the site does not present a security challenge;
- the browser host permits the final action.

## What cannot be guaranteed

No implementation can truthfully promise zero input on every LinkedIn or
employer workflow. CAPTCHA, anti-bot checks, device verification, changed page
markup, ambiguous factual questions, personal attestations, or unavailable
documents can stop an application. This template records the application as
blocked or skipped and continues to other eligible jobs; it does not bypass
security controls or falsely record a submission.
