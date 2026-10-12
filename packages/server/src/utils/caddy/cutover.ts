import { createPrivateKey, X509Certificate } from "node:crypto";
import { quote } from "shell-quote";

interface CutoverOptions {
	image: string;
	caddy: string;
	traefik: string;
	network: string;
	// `docker create -p` values, host port first.
	publish: string[];
	// Mounted at /etc/caddy. Holds the Caddyfile, data/ and config/.
	caddyPath: string;
	// Uploaded certificates, mounted read-only at the same path.
	certificatesPath: string;
}

interface AcmeFile {
	[resolver: string]: {
		Certificates?: {
			domain: { main: string; sans?: string[] };
			certificate: string;
			key: string;
		}[];
	};
}

const ISSUER = "caddy/certificates/acme-v02.api.letsencrypt.org-directory";

/**
 * Selects the certificates in Traefik's acme.json that Caddy can take over, so
 * a switch does not ask Let's Encrypt for every domain again. One line per
 * name: its folder in Caddy's storage, then the certificate, the key and
 * Caddy's metadata in base64. Caddy renews what it finds there like its own.
 */
export const certificateBundle = (acmeJson: string, now = new Date()) => {
	const lines: string[] = [];
	for (const resolver of Object.values(JSON.parse(acmeJson) as AcmeFile)) {
		for (const entry of resolver?.Certificates ?? []) {
			const names = [entry.domain.main, ...(entry.domain.sans ?? [])];
			const certificate = Buffer.from(entry.certificate, "base64");
			const key = Buffer.from(entry.key, "base64");
			try {
				const x509 = new X509Certificate(certificate);
				if (
					// Not a wildcard: Caddy cannot renew one without a DNS
					// challenge, and a certificate it cannot renew is an outage
					// with a date on it. A name is also used as a folder name.
					names.some((name) => !/^[a-z0-9_.-]+$/i.test(name)) ||
					new Date(x509.validTo) <= now ||
					!x509.checkPrivateKey(createPrivateKey(key))
				) {
					continue;
				}
			} catch {
				continue;
			}
			const meta = Buffer.from(
				JSON.stringify({ sans: names, issuer_data: null }),
			);
			for (const name of names) {
				lines.push(
					[
						`${ISSUER}/${name.toLowerCase()}`,
						certificate.toString("base64"),
						key.toString("base64"),
						meta.toString("base64"),
					].join(" "),
				);
			}
		}
	}
	return lines.join("\n");
};

/**
 * Unpacks a certificate bundle. Runs in Caddy's data folder. Each name's
 * folder appears whole or not at all, and a name Caddy already holds is left
 * alone: Caddy renews its own storage, so its copy is never the stale one.
 */
const UNPACK_CERTIFICATES = `if [ -f certificates.import ]; then
	umask 077
	# The last line has no newline, and read reports that as a failure.
	while read -r dir crt key json || [ -n "$dir" ]; do
		[ -n "$dir" ] && [ ! -e "$dir" ] || continue
		name=$(basename "$dir")
		rm -rf "$dir.tmp" && mkdir -p "$dir.tmp" &&
			printf %s "$crt" | base64 -d > "$dir.tmp/$name.crt" &&
			printf %s "$key" | base64 -d > "$dir.tmp/$name.key" &&
			printf %s "$json" | base64 -d > "$dir.tmp/$name.json" &&
			mv "$dir.tmp" "$dir" || exit 1
	done < certificates.import
	rm -f certificates.import
fi`;

// While it exists the script is still running, which Dokploy cannot tell from
// the outside once its connection to the server has dropped.
export const SWITCH_MARKER = "switching";

// One switch runs at a time, so a marker found at the start was left by a
// script that was killed.
const STALE_MARKER = `rm -f "$dir/${SWITCH_MARKER}"`;

const HELPERS = `fail() {
	echo "$1" >&2
	exit 1
}
# Docker also reports a container as running while it keeps restarting it.
running() { [ "$(docker inspect -f '{{.State.Status}}' "$1" 2>/dev/null)" = running ]; }
# Running since it was started by hand, without Docker having had to restart it.
started() { [ "$(docker inspect -f '{{.State.Status}} {{.RestartCount}}' "$1" 2>/dev/null)" = "running 0" ]; }
# Takes the restart policy from the proxy that stops serving. One that is gone
# has none to give up.
release() { ! docker inspect "$1" >/dev/null 2>&1 || docker update --restart no "$1" >/dev/null; }`;

/**
 * The switch from Traefik to Caddy as one script. Plain POSIX sh, because
 * Dokploy runs commands through /bin/sh. Everything slow happens while
 * Traefik still serves, every step is checked, running it again is harmless,
 * and any failure after Traefik has stopped puts Traefik back.
 */
