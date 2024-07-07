/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */

/** @type {import("next").NextConfig} */
const config = {
    experimental:{
        esmExternals:"loose",
        // serverComponentsExternalPackages: ['node-pty'],
    },
    webpack: (config) => {
        // config.externals = [...config.externals, { dockerode: "dockerode" }]; 
        return config;
      },
};

export default config;
