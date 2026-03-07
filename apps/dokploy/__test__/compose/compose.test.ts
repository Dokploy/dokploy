import type { ComposeSpecification } from "@dokploy/server";
import { addSuffixToAllProperties } from "@dokploy/server";
import { expect, test } from "vitest";
import { parse } from "yaml";

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

const expectedComposeFile1 = parse(`
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
	const composeData = parse(composeFile1) as ComposeSpecification;
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

const expectedComposeFile2 = parse(`
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
	const composeData = parse(composeFile2) as ComposeSpecification;
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

const expectedComposeFile3 = parse(`
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
	const composeData = parse(composeFile3) as ComposeSpecification;
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

const expectedComposeFile = parse(`
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
	const composeData = parse(composeFile) as ComposeSpecification;
	const suffix = "testhash";

	const updatedComposeData = addSuffixToAllProperties(composeData, suffix);

	expect(updatedComposeData).toEqual(expectedComposeFile);
});

const composeFileWithManyAliases = `
version: "3.9"

default-restart-policy: &restart_policy
  restart: unless-stopped

services:
  service001: { <<: *restart_policy, image: nginx:latest }
  service002: { <<: *restart_policy, image: nginx:latest }
  service003: { <<: *restart_policy, image: nginx:latest }
  service004: { <<: *restart_policy, image: nginx:latest }
  service005: { <<: *restart_policy, image: nginx:latest }
  service006: { <<: *restart_policy, image: nginx:latest }
  service007: { <<: *restart_policy, image: nginx:latest }
  service008: { <<: *restart_policy, image: nginx:latest }
  service009: { <<: *restart_policy, image: nginx:latest }
  service010: { <<: *restart_policy, image: nginx:latest }
  service011: { <<: *restart_policy, image: nginx:latest }
  service012: { <<: *restart_policy, image: nginx:latest }
  service013: { <<: *restart_policy, image: nginx:latest }
  service014: { <<: *restart_policy, image: nginx:latest }
  service015: { <<: *restart_policy, image: nginx:latest }
  service016: { <<: *restart_policy, image: nginx:latest }
  service017: { <<: *restart_policy, image: nginx:latest }
  service018: { <<: *restart_policy, image: nginx:latest }
  service019: { <<: *restart_policy, image: nginx:latest }
  service020: { <<: *restart_policy, image: nginx:latest }
  service021: { <<: *restart_policy, image: nginx:latest }
  service022: { <<: *restart_policy, image: nginx:latest }
  service023: { <<: *restart_policy, image: nginx:latest }
  service024: { <<: *restart_policy, image: nginx:latest }
  service025: { <<: *restart_policy, image: nginx:latest }
  service026: { <<: *restart_policy, image: nginx:latest }
  service027: { <<: *restart_policy, image: nginx:latest }
  service028: { <<: *restart_policy, image: nginx:latest }
  service029: { <<: *restart_policy, image: nginx:latest }
  service030: { <<: *restart_policy, image: nginx:latest }
  service031: { <<: *restart_policy, image: nginx:latest }
  service032: { <<: *restart_policy, image: nginx:latest }
  service033: { <<: *restart_policy, image: nginx:latest }
  service034: { <<: *restart_policy, image: nginx:latest }
  service035: { <<: *restart_policy, image: nginx:latest }
  service036: { <<: *restart_policy, image: nginx:latest }
  service037: { <<: *restart_policy, image: nginx:latest }
  service038: { <<: *restart_policy, image: nginx:latest }
  service039: { <<: *restart_policy, image: nginx:latest }
  service040: { <<: *restart_policy, image: nginx:latest }
  service041: { <<: *restart_policy, image: nginx:latest }
  service042: { <<: *restart_policy, image: nginx:latest }
  service043: { <<: *restart_policy, image: nginx:latest }
  service044: { <<: *restart_policy, image: nginx:latest }
  service045: { <<: *restart_policy, image: nginx:latest }
  service046: { <<: *restart_policy, image: nginx:latest }
  service047: { <<: *restart_policy, image: nginx:latest }
  service048: { <<: *restart_policy, image: nginx:latest }
  service049: { <<: *restart_policy, image: nginx:latest }
  service050: { <<: *restart_policy, image: nginx:latest }
  service051: { <<: *restart_policy, image: nginx:latest }
  service052: { <<: *restart_policy, image: nginx:latest }
  service053: { <<: *restart_policy, image: nginx:latest }
  service054: { <<: *restart_policy, image: nginx:latest }
  service055: { <<: *restart_policy, image: nginx:latest }
  service056: { <<: *restart_policy, image: nginx:latest }
  service057: { <<: *restart_policy, image: nginx:latest }
  service058: { <<: *restart_policy, image: nginx:latest }
  service059: { <<: *restart_policy, image: nginx:latest }
  service060: { <<: *restart_policy, image: nginx:latest }
  service061: { <<: *restart_policy, image: nginx:latest }
  service062: { <<: *restart_policy, image: nginx:latest }
  service063: { <<: *restart_policy, image: nginx:latest }
  service064: { <<: *restart_policy, image: nginx:latest }
  service065: { <<: *restart_policy, image: nginx:latest }
  service066: { <<: *restart_policy, image: nginx:latest }
  service067: { <<: *restart_policy, image: nginx:latest }
  service068: { <<: *restart_policy, image: nginx:latest }
  service069: { <<: *restart_policy, image: nginx:latest }
  service070: { <<: *restart_policy, image: nginx:latest }
  service071: { <<: *restart_policy, image: nginx:latest }
  service072: { <<: *restart_policy, image: nginx:latest }
  service073: { <<: *restart_policy, image: nginx:latest }
  service074: { <<: *restart_policy, image: nginx:latest }
  service075: { <<: *restart_policy, image: nginx:latest }
  service076: { <<: *restart_policy, image: nginx:latest }
  service077: { <<: *restart_policy, image: nginx:latest }
  service078: { <<: *restart_policy, image: nginx:latest }
  service079: { <<: *restart_policy, image: nginx:latest }
  service080: { <<: *restart_policy, image: nginx:latest }
  service081: { <<: *restart_policy, image: nginx:latest }
  service082: { <<: *restart_policy, image: nginx:latest }
  service083: { <<: *restart_policy, image: nginx:latest }
  service084: { <<: *restart_policy, image: nginx:latest }
  service085: { <<: *restart_policy, image: nginx:latest }
  service086: { <<: *restart_policy, image: nginx:latest }
  service087: { <<: *restart_policy, image: nginx:latest }
  service088: { <<: *restart_policy, image: nginx:latest }
  service089: { <<: *restart_policy, image: nginx:latest }
  service090: { <<: *restart_policy, image: nginx:latest }
  service091: { <<: *restart_policy, image: nginx:latest }
  service092: { <<: *restart_policy, image: nginx:latest }
  service093: { <<: *restart_policy, image: nginx:latest }
  service094: { <<: *restart_policy, image: nginx:latest }
  service095: { <<: *restart_policy, image: nginx:latest }
  service096: { <<: *restart_policy, image: nginx:latest }
  service097: { <<: *restart_policy, image: nginx:latest }
  service098: { <<: *restart_policy, image: nginx:latest }
  service099: { <<: *restart_policy, image: nginx:latest }
  service100: { <<: *restart_policy, image: nginx:latest }
  service101: { <<: *restart_policy, image: nginx:latest }
  service102: { <<: *restart_policy, image: nginx:latest }
  service103: { <<: *restart_policy, image: nginx:latest }
  service104: { <<: *restart_policy, image: nginx:latest }
  service105: { <<: *restart_policy, image: nginx:latest }
  service106: { <<: *restart_policy, image: nginx:latest }
  service107: { <<: *restart_policy, image: nginx:latest }
  service108: { <<: *restart_policy, image: nginx:latest }
  service109: { <<: *restart_policy, image: nginx:latest }
  service110: { <<: *restart_policy, image: nginx:latest }
  service111: { <<: *restart_policy, image: nginx:latest }
  service112: { <<: *restart_policy, image: nginx:latest }
  service113: { <<: *restart_policy, image: nginx:latest }
  service114: { <<: *restart_policy, image: nginx:latest }
  service115: { <<: *restart_policy, image: nginx:latest }
  service116: { <<: *restart_policy, image: nginx:latest }
  service117: { <<: *restart_policy, image: nginx:latest }
  service118: { <<: *restart_policy, image: nginx:latest }
  service119: { <<: *restart_policy, image: nginx:latest }
  service120: { <<: *restart_policy, image: nginx:latest }
  service121: { <<: *restart_policy, image: nginx:latest }
  service122: { <<: *restart_policy, image: nginx:latest }
  service123: { <<: *restart_policy, image: nginx:latest }
  service124: { <<: *restart_policy, image: nginx:latest }
  service125: { <<: *restart_policy, image: nginx:latest }
  service126: { <<: *restart_policy, image: nginx:latest }
  service127: { <<: *restart_policy, image: nginx:latest }
  service128: { <<: *restart_policy, image: nginx:latest }
  service129: { <<: *restart_policy, image: nginx:latest }
  service130: { <<: *restart_policy, image: nginx:latest }
  service131: { <<: *restart_policy, image: nginx:latest }
  service132: { <<: *restart_policy, image: nginx:latest }
  service133: { <<: *restart_policy, image: nginx:latest }
  service134: { <<: *restart_policy, image: nginx:latest }
  service135: { <<: *restart_policy, image: nginx:latest }
  service136: { <<: *restart_policy, image: nginx:latest }
  service137: { <<: *restart_policy, image: nginx:latest }
  service138: { <<: *restart_policy, image: nginx:latest }
  service139: { <<: *restart_policy, image: nginx:latest }
  service140: { <<: *restart_policy, image: nginx:latest }
  service141: { <<: *restart_policy, image: nginx:latest }
  service142: { <<: *restart_policy, image: nginx:latest }
  service143: { <<: *restart_policy, image: nginx:latest }
  service144: { <<: *restart_policy, image: nginx:latest }
  service145: { <<: *restart_policy, image: nginx:latest }
  service146: { <<: *restart_policy, image: nginx:latest }
  service147: { <<: *restart_policy, image: nginx:latest }
  service148: { <<: *restart_policy, image: nginx:latest }
  service149: { <<: *restart_policy, image: nginx:latest }
  service150: { <<: *restart_policy, image: nginx:latest }
  service151: { <<: *restart_policy, image: nginx:latest }
  service152: { <<: *restart_policy, image: nginx:latest }
  service153: { <<: *restart_policy, image: nginx:latest }
  service154: { <<: *restart_policy, image: nginx:latest }
  service155: { <<: *restart_policy, image: nginx:latest }
  service156: { <<: *restart_policy, image: nginx:latest }
  service157: { <<: *restart_policy, image: nginx:latest }
  service158: { <<: *restart_policy, image: nginx:latest }
  service159: { <<: *restart_policy, image: nginx:latest }
  service160: { <<: *restart_policy, image: nginx:latest }
  service161: { <<: *restart_policy, image: nginx:latest }
  service162: { <<: *restart_policy, image: nginx:latest }
  service163: { <<: *restart_policy, image: nginx:latest }
  service164: { <<: *restart_policy, image: nginx:latest }
  service165: { <<: *restart_policy, image: nginx:latest }
  service166: { <<: *restart_policy, image: nginx:latest }
  service167: { <<: *restart_policy, image: nginx:latest }
  service168: { <<: *restart_policy, image: nginx:latest }
  service169: { <<: *restart_policy, image: nginx:latest }
  service170: { <<: *restart_policy, image: nginx:latest }
  service171: { <<: *restart_policy, image: nginx:latest }
  service172: { <<: *restart_policy, image: nginx:latest }
  service173: { <<: *restart_policy, image: nginx:latest }
  service174: { <<: *restart_policy, image: nginx:latest }
  service175: { <<: *restart_policy, image: nginx:latest }
  service176: { <<: *restart_policy, image: nginx:latest }
  service177: { <<: *restart_policy, image: nginx:latest }
  service178: { <<: *restart_policy, image: nginx:latest }
  service179: { <<: *restart_policy, image: nginx:latest }
  service180: { <<: *restart_policy, image: nginx:latest }
  service181: { <<: *restart_policy, image: nginx:latest }
  service182: { <<: *restart_policy, image: nginx:latest }
  service183: { <<: *restart_policy, image: nginx:latest }
  service184: { <<: *restart_policy, image: nginx:latest }
  service185: { <<: *restart_policy, image: nginx:latest }
  service186: { <<: *restart_policy, image: nginx:latest }
  service187: { <<: *restart_policy, image: nginx:latest }
  service188: { <<: *restart_policy, image: nginx:latest }
  service189: { <<: *restart_policy, image: nginx:latest }
  service190: { <<: *restart_policy, image: nginx:latest }
  service191: { <<: *restart_policy, image: nginx:latest }
  service192: { <<: *restart_policy, image: nginx:latest }
  service193: { <<: *restart_policy, image: nginx:latest }
  service194: { <<: *restart_policy, image: nginx:latest }
  service195: { <<: *restart_policy, image: nginx:latest }
  service196: { <<: *restart_policy, image: nginx:latest }
  service197: { <<: *restart_policy, image: nginx:latest }
  service198: { <<: *restart_policy, image: nginx:latest }
  service199: { <<: *restart_policy, image: nginx:latest }
  service200: { <<: *restart_policy, image: nginx:latest }
  service201: { <<: *restart_policy, image: nginx:latest }
  service202: { <<: *restart_policy, image: nginx:latest }
  service203: { <<: *restart_policy, image: nginx:latest }
  service204: { <<: *restart_policy, image: nginx:latest }
  service205: { <<: *restart_policy, image: nginx:latest }
`;

test("Parsing large compose file with many aliases ", () => {
	// with unfit default options, this may throw `ReferenceError: Excessive alias count indicates a resource exhaustion attack`
	expect(() => parse(composeFileWithManyAliases)).not.toThrow();
});
