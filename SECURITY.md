# Security Policy

## Supported versions

Security fixes target the latest version published on [npm](https://www.npmjs.com/package/pi-provider-ampersand-bridge). Update before reporting an issue that may already be fixed.

## Reporting a vulnerability

Email [security@nibras.co](mailto:security@nibras.co). Do not open a public issue or discussion.

Include, when applicable:

- A proof of concept or reproduction steps
- Versions affected and any relevant environment details
- The impact you consider it to have

## Scope

This extension forwards requests to the public [ai&](https://docs.aiand.com) service. It is independent and unaffiliated: report issues about the ai& service itself to ai&, and issues about this extension through the policy above.

API keys are read from the ambient environment (`AMPERSAND_API_KEY`) or Pi's credential store. Never commit keys; the tests use injected fakes and never contact the live service.
