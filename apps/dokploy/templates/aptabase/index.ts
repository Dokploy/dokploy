import {
  type DomainSchema,
  type Schema,
  type Template,
  generateBase64,
  generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
  const mainDomain = generateRandomDomain(schema);
  const authSecret = generateBase64(32);
  const postgresPassword = generateBase64(16);
  const clickhousePassword = generateBase64(16);

  const domains: DomainSchema[] = [
    {
      host: mainDomain,
      port: 8000,
      serviceName: "aptabase",
    },
  ];

  const envs = [
    `BASE_URL=http://${mainDomain}`,
    `AUTH_SECRET=${authSecret}`,
    `POSTGRES_PASSWORD=${postgresPassword}`,
    `CLICKHOUSE_PASSWORD=${clickhousePassword}`,
    `DATABASE_URL=Server=aptabase_db;Port=5432;User Id=aptabase;Password=${postgresPassword};Database=aptabase`,
    `CLICKHOUSE_URL=Host=aptabase_events_db;Port=8123;Username=aptabase;Password=${clickhousePassword}`,
  ];

  return {
    envs,
    domains,
  };
}
