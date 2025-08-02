import type { ComposeSpecification } from "@dokploy/server";
import { addSuffixToAllProperties } from "@dokploy/server";
import { load } from "js-yaml";
import { expect, test } from "vitest";

const composeFile1 = `
version: "3.8"

services:
  web:
    image: nginx:latest
    container_name: web_container
    depends_on:
      - app
    networks:
      - frontend
    volumes_from:
      - data
    links:
      - db
    extends:
      service: base_service
    configs:
      - source: web_config

  app:
    image: node:14
    networks:
      - backend
      - frontend

  db:
    image: postgres:13
    networks:
      - backend

  data:
    image: busybox
    volumes:
      - /data

  base_service:
    image: base:latest

networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge

volumes:
  web_data:
    driver: local

configs:
  web_config:
    file: ./web_config.yml

secrets:
  db_password:
    file: ./db_password.txt
`;

const expectedComposeFile1 = load(`
version: "3.8"

services:
  web-testhash:
    image: nginx:latest
    container_name: web_container-testhash
    depends_on:
      - app-testhash
    networks:
      - frontend-testhash
    volumes_from:
      - data-testhash
    links:
      - db-testhash
    extends:
      service: base_service-testhash
    configs:
      - source: web_config-testhash

  app-testhash:
    image: node:14
    networks:
      - backend-testhash
      - frontend-testhash

  db-testhash:
    image: postgres:13
    networks:
      - backend-testhash

  data-testhash:
    image: busybox
    volumes:
      - /data

  base_service-testhash:
    image: base:latest

networks:
  frontend-testhash:
    driver: bridge
  backend-testhash:
    driver: bridge

volumes:
  web_data-testhash:
    driver: local

configs:
  web_config-testhash:
    file: ./web_config.yml

secrets:
  db_password-testhash:
    file: ./db_password.txt
`) as ComposeSpecification;

test("Add suffix to all properties in compose file 1", () => {
	const composeData = load(composeFile1) as ComposeSpecification;
	const suffix = "testhash";

	const updatedComposeData = addSuffixToAllProperties(composeData, suffix);

	expect(updatedComposeData).toEqual(expectedComposeFile1);
});

const composeFile2 = `
version: "3.8"

services:
  frontend:
    image: nginx:latest
    depends_on:
      - backend
    networks:
      - public
    volumes_from:
      - logs
    links:
      - cache
    extends:
      service: shared_service
    secrets:
      - db_password

  backend:
    image: node:14
    networks:
      - private
      - public

  cache:
    image: redis:latest
    networks:
      - private

  logs:
    image: busybox
    volumes:
      - /logs

  shared_service:
    image: shared:latest

networks:
  public:
    driver: bridge
  private:
    driver: bridge

volumes:
  logs:
    driver: local

configs:
  app_config:
    file: ./app_config.yml

secrets:
  db_password:
    file: ./db_password.txt
`;

const expectedComposeFile2 = load(`
version: "3.8"

services:
  frontend-testhash:
    image: nginx:latest
    depends_on:
      - backend-testhash
    networks:
      - public-testhash
    volumes_from:
      - logs-testhash
    links:
      - cache-testhash
    extends:
      service: shared_service-testhash
    secrets:
      - db_password-testhash

  backend-testhash:
    image: node:14
    networks:
      - private-testhash
      - public-testhash

  cache-testhash:
    image: redis:latest
    networks:
      - private-testhash

  logs-testhash:
    image: busybox
    volumes:
      - /logs

  shared_service-testhash:
    image: shared:latest

networks:
  public-testhash:
    driver: bridge
  private-testhash:
    driver: bridge

volumes:
  logs-testhash:
    driver: local

configs:
  app_config-testhash:
    file: ./app_config.yml

secrets:
  db_password-testhash:
    file: ./db_password.txt
`) as ComposeSpecification;

test("Add suffix to all properties in compose file 2", () => {
	const composeData = load(composeFile2) as ComposeSpecification;
	const suffix = "testhash";

	const updatedComposeData = addSuffixToAllProperties(composeData, suffix);

	expect(updatedComposeData).toEqual(expectedComposeFile2);
});

const composeFile3 = `
version: "3.8"

services:
  service_a:
    image: service_a:latest
    depends_on:
      - service_b
    networks:
      - net_a
    volumes_from:
      - data_volume
    links:
      - service_c
    extends:
      service: common_service
    configs:
      - source: service_a_config

  service_b:
    image: service_b:latest
    networks:
      - net_b
      - net_a

  service_c:
    image: service_c:latest
    networks:
      - net_b

  data_volume:
    image: busybox
    volumes:
      - /data

  common_service:
    image: common:latest

networks:
  net_a:
    driver: bridge
  net_b:
    driver: bridge

volumes:
  data_volume:
    driver: local

configs:
  service_a_config:
    file: ./service_a_config.yml

secrets:
  service_secret:
    file: ./service_secret.txt
`;

