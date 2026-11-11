export class AzureDevopsError extends Error {
	constructor(
		message: string,
		public readonly status?: number,
	) {
		super(message);
		this.name = "AzureDevopsError";
	}
}

export const normalizeAzureDevopsUrl = (value: string) => {
	try {
		const url = new URL(value);
		if (
			url.protocol !== "https:" ||
			url.username ||
			url.password ||
			url.search ||
			url.hash ||
			/[\\\s]/.test(value) ||
			/%2f|%5c|%2e/i.test(url.pathname)
		)
			throw new Error();
		url.pathname = url.pathname.replace(/\/+$/, "");
		const isLegacyServicesOrganization =
			/^[a-z0-9][a-z0-9-]*\.visualstudio\.com$/i.test(url.hostname);
		if (
			(!url.pathname || url.pathname === "/") &&
			!isLegacyServicesOrganization
		)
			throw new Error();
		return url.toString().replace(/\/$/, "");
	} catch {
		throw new AzureDevopsError(
			"Use an HTTPS organization or collection root URL without credentials, query parameters or fragments.",
		);
	}
};

export interface AzureProject {
	id: string;
	name: string;
}
export interface AzureRepository {
	id: string;
	name: string;
	remoteUrl: string;
	defaultBranch?: string;
	project: AzureProject;
}
export interface AzureRef {
	name: string;
	objectId: string;
}
export interface AzureSubscription {
	id: string;
	actionDescription?: string;
	status?: string;
	publisherInputs?: Record<string, string>;
	consumerInputs?: Record<string, string>;
}

export class AzureDevopsClient {
	readonly baseUrl: string;
	constructor(
		baseUrl: string,
		private readonly token: string,
		private readonly request: typeof fetch = fetch,
	) {
		this.baseUrl = normalizeAzureDevopsUrl(baseUrl);
	}

