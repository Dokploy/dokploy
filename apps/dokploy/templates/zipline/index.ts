import { generateBase64, generateHash, generateRandomDomain, type Schema, type Template } from "@/templates/utils"

export function generate(schema: Schema): Template {
  const mainServiceHash = generateHash(schema.projectName);
  const randomDomain = generateRandomDomain(schema);
  const secretBase = generateBase64(64);

  const envs = [
    `ZIPLINE_HOST=${randomDomain}`,
    `ZIPLINE_PORT=3000`,
    `ZIPLINE_SECRET=${secretBase}`,
    `HASH=${mainServiceHash}`,
  ]

  return {
    envs
  }
}