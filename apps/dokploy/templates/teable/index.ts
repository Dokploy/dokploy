import {
	type Schema,
	type Template,
	generateHash,
	generatePassword,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainServiceHash = generateHash(schema.projectName);
	const password = generatePassword();
	const randomDomain = generateRandomDomain(schema);

	const publicDbPort = ((min: number, max: number) => {
		return Math.random() * (max - min) + min;
	})(32769, 65534);

	const envs = [
		`TEABLE_HOST=${randomDomain}`,
		"TEABLE_PORT=3000",
		`TEABLE_DB_PORT=${publicDbPort}`,
		`HASH=${mainServiceHash}`,
		"TIMEZONE=UTC",
		"# Postgres",
		"POSTGRES_HOST=teable-db",
		"POSTGRES_PORT=5432",
		"POSTGRES_DB=teable",
		"POSTGRES_USER=teable",
		`POSTGRES_PASSWORD=${password}`,
		"# App",
		"PUBLIC_ORIGIN=https://${TEABLE_HOST}",
		"PRISMA_DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}",
		"PUBLIC_DATABASE_PROXY=${TEABLE_HOST}:${TEABLE_DB_PORT}",
		"# Need to support sending emails to enable the following configurations",
		"# You need to modify the configuration according to the actual situation, otherwise it will not be able to send emails correctly.",
		"#BACKEND_MAIL_HOST=smtp.teable.io",
		"#BACKEND_MAIL_PORT=465",
		"#BACKEND_MAIL_SECURE=true",
		"#BACKEND_MAIL_SENDER=noreply.teable.io",
		"#BACKEND_MAIL_SENDER_NAME=Teable",
		"#BACKEND_MAIL_AUTH_USER=username",
		"#BACKEND_MAIL_AUTH_PASS=password",
	];

	return {
		envs,
	};
}
