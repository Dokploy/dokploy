// utils/gitea-utils.ts
// This file contains client-safe utilities for Gitea integration

/**
 * Generates the Dokploy server-side OAuth authorization URL for Gitea.
 *
 * @param giteaId The ID of the Gitea provider.
 * @param clientId The OAuth client ID. Kept for caller compatibility.
 * @param giteaUrl The base URL of the Gitea instance. Kept for caller compatibility.
 * @param baseUrl The base URL of the application for callback
 * @returns The Dokploy authorize URL that creates signed OAuth state server-side.
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

	return `${baseUrl}/api/providers/gitea/authorize?giteaId=${encodeURIComponent(giteaId)}`;
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
