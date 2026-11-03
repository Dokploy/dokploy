/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */

/** @type {import("next").NextConfig} */
const nextConfig = {
	reactStrictMode: true,
	poweredByHeader: false,
	typescript: {
		ignoreBuildErrors: true,
	},
	transpilePackages: ["@dokploy/server"],
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
						value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
					},
					{
						key: "Permissions-Policy",
						value: "camera=(), microphone=(), geolocation=()",
					},
					{
						key: "X-Permitted-Cross-Domain-Policies",
						value: "none",
					},
					{
						key: "Cross-Origin-Opener-Policy",
						value: "same-origin",
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
