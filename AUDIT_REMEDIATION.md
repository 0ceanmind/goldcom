# Goldcom audit remediation

Implemented against `aed915b28564062aa16ff9b66500ac49207450f7` on 4 November 2026 in `D:\Codex\Goldcom\goldcom`.

The verified defects have code changes and regression coverage. The source audit remains a historical assessment of the earlier commit; its original file in the Claude workspace was not edited. Repository commits track publication of these changes. Updating an existing running installation remains a separate step.

## Release-blocking controls

| Finding | Change | Validation |
|---|---|---|
| F1 Windows CLI | Resolve npm shims to the actual executable/Node entry point and launch without a shell. MCP registration uses the same resolver. | Live authenticated Claude structured-JSON call succeeded; CLI reported $0.009936 usage under a $0.25 cap. |
| F2 truthful status | Ready requires final review of the exact content, score ≥8, no blocker issues, clean error-level lint and complete visuals. Otherwise Needs attention lists the reasons. Revisions and resumes clear old video references. | Regression checks for rejected reviews, false ship verdicts, stale video and cancellation; UI checks for blocked drafts. |
| F3 app integrity | Empty phones show a conspicuous anonymous draft panel with no invented person/balance. Missing 2D/3D phone imagery and empty images block export. | Unit, HTTP and editor export checks. |
| F4 edit preservation | Every save versions the prior document. Editor-owned builds fork. Revisions retain manually changed slides and supply their context to the director. History restores as a new revision. | Manual-slide preservation, fork, version restoration and UI history checks. |
| F7 provider choice | Explicit selection attempts only that provider. Fatal authentication/billing errors stop automatic fallback too. | Routing checks and source inspection; no paid image-provider calls. |
| F10 capture safeguards | Refuse sensitive-data steps, payment/verification controls and unlabelled coordinate taps. Recheck the live labelled control before replay. Sensitive footage is excluded from the director and builds. | Simulated control checks; **real-device acceptance remains required**. |
| F11 scene execution | Parse metadata with Acorn; never import scene source in the server. New/repaired source is staged for human source review, with a digest preventing approval of changed source. | Parser side-effect test, import-bypass rejection, proposal/approval checks and rendering after approval. Approved browser code is trusted, not sandboxed. |
| F13 local request protection | Check Host, Origin and Fetch Metadata. Require a per-install bearer token for API writes. Browser and MCP clients send it. | HTTP/native-token, cross-site and rebinding tests. This is a local application, not a multi-user authentication service. |

## Reliability and product controls

