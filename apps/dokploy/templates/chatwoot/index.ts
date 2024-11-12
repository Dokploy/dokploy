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
    const postgresUsername = "chatwoot";
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
        `CHATWOOT_HOST=${mainDomain}`,
        `POSTGRES_USERNAME=${postgresUsername}`,
        `POSTGRES_PASSWORD=${postgresPassword}`,
        `REDIS_PASSWORD=${redisPassword}`,
        `SECRET_KEY_BASE=${secretKeyBase}`,
        `SMTP_ADDRESS=${process.env.SMTP_ADDRESS || ''}`,
        `SMTP_PORT=${process.env.SMTP_PORT || '587'}`,
        `SMTP_USERNAME=${process.env.SMTP_USERNAME || ''}`,
        `SMTP_PASSWORD=${process.env.SMTP_PASSWORD || ''}`,
    ];

    return {
        domains,
        envs,
    };
} 