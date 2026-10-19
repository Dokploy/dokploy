# Official Dokploy MCP: remote OAuth integration

**Status: proposal for maintainer review.** This document does not enable a remote MCP endpoint or claim OAuth support is implemented.

Dokploy already publishes the official MCP server in [`Dokploy/mcp`](https://github.com/Dokploy/mcp). It generates tools from the Dokploy API and supports local `stdio` and remote HTTP transports. The remote transport currently uses a process-wide Dokploy API key, which gives every remote caller the same identity. That is unsuitable for a public endpoint or hosted MCP clients such as ChatGPT.

Related issues:

- [Dokploy/dokploy#4952](https://github.com/Dokploy/dokploy/issues/4952): ChatGPT OAuth request.
- [Dokploy/dokploy#5708](https://github.com/Dokploy/dokploy/issues/5708): first-party remote OAuth and authorization proposal.
- [Dokploy/mcp#82](https://github.com/Dokploy/mcp/issues/82): authentication and OAuth for the official HTTP transport.

## Proposed ownership

- **Dokploy core** is the OAuth authorization server and the authority for user, organization, and resource permissions. It owns login, consent, organization selection, token lifecycle, and audit events.
- **`Dokploy/mcp`** is the MCP resource server. It serves the MCP protocol, validates access tokens issued for its resource, and forwards each API request with that user's delegated identity.
- **Existing API and service authorization** remains authoritative. MCP tool filtering and OAuth scopes can reduce the advertised/allowed surface, but cannot replace the per-request checks already enforced by Dokploy procedures.

This keeps the generated MCP tool catalog in its existing official package and avoids a second tool implementation inside the main application repository.

## Authorization flow

1. The MCP client discovers the protected-resource metadata for the remote MCP URL and the corresponding Dokploy authorization server metadata.
2. The client starts Authorization Code with PKCE (`S256`). Public clients do not receive or depend on a client secret. Dynamic Client Registration or Client ID Metadata Documents should follow the MCP client compatibility requirements selected by maintainers.
3. Dokploy requires a signed-in user, displays the client identity and requested access, and asks the user to select an organization when necessary.
4. Consent is bound to the authenticated user, client, selected organization, granted scope, and MCP resource. No organization or role is inferred from untrusted client parameters.
5. The authorization server issues short-lived resource-bound access tokens. Refresh tokens, if enabled, are rotated and revocable. Revoking a grant prevents subsequent MCP calls.
6. The MCP server validates the token issuer, audience/resource, expiry, and scopes for every request. It forwards the delegated credential to Dokploy core; the core resolves the user and organization and runs the normal resource and project/service permission checks for each operation.
7. Dokploy records the user, organization, client, tool/API operation, result category, and timestamp for audit, while excluding bearer tokens and secret values.

## Authorization requirements

- Fail closed when the token is missing, invalid, expired, revoked, issued by another Dokploy instance, or intended for another resource.
- Never treat API key possession by the MCP process as the end user's authorization.
- Preserve the current local `stdio` plus API-key workflow for users who choose it.
- Never let client-supplied organization IDs, tool visibility, annotations, or scopes elevate the caller's role.
- Apply current Dokploy resource, organization, project, and service access checks on every call. Recheck authorization at execution time, not only when the tool list is generated.
- Retain existing secret redaction and prevent credentials from appearing in MCP output, errors, telemetry, or logs. Secret-returning operations need an explicit policy and tests.
- Treat deploy, delete, stop, credential, and infrastructure mutation operations as writes. Preserve Dokploy's existing authorization; define any additional confirmation behavior with maintainers and MCP clients rather than assuming client annotations are an enforcement boundary.
- Keep authorization-code and refresh-token handling standards-compliant, including PKCE `S256`, exact redirect URI matching, state/CSRF protections, token revocation, and rate limits on discovery/registration/token endpoints.

## Suggested delivery slices

1. Agree on OAuth plugin/version, token claims, audience, organization binding, and how the MCP server delegates identity to core.
2. Add core authorization-server metadata, consent, resource-bound token issuance/revocation, and authenticated API context using existing auth/permission primitives.
3. Add protected-resource metadata and per-request token validation/forwarding in `Dokploy/mcp`; keep the local stdio mode unchanged.
4. Add tests for invalid/missing/wrong-audience/revoked tokens, cross-organization access, changed membership/permissions, secret redaction, and destructive operations.
5. Document ChatGPT and generic remote MCP setup, verify the endpoint with MCP Inspector and a real supported client, and only then describe the integration as available.

## Acceptance criteria

- A user can connect a supported remote MCP client to their own Dokploy instance through OAuth without pasting an API key into the MCP client configuration.
- Every tool call executes under the consenting user's identity and selected organization, and fails when current Dokploy permissions do not allow the operation.
- A user can revoke the client's grant and subsequent calls fail promptly.
- A user in one organization cannot access another organization's projects or servers by changing tool arguments.
- Existing local MCP/API-key connections and generated tool coverage continue to work.
- Automated authorization tests and an end-to-end remote MCP handshake pass before the feature is announced.
