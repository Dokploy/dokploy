import createMDX from "fumadocs-mdx/config";

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
	eslint: {
		ignoreDuringBuilds: true,
	},
	typescript: {
		ignoreBuildErrors: true,
	},
	reactStrictMode: true,
};

export default withMDX(config);
