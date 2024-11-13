import {
    type DomainSchema,
    type Schema,
    type Template,
    generateBase64,
    generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
    const mainDomain = generateRandomDomain(schema);
    
    const apiKey = generateBase64(48);        
    const postgresPassword = generateBase64(24); 
    const jwtSecret = generateBase64(24);
    const encryptionKey = generateBase64(12);
    const redisPassword = generateBase64(24);
    
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