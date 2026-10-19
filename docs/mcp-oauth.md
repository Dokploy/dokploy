# Remote MCP authorization

Dokploy's OAuth provider issues short-lived, audience-bound access tokens for the official remote MCP resource. The MCP server forwards each user's bearer token to Dokploy's API. Dokploy resolves the user and selected organization from the token and applies its existing permission checks to every API operation.

The authorization code flow uses PKCE with S256. Public MCP clients can register dynamically. The signed post-login step requires the user to select an organization, followed by a consent screen that identifies the client and requested scope. The MCP resource URL is checked by both the MCP server and Dokploy before a tool call is authorized.

## Configuration

Configure `MCP_RESOURCE_URL` on the MCP service as the public HTTPS endpoint ending in `/mcp`, for example `https://mcp.example.com/mcp`. Set the exact same value as `DOKPLOY_MCP_RESOURCE_URL` on Dokploy. Set `DOKPLOY_URL` on the MCP service to the Dokploy instance's public base URL. Expose the MCP endpoint over HTTPS.

HTTP MCP mode defaults to OAuth and requires no shared API key. Local stdio and explicitly selected process/API-key modes continue using the existing authentication configuration.

## Authorization boundaries

- Tokens are bound to the configured MCP resource and the Dokploy OAuth issuer.
- The consent reference is the organization selected in the authenticated Dokploy session. Membership is checked when authorization is created and whenever access tokens are introspected.
- API calls require an unexpired access token with a live Dokploy session and current organization membership.
- Per-resource access remains governed by Dokploy's existing API and service permission checks.
- Access tokens expire after 15 minutes. The OAuth revocation endpoint adds the token fingerprint to a server-side denylist so revocation takes effect on the next MCP/API request.
- Token fingerprints, rather than bearer values, are stored for revocation. MCP sessions are bound to the bearer token fingerprint and cannot be resumed with another user's token.

The resource URL must be identical in both services; a mismatch causes authentication to fail closed.
