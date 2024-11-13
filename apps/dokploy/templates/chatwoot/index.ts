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
        `POSTGRES_USERNAME=postgres`,
        `POSTGRES_USER=postgres`,
        `POSTGRES_PASSWORD=${postgresPassword}`,
        `POSTGRES_DB=chatwoot_production`,
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