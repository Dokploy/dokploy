// utils/gitea-utils.ts
// This file contains client-safe utilities for Gitea integration

/**
 * Generates an OAuth URL for Gitea authorization
 *
 * @param giteaId The ID of the Gitea provider to be used as state
 * @param clientId The OAuth client ID
 * @param giteaUrl The base URL of the Gitea instance
 * @param baseUrl The base URL of the application for callback
 * @returns The complete OAuth authorization URL
 */
export const getGiteaOAuthUrl = (
	giteaId: string,
	clientId: string,
	giteaUrl: string,
	baseUrl: string,
): string => {
	if (!clientId || !giteaUrl || !baseUrl) {
		// Return a marker that can be checked by the caller
		return "#";
	}

	const redirectUri = `${baseUrl}/api/providers/gitea/callback`;
	const scopes = "repo repo:status read:user read:org";

	return `${giteaUrl}/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(
		redirectUri,
	)}&response_type=code&scope=${encodeURIComponent(scopes)}&state=${encodeURIComponent(giteaId)}`;
};

// Interfaces for Gitea API responses and components
export interface Repository {
	name: string;
	url: string;
	id: number;
	owner: {
		username: string;
	};
}

export interface Branch {
	name: string;
}

export interface GiteaProviderType {
	giteaId: string;
	gitProvider: {
		name: string;
		gitProviderId: string;
		providerType: "github" | "gitlab" | "bitbucket" | "gitea";
		createdAt: string;
		organizationId: string;
	};
	name: string;
}

export interface GiteaProviderResponse {
	giteaId: string;
	clientId: string;
	giteaUrl: string;
}

export interface GitProvider {
	gitProviderId: string;
	name: string;
	providerType: string;
	giteaId?: string;
	gitea?: {
		giteaId: string;
		giteaUrl: string;
		clientId: string;
	};
}

export interface GiteaProvider {
	gitea?: {
		giteaId?: string;
		giteaUrl?: string;
		clientId?: string;
		clientSecret?: string;
		redirectUri?: string;
		organizationName?: string;
	};
	name?: string;
	gitProviderId?: string;
}
