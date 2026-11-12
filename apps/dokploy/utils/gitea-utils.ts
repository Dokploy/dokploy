// utils/gitea-utils.ts
// This file contains client-safe utilities for Gitea integration

export const getGiteaOAuthUrl = (giteaId: string): string =>
	`/api/providers/gitea/authorize?giteaId=${encodeURIComponent(giteaId)}`;

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
