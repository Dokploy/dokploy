import { TRPCError } from "@trpc/server";
import { findBitbucketById } from "./bitbucket";
import { assertGitProviderAccess } from "./git-provider";
import { findGiteaById } from "./gitea";
import { findGithubById } from "./github";
import { findGitlabById } from "./gitlab";
import { findRegistryById } from "./registry";
import { findSSHKeyById } from "./ssh-key";

type CredentialIds = {
	githubId?: string | null;
	gitlabId?: string | null;
	bitbucketId?: string | null;
	giteaId?: string | null;
	customGitSSHKeyId?: string | null;
	registryId?: string | null;
	buildRegistryId?: string | null;
	rollbackRegistryId?: string | null;
};

const forbidden = () =>
	new TRPCError({
		code: "UNAUTHORIZED",
		message: "You are not authorized to use this credential",
	});

export const assertServiceCredentialAccess = async (
	session: { userId: string; activeOrganizationId: string },
	input: CredentialIds,
) => {
	const providers = [
		input.githubId && (await findGithubById(input.githubId)).gitProvider,
		input.gitlabId && (await findGitlabById(input.gitlabId)).gitProvider,
		input.bitbucketId &&
			(await findBitbucketById(input.bitbucketId)).gitProvider,
		input.giteaId && (await findGiteaById(input.giteaId)).gitProvider,
	];
	for (const provider of providers) {
		if (provider) {
			await assertGitProviderAccess(session, provider);
		}
	}

	if (input.customGitSSHKeyId) {
		const sshKey = await findSSHKeyById(input.customGitSSHKeyId);
		if (sshKey.organizationId !== session.activeOrganizationId) {
			throw forbidden();
		}
	}

	for (const registryId of [
		input.registryId,
		input.buildRegistryId,
		input.rollbackRegistryId,
	]) {
		if (registryId) {
			const registry = await findRegistryById(registryId);
			if (registry.organizationId !== session.activeOrganizationId) {
				throw forbidden();
			}
		}
	}
};
