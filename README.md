# SalishaApply Template

This repository separates the reproducible parts of the job-application
workflow from one person's private files and from experimental browser code.
It is designed to be used by Codex with its Chrome control capability.

## What actually performs each part

| Responsibility | Component | Status |
|---|---|---|
| Search LinkedIn and inspect listings | Codex controlling the user's signed-in Chrome | Working, but external to this repository |
| Open employer career sites, fill forms, upload PDFs, and submit | Codex controlling Chrome | Working on ordinary web forms; site-specific |
| Tailor truthful resume and cover-letter content | Codex using the candidate truth files and this skill | Working |
| Compile LaTeX documents | This repository's CLI plus Tectonic or `pdflatex` | Working locally |
| Deduplicate jobs and preserve per-job artifacts | This repository's CLI | Working locally |
| Record submitted answers, documents, and confirmation evidence | This repository's CLI | Working locally |
| CAPTCHA or anti-bot bypass | None | Not implemented or claimed |

The live workflow does **not** depend on the experimental `autoapply`
controller or the `ai-captcha-bypass` folder from the source project. LinkedIn
search and real-site navigation are performed through the Codex host's Chrome
capability. That host capability is not JavaScript source code that can be
copied into this repository.

## Requirements

- Windows, macOS, or Linux
- Node.js 20 or newer
- Tectonic (recommended) or a working `pdflatex` installation
- Codex Desktop with Chrome control enabled
- A Chrome profile signed in to LinkedIn and, when needed, the candidate's
  email provider

No npm dependencies are required.

## One-time setup

```powershell
git clone https://github.com/TAShaikhh/SalishaApply-Template.git
cd SalishaApply-Template
npm run init
```

Edit every file in `candidate/`:

- `profile.json` contains contact details, eligibility answers, search rules,
  and reusable factual answers.
- `facts.md` is the only source for experience, education, skills, projects,
  dates, and metrics.
- `resume.tex` is the candidate's master LaTeX resume.
- `cover-letter-sample.md` establishes the candidate's preferred voice.
- `cover-letter-template.tex` establishes the visual layout.

Then validate:

```powershell
npm run doctor
npm run validate
npm test
```

If Windows PowerShell reports that `npm.ps1` cannot be loaded because script
execution is disabled, use the command shim instead:

```powershell
npm.cmd run validate
npm.cmd test
```

Install the repository-local Codex skill by keeping the repository open as the
workspace, or copy `.codex/skills/apply-jobs-end-to-end` into the user's Codex
skills directory.

## Use

Ask Codex:

> Use `$apply-jobs-end-to-end` to find internships posted in the last 24 hours,
> tailor truthful PDFs, apply through final submission, and update the audit.

The skill creates a workspace for every listing:

```powershell
npm run new-job -- --company "Example Corp" --role "Software Engineer Intern" --url "https://example.com/jobs/123" --posting-age-hours 3 --description-file "job-description.txt"
```

Compile a tailored document:

```powershell
npm run compile -- --tex "runtime/applications/example-corp-software-engineer-intern-abc12345/resume.tex" --output "runtime/applications/example-corp-software-engineer-intern-abc12345/resume.pdf"
```

Record a confirmed submission:

```powershell
npm run record -- --job "example-corp-software-engineer-intern-abc12345" --state submitted --confirmation "Application received" --confirmation-url "https://example.com/jobs/123/confirmation" --resume "runtime/applications/example-corp-software-engineer-intern-abc12345/resume.pdf" --cover-letter "runtime/applications/example-corp-software-engineer-intern-abc12345/cover-letter.pdf"
npm run report
```

`submitted` is fail-closed: the CLI refuses that state without confirmation
text, an employer confirmation URL, or a confirmation identifier.

## Automation boundary

After setup, ordinary applications whose answers are already in
`candidate/profile.json` can be handled without user input. No implementation
can honestly guarantee zero interaction on every site. CAPTCHA, device
verification, consent requiring the person to attest personally, unavailable
documents, ambiguous factual questions, or a changed site may interrupt an
application. This template records those cases as blocked or skipped; it does
not bypass security controls.

OTP retrieval may use an explicitly authorized, signed-in mailbox or connector.
Codes and credentials must never be written to the repository, runtime ledger,
screenshots, or chat output.

## Privacy

`candidate/` and `runtime/` are ignored by Git. Do not remove those ignore
rules. The example files contain placeholders only. Chrome's password manager
or the operating system's credential store should hold credentials.

See [Replication guide](docs/REPLICATION.md),
[Architecture](docs/ARCHITECTURE.md), and
[Source audit](docs/SOURCE-AUDIT.md) for the exact separation.
