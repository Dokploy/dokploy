import {
    type DomainSchema,
    type Schema,
    type Template,
    generateBase64,
    generateRandomDomain,
    generatePassword,
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
        `CHATWOOT_HOST=${mainDomain}`,
        `POSTGRES_PASSWORD=${postgresPassword}`,
        `REDIS_PASSWORD=${redisPassword}`,
        `SECRET_KEY_BASE=${secretKeyBase}`,
    ];

    return {
        domains,
        envs,
    };
} 