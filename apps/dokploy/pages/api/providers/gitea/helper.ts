import { findGiteaById } from "@dokploy/server";
import type { NextApiResponse } from "next";

export interface Gitea {
	giteaId: string;
	gitProviderId: string;
	redirectUri: string | null;
	accessToken: string | null;
	refreshToken: string | null;
	expiresAt: number | null;
	giteaUrl: string;
	clientId: string | null;
	clientSecret: string | null;
	organizationName?: string;
	gitProvider: {
		name: string;
		gitProviderId: string;
		providerType: "github" | "gitlab" | "bitbucket" | "gitea";
		createdAt: string;
		organizationId: string;
	};
}

export const findGitea = async (giteaId: string): Promise<Gitea | null> => {
	try {
		const gitea = await findGiteaById(giteaId);
		return gitea;
	} catch (findError) {
		console.error("Error finding Gitea provider:", findError);
		return null;
	}
};

export const redirectWithError = (res: NextApiResponse, error: string) => {
	return res.redirect(
		307,
		`/dashboard/settings/git-providers?error=${encodeURIComponent(error)}`,
	);
};
