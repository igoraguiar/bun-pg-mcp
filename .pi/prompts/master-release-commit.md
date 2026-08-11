---
description: Promote develop to the mainline branch for a release — bump version, update changelog, tag, push
argument-hint: ""
---

# Master Release Commit

Promote the `develop` branch to the mainline branch (`master`) and prepare a release commit for this single-package repository by following this workflow exactly.

General rules:

- The mainline branch is usually called `master`, but some repositories use `main` instead. Before starting, determine the actual mainline branch name (for example by checking which of `master`/`main` exists locally or on the remote) and use that name everywhere this workflow refers to `master`.
- Treat the repository root as the working directory and as the single package.
- This repository is NOT a monorepo. Do NOT look for a `packages/` directory. The package is the repository root.
- Follow the steps in the order listed below.
- Do not push commits or tags unless the user explicitly confirms.
- Do not publish packages unless the user explicitly confirms.
- If the repository already has unrelated uncommitted changes, do not discard them. Work carefully and only change the files required for the release.

Release workflow:

1. Ensure the repository is in a valid state for the release workflow and inspect the current git status.
2. Check out the mainline branch (`master`, or `main` if that is what the repository uses).
3. Merge `develop` into the mainline branch using `--no-commit` so the release commit message can be edited before committing.
4. Identify whether the repository root package was changed by the merge. For this single-package project, consider the root `package.json` and source files as the package.
5. Decide the new version number using semantic versioning principles (ask the user, give them some suggestions based on the changes merged from develop).
6. Update the version number in the repository root `package.json` and stage the updated `package.json` as part of the still-open merge commit.
7. If a `CHANGELOG.md` exists at the repository root, update it using the changelog process described below and stage the updated `CHANGELOG.md` as part of the still-open merge commit. If no changelog exists, skip this step and inform the user.
8. Commit the release with a conventional commit message using `chore(release): bump version` as the subject line.
9. In the same commit message body, list the new version for the root package.
10. Tag the release commit using the format `vX.Y.Z` such as `v1.3.1`. Do NOT include the package name in the tag.
11. Ask the user if they want to push the release commit and tag to the remote repository. Only if they confirm, execute the push.
12. Ask the user if they want to publish/release artifacts, e.g., trigger the GitHub release workflow. Only if they confirm, provide instructions to push the tag which will trigger the workflow.

Changelog update process:

- Find the latest git tag for the repository, e.g., `v1.2.3`. If no tags exist, start from the first commit.
- Find all commits since that tag that touch files in the repository root.
- Filter the commits to include only messages that follow the conventional commit format such as `feat: add new feature`.
- Categorize the commits by type such as `feat`, `fix`, `docs`, `refactor`, `test`, `build`, `ci`, `chore`, or `revert`.
- Generate a new version section in `CHANGELOG.md` for the new version using Keep a Changelog style headings.
- Omit any category that has no commits.
- If there are no commits at all since the last tag, add a minimal version entry without change bullets.

Changelog formatting rules:

- Place the newest version section at the top of the changelog content.
- Use the semantic version being released for the root package.
- Include the release date in `YYYY-MM-DD` format.
- Map conventional commit types to readable section headings when appropriate, such as `feat` to `Added`, `fix` to `Fixed`, and `refactor` to `Changed`.
- Keep uncategorized or unsupported conventional commit types in a sensible section if needed rather than discarding them.

Interaction rules:

- If version selection is ambiguous, ask the user to confirm the version bump before editing files.
- Before creating the final commit, summarize the proposed version and the files to be changed.
- Before pushing, ask a direct confirmation question.
- Before triggering a release, ask a direct confirmation question.

Output expectations:

- Report whether the root package was detected as changed.
- Report the chosen version for the release.
- Report which tag was created.
- Report whether push was skipped or executed.
- Report whether release workflow trigger was skipped or executed.
