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
	/**
	 * If you are using `appDir` then you must comment the below `i18n` config out.
	 *
	 * @see https://github.com/vercel/next.js/issues/41980
	 */
	i18n: {
		locales: [
			"en",
			"es",
			"zh-Hans",
			"zh-Hant",
			"pt-br",
			"ru",
			"ja",
			"de",
			"ko",
			"fr",
			"tr",
			"it",
			"pl",
			"uk",
			"fa",
			"nl",
			"id",
			"kz",
			"no",
			"az",
			"ml",
		],
		defaultLocale: "en",
		localeDetection: false,
	},
};

export default nextConfig;
