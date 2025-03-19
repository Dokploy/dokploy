import { createWriteStream } from "node:fs";
import * as fs from "node:fs/promises";
import { join } from "node:path";
import { paths } from "@dokploy/server/constants";
import { findGiteaById, updateGitea } from "@dokploy/server/services/gitea";
import { TRPCError } from "@trpc/server";
import { recreateDirectory } from "../filesystem/directory";
import { execAsyncRemote } from "../process/execAsync";
import { spawnAsync } from "../process/spawnAsync";

/**
 * Wrapper function to maintain compatibility with the existing implementation
 */
export const fetchGiteaBranches = async (
	giteaId: string,
	repoFullName: string,
) => {
	// Ensure owner and repo are non-empty strings
	const parts = repoFullName.split("/");

	// Validate that we have exactly two parts
	if (parts.length !== 2 || !parts[0] || !parts[1]) {
		throw new Error(
			`Invalid repository name format: ${repoFullName}. Expected format: owner/repo`,
		);
	}

	const [owner, repo] = parts;

	// Call the existing getGiteaBranches function with the correct object structure
	return await getGiteaBranches({
		giteaId,
		owner,
		repo,
		id: 0, // Provide a default value for optional id
	});
};

/**
 * Helper function to check if the required fields are filled for Gitea repository operations
 */
export const getErrorCloneRequirements = (entity: {
	giteaRepository?: string | null;
	giteaOwner?: string | null;
	giteaBranch?: string | null;
	giteaPathNamespace?: string | null;
}) => {
	const reasons: string[] = [];
	const { giteaBranch, giteaOwner, giteaRepository, giteaPathNamespace } =
		entity;

	if (!giteaRepository) reasons.push("1. Repository not assigned.");
	if (!giteaOwner) reasons.push("2. Owner not specified.");
	if (!giteaBranch) reasons.push("3. Branch not defined.");
	if (!giteaPathNamespace) reasons.push("4. Path namespace not defined.");

	return reasons;
};

/**
 * Function to refresh the Gitea token if expired
 */
export const refreshGiteaToken = async (giteaProviderId: string) => {
	try {
		console.log("Attempting to refresh Gitea token:", {
			giteaProviderId,
			timestamp: new Date().toISOString(),
		});

		const giteaProvider = await findGiteaById(giteaProviderId);

		if (
			!giteaProvider?.clientId ||
			!giteaProvider?.clientSecret ||
			!giteaProvider?.refreshToken
		) {
			console.warn("Missing credentials for token refresh");
			return giteaProvider?.accessToken || null;
		}

		const tokenEndpoint = `${giteaProvider.giteaUrl}/login/oauth/access_token`;
		const params = new URLSearchParams({
			grant_type: "refresh_token",
			refresh_token: giteaProvider.refreshToken,
			client_id: giteaProvider.clientId,
			client_secret: giteaProvider.clientSecret,
		});

		console.log("Token Endpoint:", tokenEndpoint);
		console.log("Request Parameters:", params.toString());

		const response = await fetch(tokenEndpoint, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				Accept: "application/json",
			},
			body: params.toString(),
		});

		console.log("Token Refresh Response:", {
			status: response.status,
			statusText: response.statusText,
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error("Token Refresh Failed:", errorText);
			return giteaProvider?.accessToken || null;
		}

		const data = await response.json();
		const { access_token, refresh_token, expires_in } = data;

		if (!access_token) {
			console.error("Missing access token in refresh response");
			return giteaProvider?.accessToken || null;
		}

		const expiresAt = Date.now() + (expires_in || 3600) * 1000;
		const expiresAtSeconds = Math.floor(expiresAt / 1000);

		await updateGitea(giteaProviderId, {
			accessToken: access_token,
			refreshToken: refresh_token || giteaProvider.refreshToken,
			expiresAt: expiresAtSeconds,
		});

		console.log("Gitea token refreshed successfully.");
		return access_token;
	} catch (error) {
		console.error("Token Refresh Error:", error);
		// Return the existing token if refresh fails
		const giteaProvider = await findGiteaById(giteaProviderId);
		return giteaProvider?.accessToken || null;
	}
};

/**
 * Generate a secure Git clone command with proper validation
 */
