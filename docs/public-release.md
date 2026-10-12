# Public release runbook

The operational repository must remain private if any historical branch, tag,
pull-request ref, issue, comment, artifact, or workflow log has contained a real
credential or applicant information. Rewriting `main` alone is insufficient:
GitHub can retain pull-request refs and other copies that are not removed by a
normal force-push.

## Before publishing

1. Rotate every credential that has ever appeared in GitHub. At minimum review
   the Supabase service-role and database credentials, JWT and cron secrets,
   Google service-account keys, Gmail OAuth credentials and refresh tokens, and
   third-party API keys. Update Render only after creating the replacement values.
2. Merge and deploy the security hardening while the operational repository is
   still private. Apply pending database migrations through the manual workflow.
3. Remove real candidate data from examples, fixtures, screenshots, issue text,
   documentation, and seed SQL. Use synthetic replacements.
4. Run the complete test suite, dependency audit, tracked-secret guard, and
   Gitleaks scan.
5. Choose an open-source license. Public visibility does not itself grant others
   permission to use, modify, or distribute the code.

## Publish from a clean root commit

Create a new repository rather than changing the visibility of the operational
one. Export only the reviewed tree from the exact release commit, initialize it as
a new Git repository, and commit it with a privacy-safe author email. Do not copy
the old `.git` directory, branches, tags, pull requests, issues, Actions artifacts,
or deployment environments.

Before the first push, verify the exported directory independently:

```bash
bash .github/scripts/check-tracked-secrets.sh
gitleaks dir --redact .
npm audit --omit=dev --prefix server
npm audit --omit=dev --prefix client
```

Push the clean root to a new **private** GitHub repository first. Enable secret
scanning, push protection, private vulnerability reporting, required pull-request
reviews, protected `main`, and required CI checks. Verify the repository's files,
Actions logs, pages, releases, and collaborator permissions, then change only the
new repository to public.

## Keep operations private

Production secrets, Render environment configuration, database backups, applicant
files, and incident evidence stay in private systems. The public repository should
contain source code and synthetic documentation only.
