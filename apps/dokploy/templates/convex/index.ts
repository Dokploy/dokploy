import {
  type DomainSchema,
  type Schema,
  type Template,
  generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
  const dashboardDomain = generateRandomDomain(schema);
  const backendDomain = generateRandomDomain(schema);
  const actionsDomain = generateRandomDomain(schema);

  const domains: DomainSchema[] = [
    {
      host: dashboardDomain,
      port: 6791,
      serviceName: "dashboard",
    },
    {
      host: backendDomain,
      port: 3210,
      serviceName: "backend",
    },
    {
      host: actionsDomain,
      port: 3211,
      serviceName: "backend",
    },
  ];

  const envs = [
    `NEXT_PUBLIC_DEPLOYMENT_URL=${backendDomain}`,
    `CONVEX_CLOUD_ORIGIN=${backendDomain}`,
    `CONVEX_SITE_ORIGIN=${actionsDomain}`,
  ];

  return { envs, domains };
}
