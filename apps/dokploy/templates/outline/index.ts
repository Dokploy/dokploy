import {
	type DomainSchema,
	type Schema,
	type Template,
	generateBase64,
	generatePassword,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainDomain = generateRandomDomain(schema);
	const dexDomain = generateRandomDomain(schema);
	const SECRET_KEY = generateBase64(32);
	const UTILS_SECRET = generateBase64(32);
	const CLIENT_SECRET = generateBase64(32);
	const POSTGRES_PASSWORD = generatePassword();

	const mainURL = `http://${mainDomain}`;
	const dexURL = `http://${dexDomain}`;

	const domains: DomainSchema[] = [
		{
			host: mainDomain,
			port: 3000,
			serviceName: "outline",
		},
		{
			host: dexDomain,
			port: 5556,
			serviceName: "dex",
		},
	];

	const mounts: Template["mounts"] = [
		{
			filePath: "/etc/dex/config.yaml",
			content: `issuer: ${dexURL}

web:
  http: 0.0.0.0:5556

storage:
  type: memory

enablePasswordDB: true

frontend:
   issuer: Outline

logger:
  level: debug

staticPasswords:
  - email: "admin@example.com"
    # bcrypt hash of the string "password": $(echo password | htpasswd -BinC 10 admin | cut -d: -f2)
    hash: "$2y$10$jsRWHw54uxTUIfhjgUrB9u8HSzPk7TUuQri9sXZrKzRXcScvwYor."
    username: "admin"
    userID: "1"


oauth2:
  skipApprovalScreen: true
  alwaysShowLoginScreen: false
  passwordConnector: local

staticClients:
  - id: "outline"
    redirectURIs:
      - ${mainURL}/auth/oidc.callback
    name: "Outline"
    secret: "${CLIENT_SECRET}"`,
		},
	];

	const envs = [
		`URL=${mainURL}`,
		`DEX_URL=${dexURL}`,
		`DOMAIN_NAME=${mainDomain}`,
		`POSTGRES_PASSWORD=${POSTGRES_PASSWORD}`,
		`SECRET_KEY=${SECRET_KEY}`,
		`UTILS_SECRET=${UTILS_SECRET}`,
		`CLIENT_SECRET=${CLIENT_SECRET}`,
	];

	return {
		domains,
		envs,
		mounts,
	};
}
