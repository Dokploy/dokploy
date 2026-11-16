export const CONNECT_STEPS = [
	"SSH connection from Dokploy",
	"Ubuntu or Debian",
	"2 GB RAM and 30 GB disk",
	"Docker and Traefik installed",
] as const;

export type ConnectFailKind =
	| "ssh"
	| "os"
	| "memory"
	| "disk"
	| "limit"
	| "setup";

interface ConnectFailure {
	step: number;
	title: string;
	body: string;
	fix: string[];
}

export const CONNECT_FAILURES: Record<ConnectFailKind, ConnectFailure> = {
	ssh: {
		step: 0,
		title: "Dokploy couldn't open an SSH connection to the server",
		body: "The command reached Dokploy, but Dokploy couldn't sign in back as root on port 22. A firewall is blocking that port, or SSH doesn't allow root to sign in with a key.",
		fix: [
			"In your provider's firewall or security group, allow inbound TCP on ports 22, 80 and 443.",
			"Make sure SSH listens on port 22 and allows root to sign in with a key.",
			"Run the command from the Connect screen again on the server.",
		],
	},
	os: {
		step: 1,
		title: "This server isn't running Ubuntu or Debian",
		body: "Dokploy found a different operating system, so it stopped before changing anything.",
		fix: [
			"Open your provider's dashboard and rebuild the server with Ubuntu 24.04 or Debian 12.",
			"Run the command from the Connect screen again on the rebuilt server.",
		],
	},
	memory: {
		step: 2,
		title: "This server has less than 2 GB of RAM",
		body: "Dokploy needs 2 GB of RAM and 30 GB of disk to build and run apps, so it stopped before installing anything.",
		fix: [
			"Resize the server to at least 2 GB of RAM in your provider's dashboard.",
			"Wait for the resize to finish.",
			"Run the command from the Connect screen again on the server.",
		],
	},
	disk: {
		step: 2,
		title: "This server has less than 30 GB of disk",
		body: "Dokploy needs 2 GB of RAM and 30 GB of disk to build and run apps, so it stopped before installing anything.",
		fix: [
			"Resize the server's disk to at least 30 GB in your provider's dashboard.",
			"Wait for the resize to finish.",
			"Run the command from the Connect screen again on the server.",
		],
	},
	limit: {
		step: 2,
		title: "Your plan doesn't include another server",
		body: "The server is reachable, but your current plan has no free server slots, so it wasn't added.",
		fix: [
			"Open Settings → Billing and add a server to your plan.",
			"Run the command from the Connect screen again on the server.",
		],
	},
	setup: {
		step: 3,
		title: "Installing Docker and Traefik didn't finish",
		body: "Dokploy connected to the server, but the install stopped before it was ready.",
		fix: [
			"Make sure the server can reach the internet and nothing else is using ports 80 and 443.",
			"Check again from this page. Dokploy retries the install.",
		],
	},
};

export const SERVER_REQUIREMENTS = [
	"2 GB RAM or more",
	"30 GB disk or more",
	"Ubuntu or Debian",
];

export const SERVER_PROVIDERS = [
	{
		id: "hostinger",
		name: "Hostinger",
		offer: "20% discount",
		url: "https://www.hostinger.com/vps-hosting?REFERRALCODE=1SIUMAURICI97",
	},
	{
		id: "hetzner",
		name: "Hetzner",
		offer: "€20 credits",
		url: "https://hetzner.cloud/?ref=vou4fhxJ1W2D",
	},
	{
		id: "contabo",
		name: "Contabo",
		offer: "",
		url: "https://contabo.com/en/vps/",
	},
	{
		id: "digitalocean",
		name: "DigitalOcean",
		offer: "$200 credits",
		url: "https://m.do.co/c/db24efd43f35",
	},
] as const;

export type OnboardingScreen =
	| "path"
	| "plan"
	| "provider"
	| "connect"
	| "deploy";

export const isOnboardingScreen = (
	value: string | null | undefined,
): value is OnboardingScreen =>
	value === "path" ||
	value === "plan" ||
	value === "provider" ||
	value === "connect" ||
	value === "deploy";
