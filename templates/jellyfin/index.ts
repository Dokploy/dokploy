// EXAMPLE
import {
  generateHash,
  generateRandomDomain,
  type Template,
  type Schema,
} from "../utils";

export function generate(schema: Schema): Template {
  const mainServiceHash = generateHash(schema.projectName);
  const randomDomain = generateRandomDomain(schema);
  const port = 8096;
  const envs = [
    `JELLYFIN_HOST=${randomDomain}`,
    `HASH=${mainServiceHash}`,
    `JELLYFIN_PORT=${port}`
  ];

  return {
    envs,
  };
}