	async call<T>(
		segments: string[],
		query: Record<string, string> = {},
		method = "GET",
		body?: unknown,
	): Promise<{ data: T; continuation: string | null }> {
		const url = new URL(
			`${this.baseUrl}/${segments.map(encodeURIComponent).join("/")}`,
		);
		url.search = new URLSearchParams({
			...query,
			"api-version": "7.0",
		}).toString();
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 20_000);
		try {
			const response = await this.request(url, {
				method,
				redirect: "manual",
				signal: controller.signal,
				headers: {
					Accept: "application/json",
					"Content-Type": "application/json",
					Authorization: `Basic ${Buffer.from(`:${this.token}`).toString("base64")}`,
				},
				...(body === undefined ? {} : { body: JSON.stringify(body) }),
			});
			if (!response.ok) {
				const message =
					response.status === 401
						? "Azure DevOps authentication failed. Check the PAT and IIS authentication settings."
						: response.status === 403
							? "Azure DevOps access denied. Check repository and Service Hooks permissions."
							: response.status === 404
								? "Azure DevOps resource not found. Check the collection URL and resource access."
								: response.status >= 300 && response.status < 400
									? "Azure DevOps redirected the request. Check the collection URL and authentication."
									: `Azure DevOps request failed (HTTP ${response.status}).`;
				await response.body?.cancel();
				throw new AzureDevopsError(message, response.status);
			}
			if (response.status === 204 || method === "DELETE")
				return { data: undefined as T, continuation: null };
			if (!response.headers.get("content-type")?.includes("application/json"))
				throw new AzureDevopsError(
					"Azure DevOps returned a non-JSON response. Check the collection URL and authentication.",
				);
			let data: T;
			try {
				data = (await response.json()) as T;
			} catch {
				throw new AzureDevopsError("Azure DevOps returned invalid JSON.");
			}
			return {
				data,
				continuation: response.headers.get("x-ms-continuationtoken"),
			};
		} catch (error) {
			if (error instanceof AzureDevopsError) throw error;
			const cause = error instanceof Error ? error.cause : undefined;
			const code =
				cause && typeof cause === "object" && "code" in cause
					? String(cause.code)
					: "";
			if (/CERT|TLS|SSL|SELF_SIGNED|ISSUER/.test(code))
				throw new AzureDevopsError(
					"Azure DevOps TLS verification failed. Install a trusted certificate chain and check the hostname and expiry.",
				);
			throw new AzureDevopsError(
				controller.signal.aborted
					? "Azure DevOps request timed out."
					: "Cannot reach Azure DevOps. Check the network and trusted TLS certificate.",
			);
		} finally {
			clearTimeout(timeout);
		}
	}

	async list<T>(
		segments: string[],
		query: Record<string, string> = {},
		paginate = false,
	): Promise<T[]> {
		const result: T[] = [];
		const seen = new Set<string>();
		let token: string | null = null;
		do {
			const page: { data: { value: T[] }; continuation: string | null } =
				await this.call(segments, {
					...query,
					...(token ? { continuationToken: token } : {}),
				});
			if (!Array.isArray(page.data?.value))
				throw new AzureDevopsError("Azure DevOps returned an invalid list.");
			result.push(...page.data.value);
			token = paginate ? page.continuation : null;
			if (token && seen.has(token))
				throw new AzureDevopsError("Azure DevOps repeated a pagination token.");
			if (token) seen.add(token);
		} while (token);
		return result;
	}
	projects() {
		return this.list<AzureProject>(
			["_apis", "projects"],
			{ $top: "100" },
			true,
		);
	}
	repositories(project: string) {
		return this.list<AzureRepository>([
			project,
			"_apis",
			"git",
			"repositories",
		]);
	}
	repository(project: string, repository: string) {
		return this.call<AzureRepository>([
			project,
			"_apis",
			"git",
			"repositories",
			repository,
		]).then((r) => r.data);
	}
	branches(project: string, repository: string) {
		return this.list<AzureRef>(
			[project, "_apis", "git", "repositories", repository, "refs"],
			{ filter: "heads/", $top: "1000" },
			true,
		);
	}
	subscriptions() {
		return this.list<AzureSubscription>(["_apis", "hooks", "subscriptions"]);
	}

	async changedPaths(
		project: string,
		repository: string,
		before: string,
		after: string,
	) {
		const paths = new Set<string>();
		let skip = 0;
		while (true) {
			const { data } = await this.call<{
				allChangesIncluded: boolean;
				commonCommit?: string;
				changes: {
					item?: { path?: string };
					originalPath?: string;
					sourceServerItem?: string;
				}[];
			}>(
				[
					project,
					"_apis",
					"git",
					"repositories",
					repository,
					"diffs",
					"commits",
				],
				{
					baseVersion: before,
					baseVersionType: "commit",
					targetVersion: after,
					targetVersionType: "commit",
					diffCommonCommit: "false",
					$top: "1000",
					$skip: String(skip),
				},
			);
			if (!Array.isArray(data.changes) || !data.commonCommit)
				throw new AzureDevopsError(
					"Cannot reliably compare Azure DevOps commits.",
				);
			for (const change of data.changes)
				for (const path of [
					change.item?.path,
					change.originalPath,
					change.sourceServerItem,
				])
					if (path) paths.add(path.replace(/^\/+/, "").replace(/\\/g, "/"));
			if (data.allChangesIncluded) return [...paths];
			if (!data.changes.length)
				throw new AzureDevopsError("Azure DevOps returned an incomplete diff.");
			skip += data.changes.length;
		}
	}

	cloneUrl(value: string) {
		try {
			const url = new URL(value);
			const base = new URL(this.baseUrl);
			// Azure Services remoteUrl may contain a non-secret organization username.
			if (
				url.password ||
				url.protocol !== "https:" ||
				url.origin !== base.origin ||
				!url.pathname
					.toLowerCase()
					.startsWith(`${base.pathname.replace(/\/+$/, "").toLowerCase()}/`) ||
				url.search ||
				url.hash ||
				/%2f|%5c|%2e/i.test(url.pathname)
			)
				throw new Error();
			url.username = "";
			return url.toString();
		} catch {
			throw new AzureDevopsError(
				"Azure DevOps returned a clone URL outside the configured organization or collection.",
			);
		}
	}
}
