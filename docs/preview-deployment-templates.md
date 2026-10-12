# Preview deployment templates

In an application's Preview Deployment Settings, the Preview Domain Template
supports the existing `*` wildcard and named variables. Preview environment
variables, Docker build arguments, and Docker build secrets support the same named
variables, plus the resolved domain and URL.

| Variable | Meaning |
| --- | --- |
| `{pr_num}` | Pull request number |
| `{pr_name}` | Pull request title |
| `{branch}` | Pull request source branch |
| `{app_name}` | Generated preview application's service name, matching `*` without the sslip.io IP suffix |
| `{domain}` | Resolved preview hostname; available in environment variables, build arguments, and build secrets |
| `{url}` | Preview URL with the configured HTTP/HTTPS scheme and hostname, without the preview path; available in environment variables, build arguments, and build secrets |

## Domain examples

```text
pr-{pr_num}.example.com
{pr_num}-{pr_name}.example.com
{branch}-{pr_num}.example.com
*.example.com
*.sslip.io
pr-{pr_num}.192-0-2-10.sslip.io
```

Names inserted into a domain are converted to lowercase DNS slugs, truncated to
63 characters. Names without any ASCII letters or digits use `pr-<number>` as a
fallback. For example,
PR #42 titled `Add Dark Mode` produces `42-add-dark-mode.example.com` with
`{pr_num}-{pr_name}.example.com`. Include `{pr_num}` to distinguish pull requests
whose titles or branches produce the same slug.

The final hostname must be valid DNS, including a maximum of 63 characters per
label. A label combining multiple variables can exceed this limit and will be
rejected.

The `*` wildcard continues to use the generated preview application name.
For sslip.io domains, its expansion also includes the server IP as before.
Named variables do not automatically add the IP; include it explicitly, as in
`pr-{pr_num}.192-0-2-10.sslip.io`, replacing the example IP with your server IP.
Configure DNS for your domain to route the resulting hostnames to your server.

## Environment and build examples

```dotenv
PREVIEW_PR={pr_num}
PREVIEW_TITLE={pr_name}
PREVIEW_BRANCH={branch}
PREVIEW_APP={app_name}
PREVIEW_HOST={domain}
PREVIEW_URL={url}
LITERAL_VARIABLE=\{pr_num}
BACKSLASH_BEFORE_PR=\\{pr_num}
SHARE='\\server\share'
```

For PR #42 titled `Add Dark Mode`, `PREVIEW_TITLE` becomes `Add Dark Mode` and
`LITERAL_VARIABLE` becomes the literal text `{pr_num}`. Environment and build
values retain their original text instead of being converted to DNS slugs.
The settings are parsed as dotenv before preview variables are expanded, so a
title such as `Fix #42` or a title containing quotes is preserved as a value.
`{domain}` contains only the hostname. If HTTPS is enabled, `{url}` becomes
`https://pr-42.example.com` when the domain
template is `pr-{pr_num}.example.com`.
The configured preview path is not included in `{url}`.

Use a backslash before a supported variable to prevent expansion. Backslash pairs
collapse to one backslash only immediately before supported variables; an even
number of backslashes expands the variable, and an odd number leaves it literal.
For example, `BACKSLASH_BEFORE_PR` becomes `\42`. Backslashes elsewhere, including
UNC paths such as `SHARE`, remain unchanged. Unknown variables remain unchanged,
and `*` is only expanded in domain templates. These rules also apply to build
arguments and build secrets. Templates are resolved for each preview deployment; the saved
settings remain reusable templates.
