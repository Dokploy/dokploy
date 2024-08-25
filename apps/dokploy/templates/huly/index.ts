import {
  generateHash,
  generateRandomDomain,
  generateBase64,
  generatePassword,
  type Template,
  type Schema,
  type DomainSchema,
} from "../utils";

export function generate(schema: Schema): Template {
  const mainDomain = generateRandomDomain(schema);
  const serverSecret = generateBase64(32);
  const minioAccessKey = "minioadmin";
  const minioSecretKey = "minioadmin";
  const hulyVersion = "v0.6.265";

  const domains: DomainSchema[] = [
    {
      host: mainDomain,
      port: 8087,
      serviceName: "front",
    },
    {
      host: `account.${mainDomain}`,
      port: 3001,
      serviceName: "account",
    },
    {
      host: `collaborator.${mainDomain}`,
      port: 3078,
      serviceName: "collaborator",
    },
    {
      host: `transactor.${mainDomain}`,
      port: 3333,
      serviceName: "transactor",
    },
    {
      host: `rekoni.${mainDomain}`,
      port: 4004,
      serviceName: "rekoni",
    },
  ];

  const envs = [
    `SERVER_ADDRESS=${mainDomain}`,
    `HULY_VERSION=${hulyVersion}`,
    `SERVER_SECRET=${serverSecret}`,
    `MINIO_ACCESS_KEY=${minioAccessKey}`,
    `MINIO_SECRET_KEY=${minioSecretKey}`,
  ];

  const mounts: Template["mounts"] = [
    {
      filePath: "./docker-compose.yml",
    },
  ];

  return {
    envs,
    mounts,
    domains,
  };
}