const expectedComposeFile3 = load(`
version: "3.8"

services:
  service_a-testhash:
    image: service_a:latest
    depends_on:
      - service_b-testhash
    networks:
      - net_a-testhash
    volumes_from:
      - data_volume-testhash
    links:
      - service_c-testhash
    extends:
      service: common_service-testhash
    configs:
      - source: service_a_config-testhash

  service_b-testhash:
    image: service_b:latest
    networks:
      - net_b-testhash
      - net_a-testhash

  service_c-testhash:
    image: service_c:latest
    networks:
      - net_b-testhash

  data_volume-testhash:
    image: busybox
    volumes:
      - /data

  common_service-testhash:
    image: common:latest

networks:
  net_a-testhash:
    driver: bridge
  net_b-testhash:
    driver: bridge

volumes:
  data_volume-testhash:
    driver: local

configs:
  service_a_config-testhash:
    file: ./service_a_config.yml

secrets:
  service_secret-testhash:
    file: ./service_secret.txt
`) as ComposeSpecification;

test("Add suffix to all properties in compose file 3", () => {
	const composeData = load(composeFile3) as ComposeSpecification;
	const suffix = "testhash";

	const updatedComposeData = addSuffixToAllProperties(composeData, suffix);

	expect(updatedComposeData).toEqual(expectedComposeFile3);
});

const composeFile = `
version: "3.8"

services:
  plausible_db:
    image: postgres:16-alpine
    restart: always
    volumes:
      - db-data:/var/lib/postgresql/data
    environment:
      - POSTGRES_PASSWORD=postgres

  plausible_events_db:
    image: clickhouse/clickhouse-server:24.3.3.102-alpine
    restart: always
    volumes:
      - event-data:/var/lib/clickhouse
      - event-logs:/var/log/clickhouse-server
      - ./clickhouse/clickhouse-config.xml:/etc/clickhouse-server/config.d/logging.xml:ro
      - ./clickhouse/clickhouse-user-config.xml:/etc/clickhouse-server/users.d/logging.xml:ro
    ulimits:
      nofile:
        soft: 262144
        hard: 262144

  plausible:
    image: ghcr.io/plausible/community-edition:v2.1.0
    restart: always
    command: sh -c "sleep 10 && /entrypoint.sh db createdb && /entrypoint.sh db migrate && /entrypoint.sh run"
    depends_on:
      - plausible_db
      - plausible_events_db
    ports:
      - 127.0.0.1:8000:8000
    env_file:
      - plausible-conf.env

volumes:
  db-data:
    driver: local
  event-data:
    driver: local
  event-logs:
    driver: local
`;

const expectedComposeFile = load(`
version: "3.8"

services:
  plausible_db-testhash:
    image: postgres:16-alpine
    restart: always
    volumes:
      - db-data-testhash:/var/lib/postgresql/data
    environment:
      - POSTGRES_PASSWORD=postgres

  plausible_events_db-testhash:
    image: clickhouse/clickhouse-server:24.3.3.102-alpine
    restart: always
    volumes:
      - event-data-testhash:/var/lib/clickhouse
      - event-logs-testhash:/var/log/clickhouse-server
      - ./clickhouse/clickhouse-config.xml:/etc/clickhouse-server/config.d/logging.xml:ro
      - ./clickhouse/clickhouse-user-config.xml:/etc/clickhouse-server/users.d/logging.xml:ro
    ulimits:
      nofile:
        soft: 262144
        hard: 262144

  plausible-testhash:
    image: ghcr.io/plausible/community-edition:v2.1.0
    restart: always
    command: sh -c "sleep 10 && /entrypoint.sh db createdb && /entrypoint.sh db migrate && /entrypoint.sh run"
    depends_on:
      - plausible_db-testhash
      - plausible_events_db-testhash
    ports:
      - 127.0.0.1:8000:8000
    env_file:
      - plausible-conf.env

volumes:
  db-data-testhash:
    driver: local
  event-data-testhash:
    driver: local
  event-logs-testhash:
    driver: local
`) as ComposeSpecification;

test("Add suffix to all properties in Plausible compose file", () => {
	const composeData = load(composeFile) as ComposeSpecification;
	const suffix = "testhash";

	const updatedComposeData = addSuffixToAllProperties(composeData, suffix);

	expect(updatedComposeData).toEqual(expectedComposeFile);
});
