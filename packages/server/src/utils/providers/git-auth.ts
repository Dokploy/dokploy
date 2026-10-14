type GitCloneAuthConfig = {
	authorization: string;
	authUrls?: Array<string | null | undefined>;
	cloneBaseUrl: string;
	enableSubmodules: boolean;
	sshHosts?: string[];
};

const quoteShellArgument = (value: string) =>
	`'${value.replaceAll("'", "'\\''")}'`;

const normalizeProviderUrl = (url: string) =>
	/^[a-z][a-z\d+.-]*:\/\//i.test(url) ? url : `https://${url}`

const getConfigBaseUrl = (url: string) => {
	const parsedUrl = new URL(normalizeProviderUrl(url));
	const path = parsedUrl.pathname.replace(/\/+$/, "");
	return `${parsedUrl.protocol}//${parsedUrl.host}${path}/`;
};

export const getGitSshHosts = (
	...providerUrls: Array<string | null | undefined>
) =>
	Array.from(
		new Set(
			providerUrls
				.filter((url): url is string => !!url)
				.map((url) => new URL(normalizeProviderUrl(url)).hostname),
		),
	);

export const getGitCloneAuthConfig = ({
	authorization,
	authUrls = [],
	cloneBaseUrl,
	enableSubmodules,
	sshHosts = [],
}: GitCloneAuthConfig) => {
	const configBaseUrl = getConfigBaseUrl(cloneBaseUrl);
	const configAuthUrls = new Set(
		[cloneBaseUrl, ...authUrls]
			.filter((url): url is string => !!url)
			.map(getConfigBaseUrl),
	);
	const config = Array.from(
		configAuthUrls,
		(url) =>
			`-c ${quoteShellArgument(`http.${url}.extraheader=${authorization}`)}`,
	);

	if (enableSubmodules) {
		for (const host of new Set(sshHosts)) {
			config.push(
				`-c ${quoteShellArgument(`url.${configBaseUrl}.insteadOf=git@${host}:`)}`,
				`-c ${quoteShellArgument(`url.${configBaseUrl}.insteadOf=ssh://git@${host}/`)}`,
				`-c ${quoteShellArgument(`url.${configBaseUrl}.insteadOf=ssh://git@${host}:22/`)}`,
			);
		}
	}

	return config.join(" ");
};

type GitSubmoduleUpdateCommand = {
	cloneBaseUrl: string;
	gitCloneConfig: string;
	outputPath: string;
	sshHosts: string[];
};

export const getGitSubmoduleUpdateCommand = ({
	cloneBaseUrl,
	gitCloneConfig,
	outputPath,
	sshHosts,
}: GitSubmoduleUpdateCommand) => {
	const hostPatterns = sshHosts.map(quoteShellArgument).join("|") || "''";
	const script = [
		"set -e",
		"repo=$1",
		'gitmodules="$repo/.gitmodules"',
		'if [ -f "$gitmodules" ]; then',
		"\twhile IFS= read -r key; do",
		'\t\tsubmodule_url=$(git -C "$repo" config --file "$gitmodules" --get "$key") || continue',
		'\t\tcase "$submodule_url" in',
		"\t\t\tssh://*) ;;",
		"\t\t\t*) continue ;;",
		"\t\tesac",
		"\t\tauthority=${submodule_url#ssh://}",
		"\t\tauthority=${authority%%/*}",
		"\t\tauthority_host=${authority##*@}",
		'\t\tcase "$authority_host" in',
		"\t\t\t\\[*\\]:*)",
		"\t\t\t\tssh_host=${authority_host%%]*}",
		"\t\t\t\tssh_host=${ssh_host#\\[}",
		'\t\t\t\tssh_host="[$ssh_host]"',
		"\t\t\t\tssh_port=${authority_host##*:}",
		"\t\t\t\t;;",
		"\t\t\t*:*)",
		"\t\t\t\tssh_host=${authority_host%%:*}",
		"\t\t\t\tssh_port=${authority_host##*:}",
		"\t\t\t\t;;",
		"\t\t\t*) continue ;;",
		"\t\tesac",
		'\t\tcase "$ssh_port" in',
		'\t\t\t""|*[!0-9]*) continue ;;',
		"\t\tesac",
		`\t\tcase "$ssh_host" in ${hostPatterns}) ;; *) continue ;; esac`,
		"\t\tconfig_count=${GIT_CONFIG_COUNT:-0}",
		'\t\tcase "$config_count" in ""|*[!0-9]*) config_count=0 ;; esac',
		'\t\tconfig_key="url.$DOKPLOY_GIT_SUBMODULE_CLONE_BASE.insteadOf"',
		'\t\tconfig_value="ssh://$authority/"',
		'\t\texport "GIT_CONFIG_KEY_$config_count=$config_key"',
		'\t\texport "GIT_CONFIG_VALUE_$config_count=$config_value"',
		"\t\tGIT_CONFIG_COUNT=$((config_count + 1))",
		"\t\texport GIT_CONFIG_COUNT",
		"\tdone <<EOF",
		'$(git -C "$repo" config --file "$gitmodules" --name-only --get-regexp \'^submodule\\..*\\.url$\' 2>/dev/null || true)',
		"EOF",
		"fi",
		`git ${gitCloneConfig} -C "$repo" submodule update --init --depth 1`,
		`git ${gitCloneConfig} -C "$repo" submodule foreach --quiet 'sh -c "$DOKPLOY_GIT_SUBMODULE_AUTH_SCRIPT" -- "$PWD"'`,
	].join("\n");

	return [
		`DOKPLOY_GIT_SUBMODULE_CLONE_BASE=${quoteShellArgument(getConfigBaseUrl(cloneBaseUrl))}`,
		`DOKPLOY_GIT_SUBMODULE_AUTH_SCRIPT=${quoteShellArgument(script)}`,
		"export DOKPLOY_GIT_SUBMODULE_CLONE_BASE DOKPLOY_GIT_SUBMODULE_AUTH_SCRIPT",
		`sh -c "$DOKPLOY_GIT_SUBMODULE_AUTH_SCRIPT" -- ${quoteShellArgument(outputPath)}`,
	].join(";");
};
