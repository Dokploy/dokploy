/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */

import CopyWebpackPlugin from "copy-webpack-plugin";
import path from "node:path";
import { fileURLToPath } from "node:url";
import SmartLocalePlugin from "./i18n/InternationalizationKit/smartLocale/smartLocale.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
/** @type {import("next").NextConfig} */
const nextConfig = {
	reactStrictMode: true,
	eslint: {
		ignoreDuringBuilds: true,
	},
	typescript: {
		ignoreBuildErrors: true,
	},
	webpack: (config) => {
		config.plugins.push(
			new CopyWebpackPlugin({
				patterns: [
					{
						from: path.resolve(__dirname, "templates/**/*.yml"),
						to: ({ context, absoluteFilename }) => {
							const relativePath = path.relative(
								path.resolve(__dirname, "templates"),
								absoluteFilename || context,
							);
							return path.join(__dirname, ".next", "templates", relativePath);
						},
						globOptions: {
							ignore: ["**/node_modules/**"],
						},
					},
				],
			}),
		);
		config.plugins.push(new SmartLocalePlugin({
			inputDirectory: "./i18n/locales/",
			outputDirectory: "./i18n/InternationalizationKit/interface/",
			outputImportDirectory: "./i18n/",
			defaultLocale: "zh-hans-cn",
			fileType: "json",
		}));
		return config;
	},

	/**
	 * If you are using `appDir` then you must comment the below `i18n` config out.
	 *
	 * @see https://github.com/vercel/next.js/issues/41980
	 */
	i18n: {
		locales: ["en"],
		defaultLocale: "en",
	},
};

export default nextConfig;
