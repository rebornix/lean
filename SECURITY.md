# Security policy

If you believe you've found a security issue in `lean`, please **do not
open a public issue**. Email the maintainer at
**rebornix@gmail.com** with:

- A description of the issue
- Steps to reproduce, if applicable
- The version of `lean` (run `lean --version`) and Node.js
- Any suggested mitigation

You should expect an initial reply within 7 days. If the issue is
confirmed, we'll work on a fix and coordinate disclosure.

## Scope

`lean` is a thin client that forwards requests to Linear's GraphQL
API. The most security-relevant aspects are:

- Storage and transmission of Linear API keys / OAuth tokens
- Local config file permissions
- Behaviour of the OAuth callback server (when implemented)

API behaviour and authorization on Linear's side is outside the scope
of this project; please report those to Linear directly.

## Out of scope

- Bugs in third-party dependencies (please file upstream)
- Issues that require an attacker to already control the user's
  filesystem or environment
- Best-practice suggestions without a concrete vulnerability
