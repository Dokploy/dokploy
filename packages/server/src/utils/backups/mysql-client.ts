import { quote } from "shell-quote";

export const mysqlBackupClientImage =
	"mysql@sha256:8fb11c38b3551e22d50adbb688f027f8ff4ea2d2445aa277c1cc97b4af85ec54";

const nativeDump =
	'mysqldump --default-character-set=utf8mb4 -u root --password="$DB_PASS" --single-transaction --no-tablespaces --routines --events --quick';

const shellLiteral = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

const nativeIdentifierError = (database: string) => {
	const escapes: Record<string, string> = {
		"\0": "\\0",
		"\n": "\\n",
		"\r": "\\r",
		"\\": "\\\\",
		"'": "\\'",
		'"': '\\"',
		"\x1a": "\\Z",
	};
	const escaped = Array.from(database, (c) => escapes[c] ?? c).join("");
	const identifier = `\`${escaped.replaceAll("`", "``")}\``;
	return `mysqldump: Couldn't execute 'use ${identifier}': Unknown database '${escaped}' (1049)`;
};

export const getGuardedMysqlBackupCommand = (
	database: string,
	databasePassword: string,
) => {
	const native = `docker exec -e DB_NAME=${quote([database])} -e DB_PASS=${quote([databasePassword])} -i $CONTAINER_ID bash -c 'set -o pipefail; ${nativeDump} "$DB_NAME" | gzip'`;
	if (!database.includes("'")) return native;

	// Probe before streaming: retrying a failed dump would concatenate partial SQL.
	const script = `
set -eo pipefail
probe_exit=0
probe_error=$(docker exec -e DB_NAME="$DB_NAME" -e DB_PASS="$DB_PASS" -i "$CONTAINER_ID" bash -c '${nativeDump} --no-data "$DB_NAME"' 2>&1 >/dev/null) || probe_exit=$?
if [ "$probe_exit" -eq 0 ]; then
  docker exec -e DB_NAME="$DB_NAME" -e DB_PASS="$DB_PASS" -i "$CONTAINER_ID" bash -c 'set -o pipefail; ${nativeDump} "$DB_NAME" | gzip'
  exit $?
fi
known_error=0
unexpected_error=0
while IFS= read -r line; do
  if [ "$line" = "$EXPECTED_NATIVE_ERROR" ]; then
    known_error=$((known_error + 1))
  elif [ -n "$line" ] && [ "$line" != 'mysqldump: [Warning] Using a password on the command line interface can be insecure.' ]; then
    unexpected_error=1
  fi
done <<< "$probe_error"
if [ "$probe_exit" -ne 2 ] || [ "$known_error" -ne 1 ] || [ "$unexpected_error" -ne 0 ]; then
  printf '%s\\n' "$probe_error" >&2
  exit "$probe_exit"
fi
fail() { printf 'MySQL backup client: %s\\n' "$1" >&2; exit 1; }
source_id=$(docker inspect --format '{{.Id}}' "$CONTAINER_ID")
[[ "$source_id" =~ ^[a-f0-9]{64}$ ]] || fail 'invalid source container identity'
metadata=$(docker exec -e DB_PASS="$DB_PASS" -i "$source_id" sh -c 'exec mysql --batch --skip-column-names --raw -u root --password="$DB_PASS" -e "SELECT VERSION(), @@server_uuid, @@port, @@skip_networking, CURRENT_USER()"') || fail 'cannot read source connection metadata using existing credentials'
[[ "$metadata" != *$'\\n'* ]] || fail 'invalid source metadata'
IFS=$'\\t' read -r server_version server_uuid server_port skip_networking source_user extra <<< "$metadata"
# This exact-version guard is the bounded prototype's tested compatibility scope.
[ "$server_version" = '8.4.11' ] || fail 'fixed-client fallback is only validated for MySQL 8.4.11'
[[ "$server_uuid" =~ ^[a-fA-F0-9-]{36}$ ]] && [ -n "$source_user" ] && [ -z "$extra" ] || fail 'invalid source identity'
[ "$skip_networking" = '0' ] || fail 'socket-only source cannot use the fixed TCP client; server settings were not changed'
[[ "$server_port" =~ ^[1-9][0-9]{0,4}$ ]] && [ "$server_port" -le 65535 ] || fail 'invalid source TCP port'
image_id=$(docker image inspect --format '{{.Id}}' "$CLIENT_IMAGE" 2>/dev/null) || {
  docker pull "$CLIENT_IMAGE" >&2 || fail 'fixed client image is unavailable'
  image_id=$(docker image inspect --format '{{.Id}}' "$CLIENT_IMAGE") || fail 'cannot inspect fixed client image'
}
[[ "$image_id" =~ ^sha256:[a-f0-9]{64}$ ]] || fail 'invalid fixed client image identity'
helper_id=''
cleanup() {
  command_exit=$?
  trap - EXIT INT TERM
  if [ -n "$helper_id" ] && ! docker rm -f "$helper_id" >/dev/null; then
    printf 'MySQL backup client: cleanup failed for %s\\n' "$helper_id" >&2
    if [ "$command_exit" -eq 0 ]; then command_exit=1; fi
  fi
  exit "$command_exit"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
created_id=$(docker create --label com.dokploy.backup.client=mysql-9.7.4 --network "container:$source_id" --cpus 1 --memory 512m --pids-limit 128 --tmpfs /var/lib/mysql:rw,size=64m --cap-drop ALL --security-opt no-new-privileges --entrypoint sleep "$image_id" infinity)
[[ "$created_id" =~ ^[a-f0-9]{64}$ ]] || fail 'invalid helper container identity'
helper_id=$created_id
helper_identity=$(docker inspect --format '{{.Image}} {{.HostConfig.NetworkMode}}' "$helper_id")
[ "$helper_identity" = "$image_id container:$source_id" ] || fail 'helper image or network identity mismatch'
docker start "$helper_id" >/dev/null
client_version=$(docker exec "$helper_id" mysqldump --version)
[[ "$client_version" == 'mysqldump  Ver 9.7.4 for '* ]] || fail 'unexpected fixed client version'
client_identity=$(docker exec -e DB_PASS="$DB_PASS" -e DB_PORT="$server_port" "$helper_id" sh -c 'exec mysql --no-defaults --protocol=TCP --host=127.0.0.1 --port="$DB_PORT" --ssl-mode=REQUIRED --connect-timeout=10 --default-character-set=utf8mb4 -u root --password="$DB_PASS" --batch --skip-column-names --raw -e "SELECT VERSION(), @@server_uuid, CURRENT_USER()"') || fail 'existing root credentials cannot authenticate through the fixed TCP client; users and grants were not changed'
[[ "$client_identity" != *$'\\n'* ]] || fail 'invalid helper server identity'
IFS=$'\\t' read -r client_server_version client_server_uuid client_account extra <<< "$client_identity"
[ "$client_server_version" = "$server_version" ] && [ "$client_server_uuid" = "$server_uuid" ] && [ -n "$client_account" ] && [ -z "$extra" ] || fail 'helper reached a different server'
docker exec -e DB_NAME="$DB_NAME" -e DB_PASS="$DB_PASS" -e DB_PORT="$server_port" "$helper_id" sh -c 'exec mysqldump --no-defaults --protocol=TCP --host=127.0.0.1 --port="$DB_PORT" --ssl-mode=REQUIRED --default-character-set=utf8mb4 -u root --password="$DB_PASS" --single-transaction --no-tablespaces --routines --events --quick "$DB_NAME"' | docker exec -i "$source_id" gzip
`;
	return `env CONTAINER_ID="$CONTAINER_ID" DB_NAME=${quote([database])} DB_PASS=${quote([databasePassword])} EXPECTED_NATIVE_ERROR=${shellLiteral(nativeIdentifierError(database))} CLIENT_IMAGE=${shellLiteral(mysqlBackupClientImage)} bash -o pipefail -c ${shellLiteral(script)}`;
};
