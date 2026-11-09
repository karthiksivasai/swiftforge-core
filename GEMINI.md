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

Before any AWB Entry work, read `docs/awb-entry-handoff.md` and `docs/awb-entry-audit.md`. Follow section F of the handoff.

- Work one batch at a time. After a fix, update tests, retest the live page, and show screen vs database vs invoice.
- Stop and ask before a business decision. Do not guess.
- Database changes go in a new migration only. Never edit an old one. The next file is `0146`.
- Test data goes through `scripts/awb-audit` and is marked `TEST_`. Do not re-run the seed unless asked.
- Never run `scripts/awb-audit/cleanup-international-test-data.mjs` unless the owner asks.
- Say what was tested live and what was only read in code. Explain results in plain language.
- Do not write the login password, service-role key, or database URL into a file or a commit.
