export const shellQuote = (value: string) =>
	`'${value.replaceAll("'", "'\\''")}'`;

export const buildAuthorizedKeysAppendCommand = (publicKey: string) =>
	`printf '%s\\n' ${shellQuote(publicKey)} >> ~/.ssh/authorized_keys`;

export const buildSshLoginCommand = (
	username: string | null | undefined,
	host: string | null | undefined,
) => `ssh -- ${shellQuote(`${username ?? ""}@${host ?? ""}`)}`;
