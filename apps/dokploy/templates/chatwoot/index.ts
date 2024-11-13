import {
    type DomainSchema,
    type Schema,
    type Template,
    generatePassword,
    generateRandomDomain,
    generateBase64,
} from "../utils";

export function generate(schema: Schema): Template {
    const mainDomain = generateRandomDomain(schema);
    const postgresUsername = "postgres";
    const postgresPassword = generatePassword();
    const redisPassword = generatePassword();
    const secretKeyBase = generateBase64(64);

    const domains: DomainSchema[] = [
        {
            host: mainDomain,
            port: 3000,
            serviceName: "rails",
        },
    ];

    const envs = [
        `POSTGRES_DB=chatwoot`,
        `POSTGRES_USER=${postgresUsername}`,
        `POSTGRES_PASSWORD=${postgresPassword}`,
        `REDIS_PASSWORD=${redisPassword}`,
        `CHATWOOT_HOST=${mainDomain}`,
        `SECRET_KEY_BASE=${secretKeyBase}`,
        `SMTP_ADDRESS=`,
        `SMTP_PORT=587`,
        `SMTP_USERNAME=`,
        `SMTP_PASSWORD=`,
    ];

    return {
        domains,
        envs,
    };
} 