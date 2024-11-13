import {
    type DomainSchema,
    type Schema,
    type Template,
    generateBase64,
    generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
    const mainDomain = generateRandomDomain(schema);
    
    const apiKey = Array.from({length: 64}, () => 
        Math.floor(Math.random() * 16).toString(16)).join('');
    const postgresPassword = Array.from({length: 32}, () => 
        Math.floor(Math.random() * 16).toString(16)).join('');
    const jwtSecret = Array.from({length: 32}, () => 
        Math.floor(Math.random() * 16).toString(16)).join('');
    const encryptionKey = Array.from({length: 16}, () => 
        Math.floor(Math.random() * 16).toString(16)).join('');
    
    const postgresUser = "activepieces";
    const postgresDb = "activepieces";
    const redisPassword = generateBase64(24);

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
        `AP_HOST=${mainDomain}`,
        `AP_API_KEY=${apiKey}`,
        `AP_ENCRYPTION_KEY=${encryptionKey}`,
        `AP_JWT_SECRET=${jwtSecret}`,
        `REDIS_PASSWORD=${redisPassword}`,
    ];

    return {
        domains,
        envs,
    };
} 