export const switchToCaddyScript = (
	options: CutoverOptions,
) => `caddy=${quote([options.caddy])} traefik=${quote([options.traefik])}
image=${quote([options.image])} network=${quote([options.network])}
dir=${quote([options.caddyPath])} certificates=${quote([options.certificatesPath])}
${HELPERS}
reload() { docker exec "$caddy" caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1; }

${STALE_MARKER}
if running "$caddy" && ! running "$traefik"; then
	reload || fail "Caddy is running but rejected its configuration"
	release "$traefik"
	docker update --restart always "$caddy" >/dev/null
	echo "Caddy is already serving"
	exit 0
fi

mkdir -p "$dir/global" "$dir/sites" "$dir/data" "$dir/config" || fail "could not create $dir"
# The file browser edits files, it does not create them.
[ -e "$dir/global/custom.caddy" ] || echo "# Your own global options, for example trusted_proxies. Dokploy never changes this file." > "$dir/global/custom.caddy"
[ -e "$dir/sites/custom.caddy" ] || echo "# Your own sites. Dokploy never changes this file." > "$dir/sites/custom.caddy"
trap 'rm -f "$dir/${SWITCH_MARKER}"' EXIT
: > "$dir/${SWITCH_MARKER}"
# The dry run validated with the image this server has. Pulling again could
# start another build of the same tag.
docker image inspect "$image" >/dev/null 2>&1 || docker pull -q "$image" >/dev/null ||
	fail "could not pull $image"
docker rm -f "$caddy" >/dev/null 2>&1
# Caddy would resume a config saved by an earlier run instead of the new file.
rm -f "$dir/config/caddy/autosave.json"
(
cd "$dir/data" || exit 1
${UNPACK_CERTIFICATES}
) || fail "could not unpack the certificates"

docker create --name "$caddy" --network "$network" ${options.publish.map((port) => `-p ${quote([port])}`).join(" ")} \\
	-v "$dir:/etc/caddy" -v "$dir/data:/data" -v "$dir/config:/config" \\
	-v "$certificates:$certificates:ro" \\
	"$image" caddy run --resume --config /etc/caddy/Caddyfile >/dev/null ||
	fail "could not create the Caddy container"
# Traefik is attached to every isolated compose network.
for attached in $(docker inspect -f '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}} {{end}}' "$traefik"); do
	[ "$attached" = "$network" ] || docker network connect "$attached" "$caddy" >/dev/null ||
		fail "could not connect Caddy to the network $attached"
done

restore() {
	docker logs --tail 20 "$caddy" >&2
	docker rm -f "$caddy" >/dev/null 2>&1
	docker update --restart always "$traefik" >/dev/null
	docker start "$traefik" >/dev/null
	if running "$traefik"; then
		echo "Caddy did not start, so Traefik is serving again" >&2
	else
		echo "Caddy did not start and Traefik could not be restarted: run docker start $traefik" >&2
	fi
}
# A large config can take a while to load on a busy host, so the wait is
# long, but a Caddy that has exited ends it at once.
ready() {
	tries=0
	while [ "$tries" -lt 300 ]; do
		started "$caddy" || return 1
		reload && return 0
		tries=$((tries + 1))
		sleep 0.2
	done
	return 1
}
trap 'restore; exit 1' HUP INT TERM
# The restart policies change hands before the ports do: whatever cuts this
# short, a reboot included, the Docker daemon brings back exactly one proxy.
# A stopped container with restart=always would come back with it and fight
# the other for the ports.
if release "$traefik" && docker update --restart always "$caddy" >/dev/null &&
	docker stop "$traefik" >/dev/null && docker start "$caddy" >/dev/null && ready; then
	echo "Caddy is serving"
else
	restore
	exit 1
fi
`;

/**
 * The way back. Prints "missing" when the Traefik container no longer exists
 * (Docker's cleanup removes stopped containers), so the caller can recreate
 * it now that the ports are free. Any failure after Caddy has stopped puts
 * Caddy back.
 */
export const switchToTraefikScript = (
	options: Pick<CutoverOptions, "caddy" | "traefik" | "caddyPath">,
) => `caddy=${quote([options.caddy])} traefik=${quote([options.traefik])}
dir=${quote([options.caddyPath])}
${HELPERS}

${STALE_MARKER}
if running "$traefik" && ! running "$caddy"; then
	release "$caddy"
	docker update --restart always "$traefik" >/dev/null
	echo "Traefik is already serving"
	exit 0
fi
trap 'rm -f "$dir/${SWITCH_MARKER}"' EXIT
: > "$dir/${SWITCH_MARKER}"
restore() {
	# Stopped first: Docker refuses to change the policy of a container while
	# it is restarting it.
	docker stop "$traefik" >/dev/null 2>&1
	docker update --restart no "$traefik" >/dev/null 2>&1
	docker update --restart always "$caddy" >/dev/null 2>&1
	docker start "$caddy" >/dev/null 2>&1
	if running "$caddy"; then
		echo "Traefik did not start, so Caddy is serving again" >&2
	else
		echo "Traefik did not start and Caddy could not be restarted: run docker start $caddy" >&2
	fi
}
trap 'restore; exit 1' HUP INT TERM
docker stop "$caddy" >/dev/null 2>&1
# The restart policies change hands together: whatever cuts this short, a
# reboot included, the Docker daemon never brings back both proxies.
release "$caddy" || {
	docker start "$caddy" >/dev/null 2>&1
	fail "could not change the restart policy of $caddy"
}
if ! docker inspect "$traefik" >/dev/null 2>&1; then
	echo missing
	exit 0
fi
if docker update --restart always "$traefik" >/dev/null &&
	docker start "$traefik" >/dev/null && sleep 2 && started "$traefik"; then
	echo "Traefik is serving"
else
	docker logs --tail 20 "$traefik" >&2
	restore
	exit 1
fi
`;
