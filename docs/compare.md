# Compare

Workspace tab to diff **two** netlog JSON files (primary = current load; comparison = second file).

## Purpose

Regression checks: did findings, failed URLs, or hosts change between captures?

## Usage

1. Load the primary netlog on Import (as usual).
2. Open **Compare**.
3. **Load comparison file** — parses in the same Web Worker (nothing uploaded).
4. Review the diff summary.

## Diff includes

| Section | Content |
|---------|---------|
| Stats | Events, sessions, findings, failed URL counts (A → B) |
| Hosts | Hosts only in A vs only in B |
| Finding counts | Per `ruleId` where A ≠ B |
| Failed URLs | URLs that failed in A only, B only, or both |

Clear comparison removes the second analysis without affecting the primary file.

## Related

- [Findings](findings.md) — rule ids referenced in the diff table
- [Overview](overview.md) — primary capture workflow
