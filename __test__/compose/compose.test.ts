import { expect, test } from "vitest";
import { load } from "js-yaml";
import { addPrefixToAllProperties } from "@/server/utils/docker/compose";
import type { ComposeSpecification } from "@/server/utils/docker/types";

const complexComposeFile = `
version: "3.8"

services:
  app:
    image: nginx:alpine
    container_name: app-container
    configs:
      - source: app-config
        target: /etc/nginx/nginx.conf
    secrets:
      - source: app-secret
        target: /run/secrets/app-secret
    networks:
       frontend:
        aliases:
          - api
    volumes:
      - type: volume
        source: app-volume
        target: /app/data

  api:
    image: node:alpine
    container_name: api-container
    configs:
      - source: api-config
        target: /usr/src/app/config.json
    secrets:
      - source: api-secret
        target: /run/secrets/api-secret
    networks:
      - frontend
    volumes:
      - type: volume
        source: api-volume
        target: /api/data

volumes:
  app-volume:
    driver: local
  api-volume:
    driver: local

networks:
  frontend:
    driver: bridge

configs:
  app-config:
    file: ./nginx.conf
  api-config:
    file: ./config.json

secrets:
  app-secret:
    file: ./app-secret.txt
  api-secret:
    file: ./api-secret.txt
`;

const expectedComposeFile = load(`
version: "3.8"

services:
  app-testprefix:
    image: nginx:alpine
    container_name: app-container-testprefix
    configs:
      - source: app-config-testprefix
        target: /etc/nginx/nginx.conf
    secrets:
      - source: app-secret-testprefix
        target: /run/secrets/app-secret
    networks:
       frontend-testprefix:
        aliases:
          - api-testprefix
    volumes:
      - type: volume
        source: app-volume-testprefix
        target: /app/data

  api-testprefix:
    image: node:alpine
    container_name: api-container-testprefix
    configs:
      - source: api-config-testprefix
        target: /usr/src/app/config.json
    secrets:
      - source: api-secret-testprefix
        target: /run/secrets/api-secret
    networks:
      - frontend-testprefix
    volumes:
      - type: volume
        source: api-volume-testprefix
        target: /api/data

volumes:
  app-volume-testprefix:
    driver: local
  api-volume-testprefix:
    driver: local

networks:
  frontend-testprefix:
    driver: bridge

configs:
  app-config-testprefix:
    file: ./nginx.conf
  api-config-testprefix:
    file: ./config.json

secrets:
  app-secret-testprefix:
    file: ./app-secret.txt
  api-secret-testprefix:
    file: ./api-secret.txt
`) as ComposeSpecification;

test("Add prefix to all properties in a Docker Compose file", () => {
	const composeData = load(complexComposeFile) as ComposeSpecification;

	const prefix = "testprefix";
	const updatedComposeData = addPrefixToAllProperties(composeData, prefix);
	console.log(updatedComposeData);
	expect(updatedComposeData).toEqual(expectedComposeFile);
});

const complexComposeFile1 = `
version: "3.8"

services:
  web:
    image: httpd:alpine
    container_name: web-container
    configs:
      - source: web-config
        target: /usr/local/apache2/conf/httpd.conf
    secrets:
      - source: web-secret
        target: /run/secrets/web-secret
    networks:
      frontend:
        aliases:
          - web-alias
      backend:
    volumes:
      - type: volume
        source: web-volume
        target: /usr/local/apache2/htdocs

  db:
    image: mysql:5.7
    container_name: db-container
    environment:
      MYSQL_ROOT_PASSWORD: example
    networks:
      - backend
    volumes:
      - type: volume
        source: db-volume
        target: /var/lib/mysql

volumes:
  web-volume:
    driver: local
  db-volume:
    driver: local

networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge

configs:
  web-config:
    file: ./httpd.conf

secrets:
  web-secret:
    file: ./web-secret.txt
`;

const expectedComposeFile1 = load(`
version: "3.8"

services:
  web-testprefix:
    image: httpd:alpine
    container_name: web-container-testprefix
    configs:
      - source: web-config-testprefix
        target: /usr/local/apache2/conf/httpd.conf
    secrets:
      - source: web-secret-testprefix
        target: /run/secrets/web-secret
    networks:
      frontend-testprefix:
        aliases:
          - web-alias-testprefix
      backend-testprefix:
    volumes:
      - type: volume
        source: web-volume-testprefix
        target: /usr/local/apache2/htdocs

  db-testprefix:
    image: mysql:5.7
    container_name: db-container-testprefix
    environment:
      MYSQL_ROOT_PASSWORD: example
    networks:
      - backend-testprefix
    volumes:
      - type: volume
        source: db-volume-testprefix
        target: /var/lib/mysql

volumes:
  web-volume-testprefix:
    driver: local
  db-volume-testprefix:
    driver: local

networks:
  frontend-testprefix:
    driver: bridge
  backend-testprefix:
    driver: bridge

configs:
  web-config-testprefix:
    file: ./httpd.conf

secrets:
  web-secret-testprefix:
    file: ./web-secret.txt
`) as ComposeSpecification;

test("Add prefix to all properties in a Docker Compose file (Case 1)", () => {
	const composeData = load(complexComposeFile1) as ComposeSpecification;

	const prefix = "testprefix";
	const updatedComposeData = addPrefixToAllProperties(composeData, prefix);

	expect(updatedComposeData).toEqual(expectedComposeFile1);
});

const complexComposeFile2 = `
version: "3.8"

services:
  app:
    image: node:14-alpine
    container_name: app-container
    environment:
      NODE_ENV: production
    configs:
      - source: app-config
        target: /usr/src/app/config.json
    secrets:
      - source: app-secret
        target: /run/secrets/app-secret
    networks:
      frontend:
        aliases:
          - app-alias
    volumes:
      - type: volume
        source: app-volume
        target: /usr/src/app

  redis:
    image: redis:alpine
    container_name: redis-container
    networks:
      - backend
    volumes:
      - type: volume
        source: redis-volume
        target: /data

volumes:
  app-volume:
    driver: local
  redis-volume:
    driver: local

networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge

configs:
  app-config:
    file: ./config.json

secrets:
  app-secret:
    file: ./app-secret.txt
`;

const expectedComposeFile2 = load(`
version: "3.8"

services:
  app-testprefix:
    image: node:14-alpine
    container_name: app-container-testprefix
    environment:
      NODE_ENV: production
    configs:
      - source: app-config-testprefix
        target: /usr/src/app/config.json
    secrets:
      - source: app-secret-testprefix
        target: /run/secrets/app-secret
    networks:
      frontend-testprefix:
        aliases:
          - app-alias-testprefix
    volumes:
      - type: volume
        source: app-volume-testprefix
        target: /usr/src/app

  redis-testprefix:
    image: redis:alpine
    container_name: redis-container-testprefix
    networks:
      backend-testprefix:
    volumes:
      - type: volume
        source: redis-volume-testprefix
        target: /data

volumes:
  app-volume-testprefix:
    driver: local
  redis-volume-testprefix:
    driver: local

networks:
  frontend-testprefix:
    driver: bridge
  backend-testprefix:
    driver: bridge

configs:
  app-config-testprefix:
    file: ./config.json

secrets:
  app-secret-testprefix:
    file: ./app-secret.txt
`) as ComposeSpecification;

test("Add prefix to all properties in a Docker Compose file (Case 2)", () => {
	const composeData = load(complexComposeFile2) as ComposeSpecification;

	const prefix = "testprefix";
	const updatedComposeData = addPrefixToAllProperties(composeData, prefix);

	expect(updatedComposeData).toEqual(expectedComposeFile2);
});
