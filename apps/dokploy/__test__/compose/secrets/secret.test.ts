import type { ComposeSpecification } from "@dokploy/server";
import { addSuffixToAllSecrets } from "@dokploy/server";
import { load } from "js-yaml";
import { expect, test } from "vitest";

const composeFileCombinedSecrets = `
version: "3.8"

services:
  web:
    image: nginx:latest
    secrets:
      - web_secret

  app:
    image: node:14
    secrets:
      - app_secret

secrets:
  web_secret:
    file: ./web_secret.txt

  app_secret:
    file: ./app_secret.txt
`;

const expectedComposeFileCombinedSecrets = load(`
version: "3.8"

services:
  web:
    image: nginx:latest
    secrets:
      - web_secret-testhash

  app:
    image: node:14
    secrets:
      - app_secret-testhash

secrets:
  web_secret-testhash:
    file: ./web_secret.txt

  app_secret-testhash:
    file: ./app_secret.txt
`) as ComposeSpecification;

test("Add suffix to all secrets", () => {
	const composeData = load(composeFileCombinedSecrets) as ComposeSpecification;
	const suffix = "testhash";

	const updatedComposeData = addSuffixToAllSecrets(composeData, suffix);

	expect(updatedComposeData).toEqual(expectedComposeFileCombinedSecrets);
});

const composeFileCombinedSecrets3 = `
version: "3.8"

services:
  api:
    image: myapi:latest
    secrets:
      - api_key

  cache:
    image: redis:latest
    secrets:
      - cache_secret

secrets:
  api_key:
    file: ./api_key.txt
  cache_secret:
    file: ./cache_secret.txt
`;

const expectedComposeFileCombinedSecrets3 = load(`
version: "3.8"

services:
  api:
    image: myapi:latest
    secrets:
      - api_key-testhash

  cache:
    image: redis:latest
    secrets:
      - cache_secret-testhash

secrets:
  api_key-testhash:
    file: ./api_key.txt
  cache_secret-testhash:
    file: ./cache_secret.txt
`) as ComposeSpecification;

test("Add suffix to all secrets (3rd Case)", () => {
	const composeData = load(composeFileCombinedSecrets3) as ComposeSpecification;
	const suffix = "testhash";

	const updatedComposeData = addSuffixToAllSecrets(composeData, suffix);

	expect(updatedComposeData).toEqual(expectedComposeFileCombinedSecrets3);
});

const composeFileCombinedSecrets4 = `
version: "3.8"

services:
  web:
    image: nginx:latest
    secrets:
      - web_secret

  db:
    image: postgres:latest
    secrets:
      - db_password

secrets:
  web_secret:
    file: ./web_secret.txt
  db_password:
    file: ./db_password.txt
`;

const expectedComposeFileCombinedSecrets4 = load(`
version: "3.8"

services:
  web:
    image: nginx:latest
    secrets:
      - web_secret-testhash

  db:
    image: postgres:latest
    secrets:
      - db_password-testhash

secrets:
  web_secret-testhash:
    file: ./web_secret.txt
  db_password-testhash:
    file: ./db_password.txt
`) as ComposeSpecification;

test("Add suffix to all secrets (4th Case)", () => {
	const composeData = load(composeFileCombinedSecrets4) as ComposeSpecification;
	const suffix = "testhash";

	const updatedComposeData = addSuffixToAllSecrets(composeData, suffix);

	expect(updatedComposeData).toEqual(expectedComposeFileCombinedSecrets4);
});