export const getGiteaCloneCommand = async (
	entity: any,
	logPath: string,
	isCompose = false,
) => {
	const {
		appName,
		giteaBranch,
		giteaId,
		giteaOwner,
		giteaRepository,
		serverId,
	} = entity;

	if (!serverId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Server not found",
		});
	}

	if (!giteaId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Gitea Provider not found",
		});
	}

	// Use paths(true) for remote operations
	const { COMPOSE_PATH, APPLICATIONS_PATH } = paths(true);
	const basePath = isCompose ? COMPOSE_PATH : APPLICATIONS_PATH;
	const outputPath = join(basePath, appName, "code");

	const giteaProvider = await findGiteaById(giteaId);
	const baseUrl = giteaProvider.giteaUrl.replace(/^https?:\/\//, "");
	const repoClone = `${giteaOwner}/${giteaRepository}.git`;
	const cloneUrl = `https://oauth2:${giteaProvider.accessToken}@${baseUrl}/${repoClone}`;

	const cloneCommand = `
    # Ensure output directory exists and is empty
    rm -rf ${outputPath};
    mkdir -p ${outputPath};

    # Clone with detailed logging
    echo "Cloning repository to ${outputPath}" >> ${logPath};
    echo "Repository: ${repoClone}" >> ${logPath};
    
    if ! git clone --branch ${giteaBranch} --depth 1 --recurse-submodules ${cloneUrl} ${outputPath} >> ${logPath} 2>&1; then
      echo "❌ [ERROR] Failed to clone the repository ${repoClone}" >> ${logPath};
      exit 1;
    fi

    # Verify clone
    CLONE_COUNT=$(find ${outputPath} -type f | wc -l)
    echo "Files cloned: $CLONE_COUNT" >> ${logPath};

    if [ "$CLONE_COUNT" -eq 0 ]; then
      echo "⚠️ WARNING: No files cloned" >> ${logPath};
      exit 1;
    fi

    echo "Cloned ${repoClone} to ${outputPath}: ✅" >> ${logPath};
  `;

	return cloneCommand;
};

/**
 * Main function to clone a Gitea repository with improved validation and robust directory handling
 */
