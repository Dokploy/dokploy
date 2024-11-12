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

    const domains: DomainSchema[] = [
        {
            host: mainDomain,
            port: 80,
            serviceName: "caddy",
        },
    ];

    const envs = [
        `WINDMILL_HOST=${mainDomain}`,
        `POSTGRES_PASSWORD=${postgresPassword}`,
        `DATABASE_URL=postgres://postgres:${postgresPassword}@db/windmill?sslmode=disable`,
    ];

    const mounts: Template["mounts"] = [
        {
            filePath: "./Caddyfile",
            content: `{$BASE_URL} {
    bind {$ADDRESS}
    reverse_proxy /ws/* http://lsp:3001
    reverse_proxy /* http://windmill_server:8000
}`
        },
    ];

    return {
        domains,
        envs,
        mounts,
    };
} 