import {
    type DomainSchema,
    type Schema,
    type Template,
    generatePassword,
    generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
    const mainDomain = generateRandomDomain(schema);
    const postgresPassword = generatePassword();
    const postgresUser = "activepieces";
    const postgresDb = "activepieces";

    const domains: DomainSchema[] = [
        {
            host: mainDomain,
            port: 80,
            serviceName: "activepieces",
        },
    ];

    const envs = [
        `AP_POSTGRES_DATABASE=${postgresDb}`,
        `AP_POSTGRES_PASSWORD=${postgresPassword}`,
        `AP_POSTGRES_USERNAME=${postgresUser}`,
        `AP_POSTGRES_PORT=5432`,
        `AP_REDIS_PORT=6379`,
    ];

    return {
        domains,
        envs,
    };
} 