export const cloneGiteaRepository = async (
	entity: any,
	logPath?: string,
	isCompose = false,
) => {
	// If logPath is not provided, generate a default log path
	const actualLogPath =
		logPath ||
		join(
			paths()[isCompose ? "COMPOSE_PATH" : "APPLICATIONS_PATH"],
			entity.appName,
			"clone.log",
		);

	const writeStream = createWriteStream(actualLogPath, { flags: "a" });
	const { appName, giteaBranch, giteaId, giteaOwner, giteaRepository } = entity;

	try {
		if (!giteaId) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Gitea Provider not found",
			});
		}

		// Refresh the access token
		await refreshGiteaToken(giteaId);

		// Fetch the Gitea provider
		const giteaProvider = await findGiteaById(giteaId);
		if (!giteaProvider) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Gitea provider not found in the database",
			});
		}

		const { COMPOSE_PATH, APPLICATIONS_PATH } = paths();
		const basePath = isCompose ? COMPOSE_PATH : APPLICATIONS_PATH;
		const outputPath = join(basePath, appName, "code");

		// Log path information
		writeStream.write("\nPath Information:\n");
		writeStream.write(`Base Path: ${basePath}\n`);
		writeStream.write(`Output Path: ${outputPath}\n`);

		writeStream.write(`\nRecreating directory: ${outputPath}\n`);
		await recreateDirectory(outputPath);

		// Additional step - verify directory exists and is empty
		try {
			const filesCheck = await fs.readdir(outputPath);
			writeStream.write(
				`Directory after cleanup - files: ${filesCheck.length}\n`,
			);

			if (filesCheck.length > 0) {
				writeStream.write("WARNING: Directory not empty after cleanup!\n");

				// Force remove with shell command if recreateDirectory didn't work
				if (entity.serverId) {
					writeStream.write("Attempting forceful cleanup via shell command\n");
					await execAsyncRemote(
						entity.serverId,
						`rm -rf "${outputPath}" && mkdir -p "${outputPath}"`,
						(data) => writeStream.write(`Cleanup output: ${data}\n`),
					);
				} else {
					// Fallback to direct fs operations if serverId not available
					writeStream.write("Attempting direct fs removal\n");
					await fs.rm(outputPath, { recursive: true, force: true });
					await fs.mkdir(outputPath, { recursive: true });
				}
			}
		} catch (verifyError) {
			writeStream.write(`Error verifying directory: ${verifyError}\n`);
			// Continue anyway - the clone operation might handle this
		}

		const repoClone = `${giteaOwner}/${giteaRepository}.git`;
		const baseUrl = giteaProvider.giteaUrl.replace(/^https?:\/\//, "");
		const cloneUrl = `https://oauth2:${giteaProvider.accessToken}@${baseUrl}/${repoClone}`;

		writeStream.write(`\nCloning Repo ${repoClone} to ${outputPath}...\n`);
		writeStream.write(
			`Clone URL (masked): https://oauth2:***@${baseUrl}/${repoClone}\n`,
		);

		// First try standard git clone
		try {
			await spawnAsync(
				"git",
				[
					"clone",
					"--branch",
					giteaBranch,
					"--depth",
					"1",
					"--recurse-submodules",
					cloneUrl,
					outputPath,
					"--progress",
				],
				(data) => {
					if (writeStream.writable) {
						writeStream.write(data);
					}
				},
			);
			writeStream.write("\nStandard git clone succeeded\n");
		} catch (cloneError) {
			writeStream.write(`\nStandard git clone failed: ${cloneError}\n`);
			writeStream.write("Falling back to git init + fetch approach...\n");

			// Retry cleanup one more time
			if (entity.serverId) {
				await execAsyncRemote(
					entity.serverId,
					`rm -rf "${outputPath}" && mkdir -p "${outputPath}"`,
					(data) => writeStream.write(`Cleanup retry: ${data}\n`),
				);
			} else {
				await fs.rm(outputPath, { recursive: true, force: true });
				await fs.mkdir(outputPath, { recursive: true });
			}

			// Initialize git repo
			writeStream.write("Initializing git repository...\n");
			await spawnAsync("git", ["init", outputPath], (data) =>
				writeStream.write(data),
			);

			// Set remote origin
			writeStream.write("Setting remote origin...\n");
			await spawnAsync(
				"git",
				["-C", outputPath, "remote", "add", "origin", cloneUrl],
				(data) => writeStream.write(data),
			);

			// Fetch branch
			writeStream.write(`Fetching branch: ${giteaBranch}...\n`);
			await spawnAsync(
				"git",
				["-C", outputPath, "fetch", "--depth", "1", "origin", giteaBranch],
				(data) => writeStream.write(data),
			);

			// Checkout branch
			writeStream.write(`Checking out branch: ${giteaBranch}...\n`);
			await spawnAsync(
				"git",
				["-C", outputPath, "checkout", "FETCH_HEAD"],
				(data) => writeStream.write(data),
			);

			writeStream.write("Git init and fetch completed successfully\n");
		}

		// Verify clone
		const files = await fs.readdir(outputPath);
		writeStream.write("\nClone Verification:\n");
		writeStream.write(`Files found: ${files.length}\n`);
		if (files.length > 0) {
			// Using a for loop instead of forEach
			for (let i = 0; i < Math.min(files.length, 10); i++) {
				writeStream.write(`- ${files[i]}\n`);
			}
		}

		if (files.length === 0) {
			throw new Error("Repository clone failed - directory is empty");
		}

		writeStream.write(`\nCloned ${repoClone} successfully: ✅\n`);
	} catch (error) {
		writeStream.write(`\nClone Error: ${error}\n`);
		throw error;
	} finally {
		writeStream.end();
	}
};

/**
 * Clone a Gitea repository locally for a Compose configuration
 * Leverages the existing comprehensive cloneGiteaRepository function
 */
export const cloneRawGiteaRepository = async (entity: any) => {
	// Merge the existing entity with compose-specific properties
	const composeEntity = {
		...entity,
		sourceType: "compose",
		isCompose: true,
	};

	// Call cloneGiteaRepository with the modified entity
	await cloneGiteaRepository(composeEntity);
};

/**
 * Clone a Gitea repository remotely for a Compose configuration
 * Uses the existing getGiteaCloneCommand function for remote cloning
 */
export const cloneRawGiteaRepositoryRemote = async (compose: any) => {
	const { COMPOSE_PATH } = paths(true);
	const logPath = join(COMPOSE_PATH, compose.appName, "clone.log");

	// Reuse the existing getGiteaCloneCommand function
	const command = await getGiteaCloneCommand(
		{
			...compose,
			isCompose: true,
		},
		logPath,
		true,
	);

	if (!compose.serverId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Server not found",
		});
	}

	// Execute the clone command on the remote server
	await execAsyncRemote(compose.serverId, command);
};

