# Security policy

## Supported versions

Security fixes go into the latest 1.x release and the live site at [covers.otsirh.dev](https://covers.otsirh.dev).

## Reporting a vulnerability

Please report vulnerabilities privately through [GitHub's private vulnerability reporting](https://github.com/otsirh/book-cover-generator/security/advisories/new), not in public issues.

Include what is affected (the library, the CLI or the site), how to reproduce it, and the impact you expect. You can expect an acknowledgement within a few days. Fixed issues are credited in the advisory unless you prefer otherwise.

## Scope

- The library and CLI: for example, input that produces SVG which can run script, or input that hangs or crashes.
- The site: for example, XSS, a header misconfiguration or a CSP bypass.

The site has no accounts, no cookies and no server-side code. It keeps kept designs in the browser's `localStorage` and the undo position in `sessionStorage`; nothing is sent anywhere.
