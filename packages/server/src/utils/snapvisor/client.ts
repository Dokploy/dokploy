/**
 * Minimal Snapvisor (Argos-fork) REST client.
 *
 * Snapvisor's public API is mounted under `/v2` (`apps/backend/src/api/index.ts`
 * → `apps/backend/src/web/api/index.ts` in the Snapvisor repo, which does
 * `router.use("/v2", v2)`). Every call here uses a **personal access token**
 * as a bearer token (`apps/backend/src/api/security.ts`:
 * `Authorization: Bearer <personal-access-token>`), because listing an
 * account's projects (`GET /v2/accounts/{accountSlug}/projects`,
 * `patOrOAuthAuth` in `apps/backend/src/api/handlers/listProjects.ts`) only
 * accepts a PAT or OAuth, never a project token. The build endpoints used
 * below (`apps/backend/src/api/handlers/{getMe,getProject,listBuilds,getBuild}.ts`)
 * accept a PAT too (`anyTokenOrOAuthAuth`), so one token covers everything the
 * fork needs.
 */

import { normalizeSnapvisorApiBaseUrl } from "./urls";

export class SnapvisorError extends Error {
	readonly status?: number;

	constructor(message: string, options: { status?: number } = {}) {
		super(message);
		this.name = "SnapvisorError";
		this.status = options.status;
	}
}

export interface SnapvisorClientOptions {
	baseUrl: string;
	accessToken: string;
	timeoutMs?: number;
	fetchImpl?: typeof fetch;
}

export interface SnapvisorAccount {
	id: string;
	slug: string;
	name: string;
	type: string;
	mcpAccessIncluded: boolean;
}

export interface SnapvisorMe {
	user: { id: string; name: string | null; email: string };
	accounts: SnapvisorAccount[];
	github: { connected: boolean; login: string | null };
}

export interface SnapvisorProject {
	id: string;
	account: { id: string; slug: string };
	name: string;
	private: boolean;
}

export interface SnapvisorBuildGitReference {
	sha: string;
	branch: string;
}

export interface SnapvisorBuildStats {
	added: number;
	removed: number;
	unchanged: number;
	changed: number;
	ignored: number;
	failure: number;
	retryFailure: number;
	total: number;
}

/**
 * `Build.status` on the wire (`packages/schemas/src/build-status.ts` in the
 * Snapvisor repo): the review outcome when reviewed, the diff outcome once
 * complete, or the run status otherwise.
 */
export type SnapvisorBuildStatus =
	| "accepted"
	| "rejected"
	| "no-changes"
	| "changes-detected"
	| "expired"
	| "pending"
	| "progress"
	| "error"
	| "aborted";

export interface SnapvisorBuild {
	id: string;
	number: number;
	head: SnapvisorBuildGitReference;
	base: SnapvisorBuildGitReference | null;
	status: SnapvisorBuildStatus;
	stats: SnapvisorBuildStats | null;
	url: string;
}

interface SnapvisorPage<T> {
	results: T[];
	pageInfo: { total: number; page: number; perPage: number };
}

const DEFAULT_TIMEOUT_MS = 15_000;

export const snapvisorApiUrl = (baseUrl: string) =>
	`${normalizeSnapvisorApiBaseUrl(baseUrl)}/v2`;

export interface SnapvisorClient {
	getMe(): Promise<SnapvisorMe>;
	listProjects(accountSlug: string): Promise<SnapvisorProject[]>;
	getProject(accountSlug: string, projectName: string): Promise<SnapvisorProject>;
	listBuilds(params: {
		accountSlug: string;
		projectName: string;
		headSha?: string;
		perPage?: number;
	}): Promise<SnapvisorBuild[]>;
	getBuild(
		accountSlug: string,
		projectName: string,
		buildNumber: number,
	): Promise<SnapvisorBuild>;
}

export const createSnapvisorClient = (
	options: SnapvisorClientOptions,
): SnapvisorClient => {
	const apiUrl = snapvisorApiUrl(options.baseUrl);
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const fetchImpl = options.fetchImpl ?? fetch;

	const request = async <T>(path: string): Promise<T> => {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		let response: Response;
		let body: string;
		try {
			response = await fetchImpl(`${apiUrl}${path}`, {
				method: "GET",
				headers: {
					Accept: "application/json",
					Authorization: `Bearer ${options.accessToken}`,
				},
				signal: controller.signal,
			});
			body = await response.text();
		} catch (error) {
			if (controller.signal.aborted) {
				throw new SnapvisorError(
					`Snapvisor did not respond within ${Math.round(timeoutMs / 1000)}s`,
				);
			}
			throw new SnapvisorError(
				`Could not reach Snapvisor at ${apiUrl}: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		} finally {
			clearTimeout(timer);
		}

		if (!response.ok) {
			if (response.status === 401 || response.status === 403) {
				throw new SnapvisorError(
					"Snapvisor rejected the access token. Check the personal access token in Settings → Integrations.",
					{ status: response.status },
				);
			}
			if (response.status === 404) {
				throw new SnapvisorError("Snapvisor project not found", {
					status: 404,
				});
			}
			let message = `Snapvisor responded with HTTP ${response.status}`;
			try {
				const parsed = JSON.parse(body) as { message?: string };
				if (parsed?.message) message = parsed.message;
			} catch {
				// Ignore non-JSON error bodies.
			}
			throw new SnapvisorError(message, { status: response.status });
		}

		try {
			return JSON.parse(body) as T;
		} catch {
			throw new SnapvisorError("Snapvisor returned a non-JSON response");
		}
	};

	return {
		async getMe() {
			return request<SnapvisorMe>("/me");
		},
		async listProjects(accountSlug: string) {
			const page = await request<SnapvisorPage<SnapvisorProject>>(
				`/accounts/${encodeURIComponent(accountSlug)}/projects?perPage=100`,
			);
			return page.results;
		},
		async getProject(accountSlug: string, projectName: string) {
			return request<SnapvisorProject>(
				`/projects/${encodeURIComponent(accountSlug)}/${encodeURIComponent(projectName)}`,
			);
		},
		async listBuilds({ accountSlug, projectName, headSha, perPage = 10 }) {
			const query = new URLSearchParams({ perPage: String(perPage) });
			if (headSha) query.set("headSha", headSha);
			const page = await request<SnapvisorPage<SnapvisorBuild>>(
				`/projects/${encodeURIComponent(accountSlug)}/${encodeURIComponent(
					projectName,
				)}/builds?${query.toString()}`,
			);
			return page.results;
		},
		async getBuild(accountSlug: string, projectName: string, buildNumber: number) {
			return request<SnapvisorBuild>(
				`/projects/${encodeURIComponent(accountSlug)}/${encodeURIComponent(
					projectName,
				)}/builds/${buildNumber}`,
			);
		},
	};
};
