type GitCloneAuthConfig = {
	authorization: string
	authUrls?: Array<string | null | undefined>
	cloneBaseUrl: string
	enableSubmodules: boolean
	sshHosts?: string[]
}

const quoteShellArgument = (value: string) =>
	`'${value.replaceAll("'", "'\\''")}'`

export const getGitSshHosts = (
	...providerUrls: Array<string | null | undefined>
) =>
	Array.from(
		new Set(
			providerUrls
				.filter((url): url is string => !!url)
				.map((url) => new URL(url).hostname),
		),
	)

export const getGitCloneAuthConfig = ({
	authorization,
	authUrls = [],
	cloneBaseUrl,
	enableSubmodules,
	sshHosts = [],
}: GitCloneAuthConfig) => {
	const getConfigBaseUrl = (url: string) => {
		const parsedUrl = new URL(url)
		const path = parsedUrl.pathname.replace(/\/+$/, "")
		return `${parsedUrl.protocol}//${parsedUrl.host}${path}/`
	}
	const configBaseUrl = getConfigBaseUrl(cloneBaseUrl)
	const configAuthUrls = new Set(
		[cloneBaseUrl, ...authUrls]
			.filter((url): url is string => !!url)
			.map(getConfigBaseUrl),
	)
	const config = Array.from(configAuthUrls, (url) =>
		`-c ${quoteShellArgument(`http.${url}.extraheader=${authorization}`)}`,
	)

	if (enableSubmodules) {
		for (const host of new Set(sshHosts)) {
			config.push(
				`-c ${quoteShellArgument(`url.${configBaseUrl}.insteadOf=git@${host}:`)}`,
				`-c ${quoteShellArgument(`url.${configBaseUrl}.insteadOf=ssh://git@${host}/`)}`,
				`-c ${quoteShellArgument(`url.${configBaseUrl}.insteadOf=ssh://git@${host}:22/`)}`,
			)
		}
	}

	return config.join(" ")
}
