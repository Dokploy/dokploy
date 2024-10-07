import type { TemplateData } from "./types/templates-data.type";

export const templates: TemplateData[] = [
	{
		id: "supabase",
		name: "SupaBase",
		version: "1.24.07",
		description:
			"The open source Firebase alternative. Supabase gives you a dedicated Postgres database to build your web, mobile, and AI applications. ",
		links: {
			github: "https://github.com/supabase/supabase",
			website: "https://supabase.com/",
			docs: "https://supabase.com/docs/guides/self-hosting",
		},
		logo: "supabase.svg",
		load: () => import("./supabase/index").then((m) => m.generate),
		tags: ["database", "firebase", "postgres"],
	},
	{
		id: "pocketbase",
		name: "Pocketbase",
		version: "v0.22.12",
		description:
			"Pocketbase is a self-hosted alternative to Firebase that allows you to build and host your own backend services.",
		links: {
			github: "https://github.com/pocketbase/pocketbase",
			website: "https://pocketbase.io/",
			docs: "https://pocketbase.io/docs/",
		},
		logo: "pocketbase.svg",
		load: () => import("./pocketbase/index").then((m) => m.generate),
		tags: ["database", "cms", "headless"],
	},
	{
		id: "plausible",
		name: "Plausible",
		version: "v2.1.0",
		description:
			"Plausible is a open source, self-hosted web analytics platform that lets you track website traffic and user behavior.",
		logo: "plausible.svg",
		links: {
			github: "https://github.com/plausible/plausible",
			website: "https://plausible.io/",
			docs: "https://plausible.io/docs",
		},
		tags: ["analytics"],
		load: () => import("./plausible/index").then((m) => m.generate),
	},
	{
		id: "calcom",
		name: "Calcom",
		version: "v2.7.6",
		description:
			"Calcom is a open source alternative to Calendly that allows to create scheduling and booking services.",

		links: {
			github: "https://github.com/calcom/cal.com",
			website: "https://cal.com/",
			docs: "https://cal.com/docs",
		},
		logo: "calcom.jpg",
		tags: ["scheduling", "booking"],
		load: () => import("./calcom/index").then((m) => m.generate),
	},
	{
		id: "grafana",
		name: "Grafana",
		version: "9.5.20",
		description:
			"Grafana is an open source platform for data visualization and monitoring.",
		logo: "grafana.svg",
		links: {
			github: "https://github.com/grafana/grafana",
			website: "https://grafana.com/",
			docs: "https://grafana.com/docs/",
		},
		tags: ["monitoring"],
		load: () => import("./grafana/index").then((m) => m.generate),
	},
	{
		id: "directus",
		name: "Directus",
		version: "11.0.2",
		description:
			"Directus is an open source headless CMS that provides an API-first solution for building custom backends.",
		logo: "directus.jpg",
		links: {
			github: "https://github.com/directus/directus",
			website: "https://directus.io/",
			docs: "https://docs.directus.io/",
		},
		tags: ["cms"],
		load: () => import("./directus/index").then((m) => m.generate),
	},
	{
		id: "baserow",
		name: "Baserow",
		version: "1.25.2",
		description:
			"Baserow is an open source database management tool that allows you to create and manage databases.",
		logo: "baserow.webp",
		links: {
			github: "https://github.com/Baserow/baserow",
			website: "https://baserow.io/",
			docs: "https://baserow.io/docs/index",
		},
		tags: ["database"],
		load: () => import("./baserow/index").then((m) => m.generate),
	},
	{
		id: "ghost",
		name: "Ghost",
		version: "5.0.0",
		description:
			"Ghost is a free and open source, professional publishing platform built on a modern Node.js technology stack.",
		logo: "ghost.jpeg",
		links: {
			github: "https://github.com/TryGhost/Ghost",
			website: "https://ghost.org/",
			docs: "https://ghost.org/docs/",
		},
		tags: ["cms"],
		load: () => import("./ghost/index").then((m) => m.generate),
	},
	{
		id: "uptime-kuma",
		name: "Uptime Kuma",
		version: "1.21.4",
		description:
			"Uptime Kuma is a free and open source monitoring tool that allows you to monitor your websites and applications.",
		logo: "uptime-kuma.png",
		links: {
			github: "https://github.com/louislam/uptime-kuma",
			website: "https://uptime.kuma.pet/",
			docs: "https://github.com/louislam/uptime-kuma/wiki",
		},
		tags: ["monitoring"],
		load: () => import("./uptime-kuma/index").then((m) => m.generate),
	},
	{
		id: "n8n",
		name: "n8n",
		version: "1.48.1",
		description:
			"n8n is an open source low-code platform for automating workflows and integrations.",
		logo: "n8n.png",
		links: {
			github: "https://github.com/n8n-io/n8n",
			website: "https://n8n.io/",
			docs: "https://docs.n8n.io/",
		},
		tags: ["automation"],
		load: () => import("./n8n/index").then((m) => m.generate),
	},
	{
		id: "wordpress",
		name: "Wordpress",
		version: "5.8.3",
		description:
			"Wordpress is a free and open source content management system (CMS) for publishing and managing websites.",
		logo: "wordpress.png",
		links: {
			github: "https://github.com/WordPress/WordPress",
			website: "https://wordpress.org/",
			docs: "https://wordpress.org/documentation/",
		},
		tags: ["cms"],
		load: () => import("./wordpress/index").then((m) => m.generate),
	},
	{
		id: "odoo",
		name: "Odoo",
		version: "16.0",
		description:
			"Odoo is a free and open source business management software that helps you manage your company's operations.",
		logo: "odoo.png",
		links: {
			github: "https://github.com/odoo/odoo",
			website: "https://odoo.com/",
			docs: "https://www.odoo.com/documentation/",
		},
		tags: ["cms"],
		load: () => import("./odoo/index").then((m) => m.generate),
	},
	{
		id: "appsmith",
		name: "Appsmith",
		version: "v1.29",
		description:
			"Appsmith is a free and open source platform for building internal tools and applications.",
		logo: "appsmith.png",
		links: {
			github: "https://github.com/appsmithorg/appsmith",
			website: "https://appsmith.com/",
			docs: "https://docs.appsmith.com/",
		},
		tags: ["cms"],
		load: () => import("./appsmith/index").then((m) => m.generate),
	},
	{
		id: "excalidraw",
		name: "Excalidraw",
		version: "latest",
		description:
			"Excalidraw is a free and open source online diagramming tool that lets you easily create and share beautiful diagrams.",
		logo: "excalidraw.jpg",
		links: {
			github: "https://github.com/excalidraw/excalidraw",
			website: "https://excalidraw.com/",
			docs: "https://docs.excalidraw.com/",
		},
		tags: ["drawing"],
		load: () => import("./excalidraw/index").then((m) => m.generate),
	},
	{
		id: "documenso",
		name: "Documenso",
		version: "v1.5.6",
		description:
			"Documenso is the open source alternative to DocuSign for signing documents digitally",

		links: {
			github: "https://github.com/documenso/documenso",
			website: "https://documenso.com/",
			docs: "https://documenso.com/docs",
		},
		logo: "documenso.png",
		tags: ["document-signing"],
		load: () => import("./documenso/index").then((m) => m.generate),
	},
	{
		id: "nocodb",
		name: "NocoDB",
		version: "0.251.1",
		description:
			"NocoDB is an opensource Airtable alternative that turns any MySQL, PostgreSQL, SQL Server, SQLite & MariaDB into a smart spreadsheet.",

		links: {
			github: "https://github.com/nocodb/nocodb",
			website: "https://nocodb.com/",
			docs: "https://docs.nocodb.com/",
		},
		logo: "nocodb.png",
		tags: ["database", "spreadsheet", "low-code", "nocode"],
		load: () => import("./nocodb/index").then((m) => m.generate),
	},
	{
		id: "meilisearch",
		name: "Meilisearch",
		version: "v1.8.3",
		description:
			"Meilisearch is a free and open-source search engine that allows you to easily add search functionality to your web applications.",
		logo: "meilisearch.png",
		links: {
			github: "https://github.com/meilisearch/meilisearch",
			website: "https://www.meilisearch.com/",
			docs: "https://docs.meilisearch.com/",
		},
		tags: ["search"],
		load: () => import("./meilisearch/index").then((m) => m.generate),
	},
	{
		id: "phpmyadmin",
		name: "Phpmyadmin",
		version: "5.2.1",
		description:
			"Phpmyadmin is a free and open-source web interface for MySQL and MariaDB that allows you to manage your databases.",
		logo: "phpmyadmin.png",
		links: {
			github: "https://github.com/phpmyadmin/phpmyadmin",
			website: "https://www.phpmyadmin.net/",
			docs: "https://www.phpmyadmin.net/docs/",
		},
		tags: ["database"],
		load: () => import("./phpmyadmin/index").then((m) => m.generate),
	},
	{
		id: "rocketchat",
		name: "Rocketchat",
		version: "6.9.2",
		description:
			"Rocket.Chat is a free and open-source web chat platform that allows you to build and manage your own chat applications.",
		logo: "rocketchat.png",
		links: {
			github: "https://github.com/RocketChat/Rocket.Chat",
			website: "https://rocket.chat/",
			docs: "https://rocket.chat/docs/",
		},
		tags: ["chat"],
		load: () => import("./rocketchat/index").then((m) => m.generate),
	},
	{
		id: "minio",
		name: "Minio",
		description:
			"Minio is an open source object storage server compatible with Amazon S3 cloud storage service.",
		logo: "minio.png",
		version: "latest",
		links: {
			github: "https://github.com/minio/minio",
			website: "https://minio.io/",
			docs: "https://docs.minio.io/",
		},
		tags: ["storage"],
		load: () => import("./minio/index").then((m) => m.generate),
	},
	{
		id: "metabase",
		name: "Metabase",
		version: "v0.50.8",
		description:
			"Metabase is an open source business intelligence tool that allows you to ask questions and visualize data.",
		logo: "metabase.png",
		links: {
			github: "https://github.com/metabase/metabase",
			website: "https://www.metabase.com/",
			docs: "https://www.metabase.com/docs/",
		},
		tags: ["database", "dashboard"],
		load: () => import("./metabase/index").then((m) => m.generate),
	},
	{
		id: "glitchtip",
		name: "Glitchtip",
		version: "v4.0",
		description: "Glitchtip is simple, open source error tracking",
		logo: "glitchtip.png",
		links: {
			github: "https://gitlab.com/glitchtip/",
			website: "https://glitchtip.com/",
			docs: "https://glitchtip.com/documentation",
		},
		tags: ["hosting"],
		load: () => import("./glitchtip/index").then((m) => m.generate),
	},
	{
		id: "open-webui",
		name: "Open WebUI",
		version: "v0.3.7",
		description:
			"Open WebUI is a free and open source chatgpt alternative. Open WebUI is an extensible, feature-rich, and user-friendly self-hosted WebUI designed to operate entirely offline. It supports various LLM runners, including Ollama and OpenAI-compatible APIs. The template include ollama and webui services.",
		logo: "open-webui.png",
		links: {
			github: "https://github.com/open-webui/open-webui",
			website: "https://openwebui.com/",
			docs: "https://docs.openwebui.com/",
		},
		tags: ["chat"],
		load: () => import("./open-webui/index").then((m) => m.generate),
	},
	{
		id: "listmonk",
		name: "Listmonk",
		version: "v3.0.0",
		description:
			"High performance, self-hosted, newsletter and mailing list manager with a modern dashboard.",
		logo: "listmonk.png",
		links: {
			github: "https://github.com/knadh/listmonk",
			website: "https://listmonk.app/",
			docs: "https://listmonk.app/docs/",
		},
		tags: ["email", "newsletter", "mailing-list"],
		load: () => import("./listmonk/index").then((m) => m.generate),
	},
	{
		id: "doublezero",
		name: "Double Zero",
		version: "v0.2.1",
		description:
			"00 is a self hostable SES dashboard for sending and monitoring emails with AWS",
		logo: "doublezero.svg",
		links: {
			github: "https://github.com/technomancy-dev/00",
			website: "https://www.double-zero.cloud/",
			docs: "https://github.com/technomancy-dev/00",
		},
		tags: ["email"],
		load: () => import("./doublezero/index").then((m) => m.generate),
	},
	{
		id: "umami",
		name: "Umami",
		version: "v2.12.1",
		description:
			"Umami is a simple, fast, privacy-focused alternative to Google Analytics.",
		logo: "umami.png",
		links: {
			github: "https://github.com/umami-software/umami",
			website: "https://umami.is",
			docs: "https://umami.is/docs",
		},
		tags: ["analytics"],
		load: () => import("./umami/index").then((m) => m.generate),
	},
	{
		id: "jellyfin",
		name: "jellyfin",
		version: "v10.9.7",
		description:
			"Jellyfin is a Free Software Media System that puts you in control of managing and streaming your media. ",
		logo: "jellyfin.svg",
		links: {
			github: "https://github.com/jellyfin/jellyfin",
			website: "https://jellyfin.org/",
			docs: "https://jellyfin.org/docs/",
		},
		tags: ["media system"],
		load: () => import("./jellyfin/index").then((m) => m.generate),
	},
	{
		id: "teable",
		name: "teable",
		version: "v1.3.1-alpha-build.460",
		description:
			"Teable is a Super fast, Real-time, Professional, Developer friendly, No-code database built on Postgres. It uses a simple, spreadsheet-like interface to create complex enterprise-level database applications. Unlock efficient app development with no-code, free from the hurdles of data security and scalability.",
		logo: "teable.png",
		links: {
			github: "https://github.com/teableio/teable",
			website: "https://teable.io/",
			docs: "https://help.teable.io/",
		},
		tags: ["database", "spreadsheet", "low-code", "nocode"],
		load: () => import("./teable/index").then((m) => m.generate),
	},
	{
		id: "zipline",
		name: "Zipline",
		version: "v3.7.9",
		description:
			"A ShareX/file upload server that is easy to use, packed with features, and with an easy setup!",
		logo: "zipline.png",
		links: {
			github: "https://github.com/diced/zipline",
			website: "https://zipline.diced.sh/",
			docs: "https://zipline.diced.sh/docs/",
		},
		tags: ["media system", "storage"],
		load: () => import("./zipline/index").then((m) => m.generate),
	},
	{
		id: "soketi",
		name: "Soketi",
		version: "v1.4-16",
		description:
			"Soketi is your simple, fast, and resilient open-source WebSockets server.",
		logo: "soketi.png",
		links: {
			github: "https://github.com/soketi/soketi",
			website: "https://soketi.app/",
			docs: "https://docs.soketi.app/",
		},
		tags: ["chat"],
		load: () => import("./soketi/index").then((m) => m.generate),
	},
	{
		id: "aptabase",
		name: "Aptabase",
		version: "v1.0.0",
		description:
			"Aptabase is a self-hosted web analytics platform that lets you track website traffic and user behavior.",
		logo: "aptabase.svg",
		links: {
			github: "https://github.com/aptabase/aptabase",
			website: "https://aptabase.com/",
			docs: "https://github.com/aptabase/aptabase/blob/main/README.md",
		},
		tags: ["analytics", "self-hosted"],
		load: () => import("./aptabase/index").then((m) => m.generate),
	},
	{
		id: "typebot",
		name: "Typebot",
		version: "2.27.0",
		description: "Typebot is an open-source chatbot builder platform.",
		logo: "typebot.svg",
		links: {
			github: "https://github.com/baptisteArno/typebot.io",
			website: "https://typebot.io/",
			docs: "https://docs.typebot.io/get-started/introduction",
		},
		tags: ["chatbot", "builder", "open-source"],
		load: () => import("./typebot/index").then((m) => m.generate),
	},
	{
		id: "gitea",
		name: "Gitea",
		version: "1.22.2",
		description:
			"Git with a cup of tea! Painless self-hosted all-in-one software development service, including Git hosting, code review, team collaboration, package registry and CI/CD.",
		logo: "gitea.png",
		links: {
			github: "https://github.com/go-gitea/gitea.git",
			website: "https://gitea.com/",
			docs: "https://docs.gitea.com/installation/install-with-docker",
		},
		tags: ["self-hosted", "storage"],
		load: () => import("./gitea/index").then((m) => m.generate),
	},
	{
		id: "roundcube",
		name: "Roundcube",
		version: "1.6.9",
		description:
			"Free and open source webmail software for the masses, written in PHP.",
		logo: "roundcube.svg",
		links: {
			github: "https://github.com/roundcube/roundcubemail",
			website: "https://roundcube.net/",
			docs: "https://roundcube.net/about/",
		},
		tags: ["self-hosted", "email", "webmail"],
		load: () => import("./roundcube/index").then((m) => m.generate),
	},
];
