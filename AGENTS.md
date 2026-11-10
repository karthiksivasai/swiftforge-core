<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Agent instructions

> [!IMPORTANT]
> **MANDATORY**: Before testing or modifying ANY screen or tab (AWB, Proforma, Forwarding, KYC, etc.), you MUST read `docs/testing-playbook.md` fully. It defines the standardized 8-step auditing, fixing, and Playwright verification procedure that all agents must strictly follow.

Before any AWB Entry work, read `docs/testing-playbook.md`, `docs/awb-entry-handoff.md`, and `docs/awb-entry-audit.md`. Follow section F of the handoff.

- Work one batch at a time. After a fix, update tests, retest the live page via Playwright E2E (`npm run test:e2e:awb`), and show screen vs database vs invoice parity.
- Stop and ask before a business decision. Do not guess.
- Database changes go in a new migration only. Never edit an old one.
- Test data is strictly marked `TEST_` or `TEST_AWB_`. Do not re-run the seed unless asked.
- Never run `scripts/awb-audit/cleanup-international-test-data.mjs` unless the owner asks.
- Say what was tested live in the real browser DOM and what was only read in code. Explain results in plain language.
- Do not write the login password, service-role key, or database URL into any file, message, or commit.
