/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */

/** @type {import("next").NextConfig} */
const nextConfig = {
	reactStrictMode: true,
	typescript: {
		ignoreBuildErrors: true,
	},
	transpilePackages: ["@dokploy/server"],
	experimental: { cpus: Number(process.env.DOKPLOY_BUILD_CPUS || 0) || undefined },
	serverExternalPackages: ["@1password/sdk", "@1password/sdk-core"],
	webpack(config, { isServer }) {
		if (isServer) {
			config.externals.push({
				"@1password/sdk": "commonjs @1password/sdk",
				"@1password/sdk-core": "commonjs @1password/sdk-core",
			});
		}
		return config;
	},
	async headers() {
		return [
			{
				// Apply security headers to all routes
				source: "/:path*",
				headers: [
					{
						key: "X-Frame-Options",
						value: "DENY",
					},
					{
						key: "Content-Security-Policy",
						value: "frame-ancestors 'none'",
					},
					{
						key: "X-Content-Type-Options",
						value: "nosniff",
					},
					{
						key: "Referrer-Policy",
						value: "strict-origin-when-cross-origin",
					},
				],
			},
		];
	},
};

export default nextConfig;
