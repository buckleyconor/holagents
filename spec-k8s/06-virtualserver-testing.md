# VirtualServer Access Testing

Status: Draft 0.1

## Purpose

Integrate the existing `test-hol-access.sh` behavior as a deterministic pre-promotion gate while retaining its Markdown report.

## Inputs

The runner MUST accept:

| Input       | Required | Description                               |
| ----------- | -------- | ----------------------------------------- |
| `host`      | Yes      | Simulator hostname.                       |
| `token`     | No       | Expected launch token. Treated as secret. |
| `base_path` | No       | Application base path such as `/hol`.     |
| `auth_path` | No       | Mint path; defaults to `/auth-hol`.       |
| `api_probe` | No       | Subresource or API probe path.            |

Only the hostname may differ between the deployed application and its like-for-like simulator configuration.

## Preconditions

Testing MUST begin only after Argo CD reports the expected revision as `Synced` and `Healthy`.

The runner MUST probe the authentication path before the six tests. An HTTP `404` means the lab is not deployed and MUST return `BLOCKED` without running the suite. DNS, TLS, connection and timeout failures also return `BLOCKED` unless a reliable product defect is established.

## Six-test contract

| ID      | Request                            | Expected result                 | Deviation                |
| ------- | ---------------------------------- | ------------------------------- | ------------------------ |
| `VS-01` | Direct mint without iframe headers | Blocked; no launch-token cookie | `FAIL`                   |
| `VS-02` | Framed mint with correct Origin    | `launchtoken` cookie issued     | `FAIL`                   |
| `VS-03` | Direct document without cookie     | Blocked                         | `FAIL`                   |
| `VS-04` | Direct document with valid cookie  | Blocked                         | `FAIL`                   |
| `VS-05` | Framed document with valid cookie  | HTTP `200`                      | `FAIL`                   |
| `VS-06` | Subresource/API with valid cookie  | HTTP `200`                      | `WARN` if tests 1–5 pass |

An explicitly supplied token MUST match the minted token. Any mismatch is `FAIL`.

Tests depending on the cookie from test 2 MUST reuse that cookie. They MUST not mint or substitute unrelated state.

## Aggregate result

Precedence is:

1. `FAIL` if tests 1–5 fail or any explicit token mismatch occurs.
2. `BLOCKED` if a required precondition cannot be established and no test failure exists.
3. `PASS_WITH_WARNINGS` when tests 1–5 pass and only test 6 warns.
4. `PASS` when all six tests pass.
5. `ERROR` when runner or evidence generation fails without a trustworthy test result.

## Exit codes

| Code | Meaning                                       |
| ---- | --------------------------------------------- |
| `0`  | `PASS`                                        |
| `1`  | `PASS_WITH_WARNINGS`                          |
| `2`  | `FAIL`                                        |
| `3`  | `BLOCKED`                                     |
| `4`  | Invalid input or unsupported contract version |
| `5`  | Runner, reporting or internal execution error |

The higher-level policy MAY require review of exit code `1`, but it MUST NOT reinterpret it as a core test failure.

## Reports

The runner MUST retain:

- Colored terminal output when attached to a TTY.
- `access-<host-label>.md` with summary and full sanitized log.

It MUST add `access-<host-label>.json`. JUnit XML MAY also be emitted.

The JSON report MUST include:

- Schema, script and contract versions.
- Run identifier and timestamps.
- Environment, branch and expected revision.
- Argo Application, observed revision, sync and health status.
- Sanitized input metadata.
- Preflight result.
- Six ordered test results with status, observed HTTP result and duration.
- Aggregate result, exit code and evidence digest.

Tokens, cookies, credentials and sensitive response bodies MUST be redacted. A one-way digest MAY be used to correlate expected and observed tokens.

## Security requirements

- Host and path inputs MUST be validated against command injection and cross-origin URLs.
- TLS verification MUST remain enabled unless an approved policy exception exists.
- Complete request and response headers MUST not be logged.
- Secret state MUST be discarded after execution.

## Acceptance criteria

- The existing six checks retain their meaning.
- Tests 1–5 and token mismatch are blocking failures.
- Test 6 can produce a distinct warning.
- Preflight `404` produces `BLOCKED`.
- Markdown and JSON represent the same run.
- Exit codes are deterministic.
- Reports contain no token or cookie values.
- Evidence is bound to the tested Git and Argo revisions.
