import {
	type DomainSchema,
	type Schema,
	type Template,
	generatePassword,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainDomain = generateRandomDomain(schema);
	const mysqlPassword = generatePassword();
	const mysqlRootPassword = generatePassword();
	const mysqlUser = "tickets";
	const mysqlDatabase = "tickets";

	const encryptionKey = Array.from({ length: 48 }, () =>
		Math.floor(Math.random() * 16).toString(16),
	).join("");

	const domains: DomainSchema[] = [
		{
			host: mainDomain,
			port: 8169,
			serviceName: "tickets-app",
		},
	];

	const envs = [
		`TICKETS_HOST=${mainDomain}`,
		`MYSQL_DATABASE=${mysqlDatabase}`,
		`MYSQL_PASSWORD=${mysqlPassword}`,
		`MYSQL_ROOT_PASSWORD=${mysqlRootPassword}`,
		`MYSQL_USER=${mysqlUser}`,
		`ENCRYPTION_KEY=${encryptionKey}`,
		"# Follow the guide at: https://discordtickets.app/self-hosting/installation/docker/#creating-the-discord-application",
		"DISCORD_SECRET=",
		"DISCORD_TOKEN=",
		"SUPER_USERS=YOUR_DISCORD_USER_ID", // Default super user
	];

	return {
		domains,
		envs,
	};
}
