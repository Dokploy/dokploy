/**
 * Configuration for the GitHub template repository
 */
export const templateConfig = {
	/**
	 * GitHub repository owner
	 * @default "dokploy"
	 */
	owner: process.env.TEMPLATE_REPO_OWNER || "dokploy",

	/**
	 * GitHub repository name
	 * @default "templates"
	 */
	repo: process.env.TEMPLATE_REPO_NAME || "templates",

	/**
	 * GitHub repository branch
	 * @default "main"
	 */
	branch: process.env.TEMPLATE_REPO_BRANCH || "main",

	/**
	 * Cache duration in milliseconds
	 * How long to cache templates before checking for updates
	 * @default 3600000 (1 hour)
	 */
	cacheDuration: Number.parseInt(
		process.env.TEMPLATE_CACHE_DURATION || "3600000",
		10,
	),

	/**
	 * GitHub API token (optional)
	 * Used for higher rate limits
	 */
	token: process.env.GITHUB_TOKEN,
};
