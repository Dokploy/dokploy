import { createHmac } from "node:crypto";
import {
	type DomainSchema,
	type Schema,
	type Template,
	generateBase64,
	generatePassword,
	generateRandomDomain,
} from "../utils";

interface JWTPayload {
	role: "anon" | "service_role";
	iss: string;
	iat: number;
	exp: number;
}

function base64UrlEncode(str: string): string {
	return Buffer.from(str)
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=/g, "");
}

function generateJWT(payload: JWTPayload, secret: string): string {
	const header = { alg: "HS256", typ: "JWT" };

	const encodedHeader = base64UrlEncode(JSON.stringify(header));
	const encodedPayload = base64UrlEncode(JSON.stringify(payload));

	const signature = createHmac("sha256", secret)
		.update(`${encodedHeader}.${encodedPayload}`)
		.digest("base64url");

	return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export function generateSupabaseAnonJWT(secret: string): string {
	const now = Math.floor(Date.now() / 1000);
	const payload: JWTPayload = {
		role: "anon",
		iss: "supabase",
		iat: now,
		exp: now + 100 * 365 * 24 * 60 * 60, // 100 years
	};

	return generateJWT(payload, secret);
}

export function generateSupabaseServiceJWT(secret: string): string {
	const now = Math.floor(Date.now() / 1000);
	const payload: JWTPayload = {
		role: "service_role",
		iss: "supabase",
		iat: now,
		exp: now + 100 * 365 * 24 * 60 * 60, // 100 years
	};

	return generateJWT(payload, secret);
}

export function generate(schema: Schema): Template {
	const mainDomain = generateRandomDomain(schema);

	const postgresPassword = generatePassword(32);
	const jwtSecret = generateBase64(32);
	const dashboardPassword = generatePassword(32);
	const logflareApiKey = generatePassword(32);

	const annonKey = generateSupabaseAnonJWT(jwtSecret);
	const serviceRoleKey = generateSupabaseServiceJWT(jwtSecret);
	const domains: DomainSchema[] = [
		{
			serviceName: "kong",
			host: mainDomain,
			port: 8000,
		},
	];

	const envs = [
		`SUPABASE_HOST=${mainDomain}`,
		`POSTGRES_PASSWORD=${postgresPassword}`,
		`JWT_SECRET=${jwtSecret}`,
		`ANON_KEY=${annonKey}`,
		`SERVICE_ROLE_KEY=${serviceRoleKey}`,
		"DASHBOARD_USERNAME=supabase",
		`DASHBOARD_PASSWORD=${dashboardPassword}`,
		"POSTGRES_HOSTNAME=db",
		"POSTGRES_DB=postgres",
		"POSTGRES_PORT=5432",
		"KONG_HTTP_PORT=8000",
		"KONG_HTTPS_PORT=8443",
		"PGRST_DB_SCHEMAS=public,storage,graphql_public",
		"ADDITIONAL_REDIRECT_URLS=",
		"JWT_EXPIRY=3600",
		"DISABLE_SIGNUP=false",
		`MAILER_URLPATHS_CONFIRMATION=\"/auth/v1/verify\"`,
		`MAILER_URLPATHS_INVITE=\"/auth/v1/verify\"`,
		`MAILER_URLPATHS_RECOVERY=\"/auth/v1/verify\"`,
		`MAILER_URLPATHS_EMAIL_CHANGE=\"/auth/v1/verify\"`,
		"ENABLE_EMAIL_SIGNUP=true",
		"ENABLE_EMAIL_AUTOCONFIRM=false",
		"SMTP_ADMIN_EMAIL=admin@example.com",
		"SMTP_HOSTNAME=supabase-mail",
		"SMTP_PORT=2500",
		"SMTP_USER=fake_mail_user",
		"SMTP_PASS=fake_mail_password",
		"SMTP_SENDER_NAME=fake_sender",
		"ENABLE_ANONYMOUS_USERS=false",
		"ENABLE_PHONE_SIGNUP=true",
		"ENABLE_PHONE_AUTOCONFIRM=true",
		"STUDIO_DEFAULT_ORGANIZATION=Default Organization",
		"STUDIO_DEFAULT_PROJECT=Default Project",
		"STUDIO_PORT=3000",
		"IMGPROXY_ENABLE_WEBP_DETECTION=true",
		"FUNCTIONS_VERIFY_JWT=false",
		`LOGFLARE_LOGGER_BACKEND_API_KEY=${logflareApiKey}`,
		`LOGFLARE_API_KEY=${logflareApiKey}`,
		"DOCKER_SOCKET_LOCATION=/var/run/docker.sock",
		"GOOGLE_PROJECT_ID=GOOGLE_PROJECT_ID",
		"GOOGLE_PROJECT_NUMBER=GOOGLE_PROJECT_NUMBER",
	];

	const mounts: Template["mounts"] = [
		{
			filePath: "/volumes/api/kong.yml",
			content: `
_format_version: '2.1'
_transform: true

###
### Consumers / Users
###
consumers:
  - username: DASHBOARD
  - username: anon
    keyauth_credentials:
      - key: $SUPABASE_ANON_KEY
  - username: service_role
    keyauth_credentials:
      - key: $SUPABASE_SERVICE_KEY

###
### Access Control List
###
acls:
  - consumer: anon
    group: anon
  - consumer: service_role
    group: admin

###
### Dashboard credentials
###
basicauth_credentials:
  - consumer: DASHBOARD
    username: $DASHBOARD_USERNAME
    password: $DASHBOARD_PASSWORD

###
### API Routes
###
services:
  ## Open Auth routes
  - name: auth-v1-open
    url: http://auth:9999/verify
    routes:
      - name: auth-v1-open
        strip_path: true
        paths:
          - /auth/v1/verify
    plugins:
      - name: cors
  - name: auth-v1-open-callback
    url: http://auth:9999/callback
    routes:
      - name: auth-v1-open-callback
        strip_path: true
        paths:
          - /auth/v1/callback
    plugins:
      - name: cors
  - name: auth-v1-open-authorize
    url: http://auth:9999/authorize
    routes:
      - name: auth-v1-open-authorize
        strip_path: true
        paths:
          - /auth/v1/authorize
    plugins:
      - name: cors

  ## Secure Auth routes
  - name: auth-v1
    _comment: 'GoTrue: /auth/v1/* -> http://auth:9999/*'
    url: http://auth:9999/
    routes:
      - name: auth-v1-all
        strip_path: true
        paths:
          - /auth/v1/
    plugins:
      - name: cors
      - name: key-auth
        config:
          hide_credentials: false
      - name: acl
        config:
          hide_groups_header: true
          allow:
            - admin
            - anon

  ## Secure REST routes
  - name: rest-v1
    _comment: 'PostgREST: /rest/v1/* -> http://rest:3000/*'
    url: http://rest:3000/
    routes:
      - name: rest-v1-all
        strip_path: true
        paths:
          - /rest/v1/
    plugins:
      - name: cors
      - name: key-auth
        config:
          hide_credentials: true
      - name: acl
        config:
          hide_groups_header: true
          allow:
            - admin
            - anon

  ## Secure GraphQL routes
  - name: graphql-v1
    _comment: 'PostgREST: /graphql/v1/* -> http://rest:3000/rpc/graphql'
    url: http://rest:3000/rpc/graphql
    routes:
      - name: graphql-v1-all
        strip_path: true
        paths:
          - /graphql/v1
    plugins:
      - name: cors
      - name: key-auth
        config:
          hide_credentials: true
      - name: request-transformer
        config:
          add:
            headers:
              - Content-Profile:graphql_public
      - name: acl
        config:
          hide_groups_header: true
          allow:
            - admin
            - anon

  ## Secure Realtime routes
  - name: realtime-v1-ws
    _comment: 'Realtime: /realtime/v1/* -> ws://realtime:4000/socket/*'
    url: http://realtime-dev.supabase-realtime:4000/socket
    protocol: ws
    routes:
      - name: realtime-v1-ws
        strip_path: true
        paths:
          - /realtime/v1/
    plugins:
      - name: cors
      - name: key-auth
        config:
          hide_credentials: false
      - name: acl
        config:
          hide_groups_header: true
          allow:
            - admin
            - anon
  - name: realtime-v1-rest
    _comment: 'Realtime: /realtime/v1/* -> ws://realtime:4000/socket/*'
    url: http://realtime-dev.supabase-realtime:4000/api
    protocol: http
    routes:
      - name: realtime-v1-rest
        strip_path: true
        paths:
          - /realtime/v1/api
    plugins:
      - name: cors
      - name: key-auth
        config:
          hide_credentials: false
      - name: acl
        config:
          hide_groups_header: true
          allow:
            - admin
            - anon
  ## Storage routes: the storage server manages its own auth
  - name: storage-v1
    _comment: 'Storage: /storage/v1/* -> http://storage:5000/*'
    url: http://storage:5000/
    routes:
      - name: storage-v1-all
        strip_path: true
        paths:
          - /storage/v1/
    plugins:
      - name: cors

  ## Edge Functions routes
  - name: functions-v1
    _comment: 'Edge Functions: /functions/v1/* -> http://functions:9000/*'
    url: http://functions:9000/
    routes:
      - name: functions-v1-all
        strip_path: true
        paths:
          - /functions/v1/
    plugins:
      - name: cors

  ## Analytics routes
  - name: analytics-v1
    _comment: 'Analytics: /analytics/v1/* -> http://logflare:4000/*'
    url: http://analytics:4000/
    routes:
      - name: analytics-v1-all
        strip_path: true
        paths:
          - /analytics/v1/

  ## Secure Database routes
  - name: meta
    _comment: 'pg-meta: /pg/* -> http://pg-meta:8080/*'
    url: http://meta:8080/
    routes:
      - name: meta-all
        strip_path: true
        paths:
          - /pg/
    plugins:
      - name: key-auth
        config:
          hide_credentials: false
      - name: acl
        config:
          hide_groups_header: true
          allow:
            - admin

  ## Protected Dashboard - catch all remaining routes
  - name: dashboard
    _comment: 'Studio: /* -> http://studio:3000/*'
    url: http://studio:3000/
    routes:
      - name: dashboard-all
        strip_path: true
        paths:
          - /
    plugins:
      - name: cors
      - name: basic-auth
        config:
          hide_credentials: true
            `,
		},
		{
			filePath: "/volumes/db/init/data.sql",
			content: `
            `,
		},
		{
			filePath: "/volumes/db/jwt.sql",
			content: `
\\set jwt_secret \`echo "$JWT_SECRET"\`
\\set jwt_exp \`echo "$JWT_EXP"\`

ALTER DATABASE postgres SET "app.settings.jwt_secret" TO :'jwt_secret';
ALTER DATABASE postgres SET "app.settings.jwt_exp" TO :'jwt_exp';
            `,
		},
		{
			filePath: "/volumes/db/logs.sql",
			content: `
\\set pguser \`echo "$POSTGRES_USER"\`

create schema if not exists _analytics;
alter schema _analytics owner to :pguser;
            `,
		},
		{
			filePath: "/volumes/db/realtime.sql",
			content: `
\\set pguser \`echo "$POSTGRES_USER"\`

create schema if not exists _realtime;
alter schema _realtime owner to :pguser;
            `,
		},
		{
			filePath: "/volumes/db/roles.sql",
			content: `
-- NOTE: change to your own passwords for production environments
\\set pgpass \`echo "$POSTGRES_PASSWORD"\`

ALTER USER authenticator WITH PASSWORD :'pgpass';
ALTER USER pgbouncer WITH PASSWORD :'pgpass';
ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_functions_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_storage_admin WITH PASSWORD :'pgpass';
            `,
		},
		{
			filePath: "/volumes/db/webhooks.sql",
			content: `
BEGIN;
  -- Create pg_net extension
  CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;
  -- Create supabase_functions schema
  CREATE SCHEMA supabase_functions AUTHORIZATION supabase_admin;
  GRANT USAGE ON SCHEMA supabase_functions TO postgres, anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA supabase_functions GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA supabase_functions GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA supabase_functions GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
  -- supabase_functions.migrations definition
  CREATE TABLE supabase_functions.migrations (
    version text PRIMARY KEY,
    inserted_at timestamptz NOT NULL DEFAULT NOW()
  );
  -- Initial supabase_functions migration
  INSERT INTO supabase_functions.migrations (version) VALUES ('initial');
  -- supabase_functions.hooks definition
  CREATE TABLE supabase_functions.hooks (
    id bigserial PRIMARY KEY,
    hook_table_id integer NOT NULL,
    hook_name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT NOW(),
    request_id bigint
  );
  CREATE INDEX supabase_functions_hooks_request_id_idx ON supabase_functions.hooks USING btree (request_id);
  CREATE INDEX supabase_functions_hooks_h_table_id_h_name_idx ON supabase_functions.hooks USING btree (hook_table_id, hook_name);
  COMMENT ON TABLE supabase_functions.hooks IS 'Supabase Functions Hooks: Audit trail for triggered hooks.';
  CREATE FUNCTION supabase_functions.http_request()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    DECLARE
      request_id bigint;
      payload jsonb;
      url text := TG_ARGV[0]::text;
      method text := TG_ARGV[1]::text;
      headers jsonb DEFAULT '{}'::jsonb;
      params jsonb DEFAULT '{}'::jsonb;
      timeout_ms integer DEFAULT 1000;
    BEGIN
      IF url IS NULL OR url = 'null' THEN
        RAISE EXCEPTION 'url argument is missing';
      END IF;

      IF method IS NULL OR method = 'null' THEN
        RAISE EXCEPTION 'method argument is missing';
      END IF;

      IF TG_ARGV[2] IS NULL OR TG_ARGV[2] = 'null' THEN
        headers = '{"Content-Type": "application/json"}'::jsonb;
      ELSE
        headers = TG_ARGV[2]::jsonb;
      END IF;

      IF TG_ARGV[3] IS NULL OR TG_ARGV[3] = 'null' THEN
        params = '{}'::jsonb;
      ELSE
        params = TG_ARGV[3]::jsonb;
      END IF;

      IF TG_ARGV[4] IS NULL OR TG_ARGV[4] = 'null' THEN
        timeout_ms = 1000;
      ELSE
        timeout_ms = TG_ARGV[4]::integer;
      END IF;

      CASE
        WHEN method = 'GET' THEN
          SELECT http_get INTO request_id FROM net.http_get(
            url,
            params,
            headers,
            timeout_ms
          );
        WHEN method = 'POST' THEN
          payload = jsonb_build_object(
            'old_record', OLD,
            'record', NEW,
            'type', TG_OP,
            'table', TG_TABLE_NAME,
            'schema', TG_TABLE_SCHEMA
          );

          SELECT http_post INTO request_id FROM net.http_post(
            url,
            payload,
            params,
            headers,
            timeout_ms
          );
        ELSE
          RAISE EXCEPTION 'method argument % is invalid', method;
      END CASE;

      INSERT INTO supabase_functions.hooks
        (hook_table_id, hook_name, request_id)
      VALUES
        (TG_RELID, TG_NAME, request_id);

      RETURN NEW;
    END
  $function$;
  -- Supabase super admin
  DO
  $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_roles
      WHERE rolname = 'supabase_functions_admin'
    )
    THEN
      CREATE USER supabase_functions_admin NOINHERIT CREATEROLE LOGIN NOREPLICATION;
    END IF;
  END
  $$;
  GRANT ALL PRIVILEGES ON SCHEMA supabase_functions TO supabase_functions_admin;
  GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA supabase_functions TO supabase_functions_admin;
  GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA supabase_functions TO supabase_functions_admin;
  ALTER USER supabase_functions_admin SET search_path = "supabase_functions";
  ALTER table "supabase_functions".migrations OWNER TO supabase_functions_admin;
  ALTER table "supabase_functions".hooks OWNER TO supabase_functions_admin;
  ALTER function "supabase_functions".http_request() OWNER TO supabase_functions_admin;
  GRANT supabase_functions_admin TO postgres;
  -- Remove unused supabase_pg_net_admin role
  DO
  $$
  BEGIN
    IF EXISTS (
      SELECT 1
      FROM pg_roles
      WHERE rolname = 'supabase_pg_net_admin'
    )
    THEN
      REASSIGN OWNED BY supabase_pg_net_admin TO supabase_admin;
      DROP OWNED BY supabase_pg_net_admin;
      DROP ROLE supabase_pg_net_admin;
    END IF;
  END
  $$;
  -- pg_net grants when extension is already enabled
  DO
  $$
  BEGIN
    IF EXISTS (
      SELECT 1
      FROM pg_extension
      WHERE extname = 'pg_net'
    )
    THEN
      GRANT USAGE ON SCHEMA net TO supabase_functions_admin, postgres, anon, authenticated, service_role;
      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;
      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;
      REVOKE ALL ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;
      REVOKE ALL ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
      GRANT EXECUTE ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
    END IF;
  END
  $$;
  -- Event trigger for pg_net
  CREATE OR REPLACE FUNCTION extensions.grant_pg_net_access()
  RETURNS event_trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF EXISTS (
      SELECT 1
      FROM pg_event_trigger_ddl_commands() AS ev
      JOIN pg_extension AS ext
      ON ev.objid = ext.oid
      WHERE ext.extname = 'pg_net'
    )
    THEN
      GRANT USAGE ON SCHEMA net TO supabase_functions_admin, postgres, anon, authenticated, service_role;
      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;
      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;
      REVOKE ALL ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;
      REVOKE ALL ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
      GRANT EXECUTE ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
    END IF;
  END;
  $$;
  COMMENT ON FUNCTION extensions.grant_pg_net_access IS 'Grants access to pg_net';
  DO
  $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_event_trigger
      WHERE evtname = 'issue_pg_net_access'
    ) THEN
      CREATE EVENT TRIGGER issue_pg_net_access ON ddl_command_end WHEN TAG IN ('CREATE EXTENSION')
      EXECUTE PROCEDURE extensions.grant_pg_net_access();
    END IF;
  END
  $$;
  INSERT INTO supabase_functions.migrations (version) VALUES ('20210809183423_update_grants');
  ALTER function supabase_functions.http_request() SECURITY DEFINER;
  ALTER function supabase_functions.http_request() SET search_path = supabase_functions;
  REVOKE ALL ON FUNCTION supabase_functions.http_request() FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION supabase_functions.http_request() TO postgres, anon, authenticated, service_role;
COMMIT;
            `,
		},
		{
			filePath: "/volumes/functions/hello/index.ts",
			content: `
// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

import { serve } from "https://deno.land/std@0.177.1/http/server.ts"

serve(async () => {
  return new Response(
    \`"Hello from Edge Functions!"\`,
    { headers: { "Content-Type": "application/json" } },
  )
})

// To invoke:
// curl 'http://localhost:<KONG_HTTP_PORT>/functions/v1/hello' \\
//   --header 'Authorization: Bearer <anon/service_role API key>'
            `,
		},
		{
			filePath: "/volumes/functions/main/index.ts",
			content: `
import { serve } from 'https://deno.land/std@0.131.0/http/server.ts'
import * as jose from 'https://deno.land/x/jose@v4.14.4/index.ts'

console.log('main function started')

const JWT_SECRET = Deno.env.get('JWT_SECRET')
const VERIFY_JWT = Deno.env.get('VERIFY_JWT') === 'true'

function getAuthToken(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader) {
    throw new Error('Missing authorization header')
  }
  const [bearer, token] = authHeader.split(' ')
  if (bearer !== 'Bearer') {
    throw new Error(\`Auth header is not 'Bearer {token}'\`)
  }
  return token
}

async function verifyJWT(jwt: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const secretKey = encoder.encode(JWT_SECRET)
  try {
    await jose.jwtVerify(jwt, secretKey)
  } catch (err) {
    console.error(err)
    return false
  }
  return true
}

serve(async (req: Request) => {
  if (req.method !== 'OPTIONS' && VERIFY_JWT) {
    try {
      const token = getAuthToken(req)
      const isValidJWT = await verifyJWT(token)

      if (!isValidJWT) {
        return new Response(JSON.stringify({ msg: 'Invalid JWT' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    } catch (e) {
      console.error(e)
      return new Response(JSON.stringify({ msg: e.toString() }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  const url = new URL(req.url)
  const { pathname } = url
  const path_parts = pathname.split('/')
  const service_name = path_parts[1]

  if (!service_name || service_name === '') {
    const error = { msg: 'missing function name in request' }
    return new Response(JSON.stringify(error), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const servicePath = \`/home/deno/functions/\${service_name}\`
  console.error(\`serving the request with \${servicePath}\`)

  const memoryLimitMb = 150
  const workerTimeoutMs = 1 * 60 * 1000
  const noModuleCache = false
  const importMapPath = null
  const envVarsObj = Deno.env.toObject()
  const envVars = Object.keys(envVarsObj).map((k) => [k, envVarsObj[k]])

  try {
    const worker = await EdgeRuntime.userWorkers.create({
      servicePath,
      memoryLimitMb,
      workerTimeoutMs,
      noModuleCache,
      importMapPath,
      envVars,
    })
    return await worker.fetch(req)
  } catch (e) {
    const error = { msg: e.toString() }
    return new Response(JSON.stringify(error), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
            `,
		},
		{
			filePath: "/volumes/logs/vector.yml",
			content: `
api:
  enabled: true
  address: 0.0.0.0:9001

sources:
  docker_host:
    type: docker_logs
    exclude_containers:
      - supabase-vector

transforms:
  project_logs:
    type: remap
    inputs:
      - docker_host
    source: |-
      .project = "default"
      .event_message = del(.message)
      .appname = del(.container_name)
      del(.container_created_at)
      del(.container_id)
      del(.source_type)
      del(.stream)
      del(.label)
      del(.image)
      del(.host)
      del(.stream)
  router:
    type: route
    inputs:
      - project_logs
    route:
      kong: '.appname == "supabase-kong"'
      auth: '.appname == "supabase-auth"'
      rest: '.appname == "supabase-rest"'
      realtime: '.appname == "supabase-realtime"'
      storage: '.appname == "supabase-storage"'
      functions: '.appname == "supabase-functions"'
      db: '.appname == "supabase-db"'
  # Ignores non nginx errors since they are related with kong booting up
  kong_logs:
    type: remap
    inputs:
      - router.kong
    source: |-
      req, err = parse_nginx_log(.event_message, "combined")
      if err == null {
          .timestamp = req.timestamp
          .metadata.request.headers.referer = req.referer
          .metadata.request.headers.user_agent = req.agent
          .metadata.request.headers.cf_connecting_ip = req.client
          .metadata.request.method = req.method
          .metadata.request.path = req.path
          .metadata.request.protocol = req.protocol
          .metadata.response.status_code = req.status
      }
      if err != null {
        abort
      }
  # Ignores non nginx errors since they are related with kong booting up
  kong_err:
    type: remap
    inputs:
      - router.kong
    source: |-
      .metadata.request.method = "GET"
      .metadata.response.status_code = 200
      parsed, err = parse_nginx_log(.event_message, "error")
      if err == null {
          .timestamp = parsed.timestamp
          .severity = parsed.severity
          .metadata.request.host = parsed.host
          .metadata.request.headers.cf_connecting_ip = parsed.client
          url, err = split(parsed.request, " ")
          if err == null {
              .metadata.request.method = url[0]
              .metadata.request.path = url[1]
              .metadata.request.protocol = url[2]
          }
      }
      if err != null {
        abort
      }
  # Gotrue logs are structured json strings which frontend parses directly. But we keep metadata for consistency.
  auth_logs:
    type: remap
    inputs:
      - router.auth
    source: |-
      parsed, err = parse_json(.event_message)
      if err == null {
          .metadata.timestamp = parsed.time
          .metadata = merge!(.metadata, parsed)
      }
  # PostgREST logs are structured so we separate timestamp from message using regex
  rest_logs:
    type: remap
    inputs:
      - router.rest
    source: |-
      parsed, err = parse_regex(.event_message, r'^(?P<time>.*): (?P<msg>.*)$')
      if err == null {
          .event_message = parsed.msg
          .timestamp = to_timestamp!(parsed.time)
          .metadata.host = .project
      }
  # Realtime logs are structured so we parse the severity level using regex (ignore time because it has no date)
  realtime_logs:
    type: remap
    inputs:
      - router.realtime
    source: |-
      .metadata.project = del(.project)
      .metadata.external_id = .metadata.project
      parsed, err = parse_regex(.event_message, r'^(?P<time>\\d+:\\d+:\\d+\\.\\d+) \\[(?P<level>\\w+)\\] (?P<msg>.*)$')
      if err == null {
          .event_message = parsed.msg
          .metadata.level = parsed.level
      }
  # Storage logs may contain json objects so we parse them for completeness
  storage_logs:
    type: remap
    inputs:
      - router.storage
    source: |-
      .metadata.project = del(.project)
      .metadata.tenantId = .metadata.project
      parsed, err = parse_json(.event_message)
      if err == null {
          .event_message = parsed.msg
          .metadata.level = parsed.level
          .metadata.timestamp = parsed.time
          .metadata.context[0].host = parsed.hostname
          .metadata.context[0].pid = parsed.pid
      }
  # Postgres logs some messages to stderr which we map to warning severity level
  db_logs:
    type: remap
    inputs:
      - router.db
    source: |-
      .metadata.host = "db-default"
      .metadata.parsed.timestamp = .timestamp

      parsed, err = parse_regex(.event_message, r'.*(?P<level>INFO|NOTICE|WARNING|ERROR|LOG|FATAL|PANIC?):.*', numeric_groups: true)

      if err != null || parsed == null {
        .metadata.parsed.error_severity = "info"
      }
      if parsed != null {
       .metadata.parsed.error_severity = parsed.level
      }
      if .metadata.parsed.error_severity == "info" {
          .metadata.parsed.error_severity = "log"
      }
      .metadata.parsed.error_severity = upcase!(.metadata.parsed.error_severity)

sinks:
  logflare_auth:
    type: 'http'
    inputs:
      - auth_logs
    encoding:
      codec: 'json'
    method: 'post'
    request:
      retry_max_duration_secs: 10
    uri: 'http://analytics:4000/api/logs?source_name=gotrue.logs.prod&api_key=\${LOGFLARE_API_KEY?LOGFLARE_API_KEY is required}'
  logflare_realtime:
    type: 'http'
    inputs:
      - realtime_logs
    encoding:
      codec: 'json'
    method: 'post'
    request:
      retry_max_duration_secs: 10
    uri: 'http://analytics:4000/api/logs?source_name=realtime.logs.prod&api_key=\${LOGFLARE_API_KEY?LOGFLARE_API_KEY is required}'
  logflare_rest:
    type: 'http'
    inputs:
      - rest_logs
    encoding:
      codec: 'json'
    method: 'post'
    request:
      retry_max_duration_secs: 10
    uri: 'http://analytics:4000/api/logs?source_name=postgREST.logs.prod&api_key=\${LOGFLARE_API_KEY?LOGFLARE_API_KEY is required}'
  logflare_db:
    type: 'http'
    inputs:
      - db_logs
    encoding:
      codec: 'json'
    method: 'post'
    request:
      retry_max_duration_secs: 10
    # We must route the sink through kong because ingesting logs before logflare is fully initialised will
    # lead to broken queries from studio. This works by the assumption that containers are started in the
    # following order: vector > db > logflare > kong
    uri: 'http://kong:8000/analytics/v1/api/logs?source_name=postgres.logs&api_key=\${LOGFLARE_API_KEY?LOGFLARE_API_KEY is required}'
  logflare_functions:
    type: 'http'
    inputs:
      - router.functions
    encoding:
      codec: 'json'
    method: 'post'
    request:
      retry_max_duration_secs: 10
    uri: 'http://analytics:4000/api/logs?source_name=deno-relay-logs&api_key=\${LOGFLARE_API_KEY?LOGFLARE_API_KEY is required}'
  logflare_storage:
    type: 'http'
    inputs:
      - storage_logs
    encoding:
      codec: 'json'
    method: 'post'
    request:
      retry_max_duration_secs: 10
    uri: 'http://analytics:4000/api/logs?source_name=storage.logs.prod.2&api_key=\${LOGFLARE_API_KEY?LOGFLARE_API_KEY is required}'
  logflare_kong:
    type: 'http'
    inputs:
      - kong_logs
      - kong_err
    encoding:
      codec: 'json'
    method: 'post'
    request:
      retry_max_duration_secs: 10
    uri: 'http://analytics:4000/api/logs?source_name=cloudflare.logs.prod&api_key=\${LOGFLARE_API_KEY?LOGFLARE_API_KEY is required}'
            `,
		},
	];

	return {
		domains,
		envs,
		mounts,
	};
}
