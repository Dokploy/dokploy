import {
    type DomainSchema,
    type Schema,
    type Template,
    generatePassword,
    generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
    const mainDomain = generateRandomDomain(schema);
    const mysqlRootPassword = generatePassword();
    const mysqlPassword = generatePassword();
    const mysqlUser = "linkstack";
    const mysqlDatabase = "linkstack";

    const domains: DomainSchema[] = [
        {
            host: mainDomain,
            port: 443,
            serviceName: "linkstack",
        },
    ];

    const envs = [
        `LINKSTACK_HOST=${mainDomain}`,
        `MYSQL_ROOT_PASSWORD=${mysqlRootPassword}`,
        `MYSQL_DATABASE=${mysqlDatabase}`,
        `MYSQL_USER=${mysqlUser}`,
        `MYSQL_PASSWORD=${mysqlPassword}`,
    ];

    return {
        domains,
        envs,
    };
} 