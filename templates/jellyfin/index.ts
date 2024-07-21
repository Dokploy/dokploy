// EXAMPLE
import {
  generateHash,
  generateRandomDomain,
  type Template,
  type Schema,
} from "../utils";

export function generate(schema: Schema): Template {
  const randomDomain = generateRandomDomain(schema);

  const envs = [
    `JELLYFIN_HOST=${randomDomain}`,
  ];

  return {
    envs,
  };
}
