# Security policy

## Reporting a vulnerability

Please do not open a public issue containing exploit details, credentials,
applicant data, or private deployment information.

Use GitHub's **Security → Report a vulnerability** flow when private vulnerability
reporting is enabled. If it is unavailable, contact the maintainers through the
organization's established private channel and ask to open a private security
advisory before sharing sensitive details.

Include the affected route or component, impact, reproduction steps, and a safe
proof of concept. Redact tokens and all candidate information.

## Supported version

Security fixes target the current `main` branch. This project does not currently
maintain supported release branches.

## Secrets and candidate data

- Never commit `.env` files, Google service-account JSON, database URLs, tokens,
  production exports, resumes, headshots, or application responses.
- Use synthetic identities and files in tests, fixtures, screenshots, and issues.
- Treat candidate data as confidential even after a recruiting cycle closes.
- Rotate a credential immediately if it appears in any commit, pull request,
  issue, comment, action log, or shared screenshot. Removing the text later does
  not make the credential safe again.
