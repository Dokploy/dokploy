import {
  type DomainSchema,
  type Schema,
  type Template,
  generateBase64,
  generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
  const triggerDomain = generateRandomDomain(schema);
  const providerSecret = generateBase64(32);
  const coordinatorSecret = generateBase64(32);
  const dbPassword = generateBase64(24);
  const dbUser = "triggeruser";
  const dbName = "triggerdb";

  const domains: DomainSchema[] = [
    {
      host: triggerDomain,
      port: 3040,
      serviceName: "webapp",
    },
  ];

  const envs = [
    // Database configuration with secure credentials
    `POSTGRES_USER=${dbUser}`,
    `POSTGRES_PASSWORD=${dbPassword}`,
    `POSTGRES_DB=${dbName}`,
    `DATABASE_URL=postgresql://${dbUser}:${dbPassword}@postgres:5432/${dbName}`,

    // Trigger configuration
    `TRIGGER_DOMAIN=${triggerDomain}`,
    "TRIGGER_PROTOCOL=http",

    // Secrets for services
    `PROVIDER_SECRET=${providerSecret}`,
    `COORDINATOR_SECRET=${coordinatorSecret}`,

    // Optional configurations with defaults
    "TRIGGER_IMAGE_TAG=v3",
    "POSTGRES_IMAGE_TAG=16",
    "REDIS_IMAGE_TAG=7",
    "ELECTRIC_IMAGE_TAG=latest",
    "RESTART_POLICY=unless-stopped",

    // Network bindings
    "WEBAPP_PUBLISH_IP=127.0.0.1",
    "DOCKER_PUBLISH_IP=127.0.0.1",
  ];

  return {
    envs,
    domains,
  };
}