// Helper function to check if a Gitea provider meets the necessary requirements
export const haveGiteaRequirements = (giteaProvider: any) => {
	return !!(giteaProvider?.clientId && giteaProvider?.clientSecret);
};

/**
 * Function to test the connection to a Gitea provider
 */
export const testGiteaConnection = async (input: { giteaId: string }) => {
	try {
		const { giteaId } = input;

		if (!giteaId) {
			throw new Error("Gitea provider not found");
		}

		// Fetch the Gitea provider from the database
		const giteaProvider = await findGiteaById(giteaId);
		if (!giteaProvider) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Gitea provider not found in the database",
			});
		}

		console.log("Gitea Provider Found:", {
			id: giteaProvider.giteaId,
			url: giteaProvider.giteaUrl,
			hasAccessToken: !!giteaProvider.accessToken,
		});

		// Refresh the token if needed
		await refreshGiteaToken(giteaId);

		// Fetch the provider again in case the token was refreshed
		const provider = await findGiteaById(giteaId);
		if (!provider || !provider.accessToken) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "No access token available. Please authorize with Gitea.",
			});
		}

		// Make API request to test connection
		console.log("Making API request to test connection...");

		// Construct proper URL for the API request
		const baseUrl = provider.giteaUrl.replace(/\/+$/, ""); // Remove trailing slashes
		const url = `${baseUrl}/api/v1/user/repos`;

		console.log(`Testing connection to: ${url}`);

		const response = await fetch(url, {
			headers: {
				Accept: "application/json",
				Authorization: `token ${provider.accessToken}`,
			},
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error("Repository API failed:", errorText);
			throw new Error(
				`Failed to connect to Gitea API: ${response.status} ${response.statusText}`,
			);
		}

		const repos = await response.json();
		console.log(
			`Successfully connected to Gitea API. Found ${repos.length} repositories.`,
		);

		// Update lastAuthenticatedAt
		await updateGitea(giteaId, {
			lastAuthenticatedAt: Math.floor(Date.now() / 1000),
		});

		return repos.length;
	} catch (error) {
		console.error("Gitea Connection Test Error:", error);
		throw error;
	}
};

/**
 * Function to fetch repositories from a Gitea provider
 */
export const getGiteaRepositories = async (giteaId?: string) => {
	if (!giteaId) {
		return [];
	}

	// Refresh the token
	await refreshGiteaToken(giteaId);

	// Fetch the Gitea provider
	const giteaProvider = await findGiteaById(giteaId);

	// Construct the URL for fetching repositories
	const baseUrl = giteaProvider.giteaUrl.replace(/\/+$/, "");
	const url = `${baseUrl}/api/v1/user/repos`;

	const response = await fetch(url, {
		headers: {
			Accept: "application/json",
			Authorization: `token ${giteaProvider.accessToken}`,
		},
	});

	if (!response.ok) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Failed to fetch repositories: ${response.statusText}`,
		});
	}

	const repositories = await response.json();

	// Map repositories to a consistent format
	const mappedRepositories = repositories.map((repo: any) => ({
		id: repo.id,
		name: repo.name,
		url: repo.full_name,
		owner: {
			username: repo.owner.login,
		},
	}));

	return mappedRepositories;
};

/**
 * Function to fetch branches for a specific Gitea repository
 */
export const getGiteaBranches = async (input: {
	id?: number;
	giteaId?: string;
	owner: string;
	repo: string;
}) => {
	if (!input.giteaId) {
		return [];
	}

	// Fetch the Gitea provider
	const giteaProvider = await findGiteaById(input.giteaId);

	// Construct the URL for fetching branches
	const baseUrl = giteaProvider.giteaUrl.replace(/\/+$/, "");
	const url = `${baseUrl}/api/v1/repos/${input.owner}/${input.repo}/branches`;

	const response = await fetch(url, {
		headers: {
			Accept: "application/json",
			Authorization: `token ${giteaProvider.accessToken}`,
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch branches: ${response.statusText}`);
	}

	const branches = await response.json();

	// Map branches to a consistent format
	return branches.map((branch: any) => ({
		id: branch.name,
		name: branch.name,
		commit: {
			id: branch.commit.id,
		},
	}));
};

export default {
	cloneGiteaRepository,
	cloneRawGiteaRepository,
	cloneRawGiteaRepositoryRemote,
	refreshGiteaToken,
	haveGiteaRequirements,
	testGiteaConnection,
	getGiteaRepositories,
	getGiteaBranches,
	fetchGiteaBranches,
};