| Finding | Change and evidence |
|---|---|
| F5 concurrent saves | Cross-process filesystem locks and revision preconditions reject stale writes with 409. Unique temporary files, rename retries and cleanup protect atomic writes. The editor offers Save my copy. Five concurrent saves produce one success and four conflicts in both unit and HTTP tests. |
| F6 incomplete lint | Normalize Arabic diacritics/digits; check additional text-bearing layers; flag customer counts, forecasts, fee/regulatory claims and the missed brand spelling. All eight previously missed examples are detected. Editor, MCP PNG and server export paths gate errors. |
| F8 key deletion | Forward deletion markers to the settings merge instead of deleting them before the merge. Unit and HTTP tests confirm removal. |
| F9 missing lessons | Production prompts include quoted design lessons beneath brand/fact rules. Templates stop adding sparkles automatically. Prompt-content tests confirm the lessons arrive. |
| F12 cost controls | Configurable production budget; remaining budget passed to CLI calls and reduced across retries, capture and director attempts. API calls require configured model rates and reserve for maximum output. Costs are displayed as usage estimates. These controls do not prove actual provider invoices or guarantee billing if configured rates are wrong. |
| M1 review evidence | Larger review images include entry, settled, end and transition samples. Review still uses sampled frames; it is not continuous human motion review. |
| M2 review edits | Filter edits against the target template, discard incompatible replacement fields, refuse removing every scene, and review final edits before approval. Tests cover replacement and empty-scene rejection. |
| M3 schema validation | Ajv validates structured replies for both engines. Wrong-schema results are rejected. |
| M4 limits/retries | Bounded retry/backoff and a resumable limit message replace unhandled CLI rate errors. Default stage timeout is five minutes. Failed attempts share the remaining budget. |
| M5 event-loop blocking | Version discovery is asynchronous and cached; ordinary model calls do not run version discovery. |
| M6 environment inheritance | Remove session variables and credential-like environment entries from CLI children. Explicit API-key use is separate. Regression checks cover secret/session removal. |
| M7 export recovery | Persist export jobs; interrupted jobs explicitly request a new export. Cancellation closes frame pages, cleans temporary output and cannot fall through to Ready. Individual frame evaluation has a 45-second timeout. Unit checks cover persistence/cancellation; MP4 export remains covered by integration suites. |
| M8 updater | Verify an SSH commit signature against an explicitly trusted allowed-signers file before applying changes. Restore tracked edits before building and retain a backup stash. Git rollback restores earlier code on failure. Plain archive updates are disabled instead of promising unsupported rollback. A local signed Git fixture passes verification and an unsigned fixture fails. A real production upgrade/rollback was not executed. |
| M9 readiness | UI says Configured rather than claiming authentication. Production preflight checks Claude login status or API credentials/rates before accepting work. HTTP tests verify missing credentials create no job. |
| M10 disclaimers | Only carousels can share a final disclaimer; independently exported Story frames retain per-frame checks. Arabic-Indic prices are included. |
| M11 UI/workflow | Correct All designs routing; add editable briefs, Rebuild with footage, version history, conflict recovery and Needs attention reasons. New revision feedback replaces earlier revision instructions. Four new editor scenarios cover campaign controls, history, blocked export and editable briefs. |
| M12 setup/tests | MCP setup uses the safe CLI resolver. Integration runners create disposable data/module/knowledge directories and never use the owner's server. New scene smoke checks follow the proposal approval lifecycle. The actual user-level registration script was not run. |
| M13 repair triggers | Renderer telemetry only records errors. Explicit director tasks use a restricted MCP tool set, no built-in shell/file tools, bounded turns and a shared attempt budget. Recursive paid-job/import tools are not exposed to that profile. |
| M14 lesson instructions | Reject multiline/override-style lesson submissions and quote preferences below authoritative rules. Research-file access enforces a directory boundary. Prompt handling reduces instruction authority; it is not a proof that all natural-language injection is detectable. |
| M15 screenshot destinations | Reject private/metadata addresses and credentials in URLs, recheck redirects/subresources and validate DNS during the actual outbound connection. Specific development origins require an explicit Settings entry; studio API screenshots remain blocked. HTTP/private-address tests pass. |
| M16 request validation | Malformed JSON returns 400; oversized JSON returns 413; invalid modes/preferences/scales are rejected. HTTP tests cover JSON, export modes and input rejection. |
| M17 product facts | Add an approved-fact register with sources, approvers and expiry, exposed in Settings and included in the director prompt. Approval can be revoked. Initial entries come from the existing brand register; they are not independent evidence of current live features. Human fact-checking is still required. |
| M18 brand scope | Stop a brief for a different client before building. This remains a Goldcom-specific studio; multi-brand capability is not claimed. |

## Additional improvements

- A campaign object preserves the shared brief, cast and line, links its deliverables, and divides the configured budget among them. The campaign line is requested verbatim and checked as a hard constraint.
- Invalid concept IDs are rejected. Automatic language detection is available in the composer/API.
- Arabic text avoids letter-by-letter typewriter slicing. Template counts and provider-discovery claims are corrected in documentation.
- Background images retain provider/model/intent provenance for rating feedback.
- ESLint runs across the application. Strict checked-JavaScript types cover hard constraints and capture safety; the rest remains JavaScript and is linted.
- Dependency updates remove the reported npm vulnerabilities. The install/runtime requirement is now Node `^20.19.0 || >=22.12.0`. A large renderer chunk warning remains non-blocking; it was not hidden by increasing the warning limit.

## Validation

| Check | Result |
|---|---|
| Regression suite | 40 passed |
| HTTP integration suite | 10 passed |
| MCP smoke suite | 30 passed |
| Full editor suite | 36/36 passed |
| Focused editor rechecks after UI refinements | Passed |
| ESLint | Passed |
| Scoped type checking | Passed |
| Production build | Passed; large renderer chunk warning remains |
| Dependency audit | Zero reported vulnerabilities |
| Live Windows Claude connection | Validated structured JSON; $0.009936 CLI usage estimate |

Evidence logs and the UI screenshot are in `D:\Codex\Goldcom\verification`. See [test commands and operational behavior](studio/README.md).

## Acceptance still requiring external resources

The automated checks establish code behavior and simulated safeguards. They do not establish all real-world integrations. Real app recordings and a demonstration phone/emulator/cloud device are needed to validate capture end to end. Anthropic API billing/rates, paid image-provider behavior, production updater failure recovery and native Omani Arabic copy approval require separate acceptance checks. No new marketing production or paid image generation was run as part of this remediation. The one live model call was the bounded connection check above.

These limits should remain visible when deciding whether to use the studio for a client. They are not presented as completed tests.
