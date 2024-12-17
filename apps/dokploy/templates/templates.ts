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
		id: "budibase",
		name: "Budibase",
		version: "3.2.25",
		description:
			"Budibase is an open-source low-code platform that saves engineers 100s of hours building forms, portals, and approval apps, securely.",
		logo: "budibase.svg",
		links: {
			github: "https://github.com/Budibase/budibase",
			website: "https://budibase.com/",
			docs: "https://docs.budibase.com/docs/",
		},
		tags: ["database", "low-code", "nocode", "applications"],
		load: () => import("./budibase/index").then((m) => m.generate),
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
		version: "1.23.15",
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
		version: "1.70.3",
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
		version: "0.257.2",
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
		version: "v0.4.8",
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
		version: "v2.14.0",
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
		version: "v1.6.1-16",
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
		version: "1.22.3",
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
	{
		id: "filebrowser",
		name: "File Browser",
		version: "2.31.2",
		description:
			"Filebrowser is a standalone file manager for uploading, deleting, previewing, renaming, and editing files, with support for multiple users, each with their own directory.",
		logo: "filebrowser.svg",
		links: {
			github: "https://github.com/filebrowser/filebrowser",
			website: "https://filebrowser.org/",
			docs: "https://filebrowser.org/",
		},
		tags: ["file", "manager"],
		load: () => import("./filebrowser/index").then((m) => m.generate),
	},
	{
		id: "tolgee",
		name: "Tolgee",
		version: "v3.80.4",
		description:
			"Developer & translator friendly web-based localization platform",
		logo: "tolgee.svg",
		links: {
			github: "https://github.com/tolgee/tolgee-platform",
			website: "https://tolgee.io",
			docs: "https://tolgee.io/platform",
		},
		tags: ["self-hosted", "i18n", "localization", "translations"],
		load: () => import("./tolgee/index").then((m) => m.generate),
	},
	{
		id: "portainer",
		name: "Portainer",
		version: "2.21.4",
		description:
			"Portainer is a container management tool for deploying, troubleshooting, and securing applications across cloud, data centers, and IoT.",
		logo: "portainer.svg",
		links: {
			github: "https://github.com/portainer/portainer",
			website: "https://www.portainer.io/",
			docs: "https://docs.portainer.io/",
		},
		tags: ["cloud", "monitoring"],
		load: () => import("./portainer/index").then((m) => m.generate),
	},
	{
		id: "influxdb",
		name: "InfluxDB",
		version: "2.7.10",
		description:
			"InfluxDB 2.7 is the platform purpose-built to collect, store, process and visualize time series data.",
		logo: "influxdb.png",
		links: {
			github: "https://github.com/influxdata/influxdb",
			website: "https://www.influxdata.com/",
			docs: "https://docs.influxdata.com/influxdb/v2/",
		},
		tags: ["self-hosted", "open-source", "storage", "database"],
		load: () => import("./influxdb/index").then((m) => m.generate),
	},
	{
		id: "infisical",
		name: "Infisical",
		version: "0.90.1",
		description:
			"All-in-one platform to securely manage application configuration and secrets across your team and infrastructure.",
		logo: "infisical.jpg",
		links: {
			github: "https://github.com/Infisical/infisical",
			website: "https://infisical.com/",
			docs: "https://infisical.com/docs/documentation/getting-started/introduction",
		},
		tags: ["self-hosted", "open-source"],
		load: () => import("./infisical/index").then((m) => m.generate),
	},
	{
		id: "docmost",
		name: "Docmost",
		version: "0.4.1",
		description:
			"Docmost, is an open-source collaborative wiki and documentation software.",
		logo: "docmost.png",
		links: {
			github: "https://github.com/docmost/docmost",
			website: "https://docmost.com/",
			docs: "https://docmost.com/docs/",
		},
		tags: ["self-hosted", "open-source", "manager"],
		load: () => import("./docmost/index").then((m) => m.generate),
	},
	{
		id: "vaultwarden",
		name: "Vaultwarden",
		version: "1.32.3",
		description:
			"Unofficial Bitwarden compatible server written in Rust, formerly known as bitwarden_rs",
		logo: "vaultwarden.svg",
		links: {
			github: "https://github.com/dani-garcia/vaultwarden",
			website: "",
			docs: "https://github.com/dani-garcia/vaultwarden/wiki",
		},
		tags: ["open-source"],
		load: () => import("./vaultwarden/index").then((m) => m.generate),
	},
	{
		id: "hi-events",
		name: "Hi.events",
		version: "0.8.0-beta.1",
		description:
			"Hi.Events is a self-hosted event management and ticket selling platform that allows you to create, manage and promote events easily.",
		logo: "hi-events.svg",
		links: {
			github: "https://github.com/HiEventsDev/hi.events",
			website: "https://hi.events/",
			docs: "https://hi.events/docs",
		},
		tags: ["self-hosted", "open-source", "manager"],
		load: () => import("./hi-events/index").then((m) => m.generate),
	},
	{
		id: "windows",
		name: "Windows (dockerized)",
		version: "4.00",
		description: "Windows inside a Docker container.",
		logo: "windows.png",
		links: {
			github: "https://github.com/dockur/windows",
			website: "",
			docs: "https://github.com/dockur/windows?tab=readme-ov-file#how-do-i-use-it",
		},
		tags: ["self-hosted", "open-source", "os"],
		load: () => import("./windows/index").then((m) => m.generate),
	},
	{
		id: "macos",
		name: "MacOS (dockerized)",
		version: "1.14",
		description: "MacOS inside a Docker container.",
		logo: "macos.png",
		links: {
			github: "https://github.com/dockur/macos",
			website: "",
			docs: "https://github.com/dockur/macos?tab=readme-ov-file#how-do-i-use-it",
		},
		tags: ["self-hosted", "open-source", "os"],
		load: () => import("./macos/index").then((m) => m.generate),
	},
	{
		id: "coder",
		name: "Coder",
		version: "2.15.3",
		description:
			"Coder is an open-source cloud development environment (CDE) that you host in your cloud or on-premises.",
		logo: "coder.svg",
		links: {
			github: "https://github.com/coder/coder",
			website: "https://coder.com/",
			docs: "https://coder.com/docs",
		},
		tags: ["self-hosted", "open-source", "builder"],
		load: () => import("./coder/index").then((m) => m.generate),
	},
	{
		id: "stirling",
		name: "Stirling PDF",
		version: "0.30.1",
		description: "A locally hosted one-stop shop for all your PDF needs",
		logo: "stirling.svg",
		links: {
			github: "https://github.com/Stirling-Tools/Stirling-PDF",
			website: "https://www.stirlingpdf.com/",
			docs: "https://docs.stirlingpdf.com/",
		},
		tags: ["pdf", "tools"],
		load: () => import("./stirling/index").then((m) => m.generate),
	},
	{
		id: "lobe-chat",
		name: "Lobe Chat",
		version: "v1.26.1",
		description: "Lobe Chat - an open-source, modern-design AI chat framework.",
		logo: "lobe-chat.png",
		links: {
			github: "https://github.com/lobehub/lobe-chat",
			website: "https://chat-preview.lobehub.com/",
			docs: "https://lobehub.com/docs/self-hosting/platform/docker-compose",
		},
		tags: ["IA", "chat"],
		load: () => import("./lobe-chat/index").then((m) => m.generate),
	},
	{
		id: "peppermint",
		name: "Peppermint",
		version: "latest",
		description:
			"Peppermint is a modern, open-source API development platform that helps you build, test and document your APIs.",
		logo: "peppermint.svg",
		links: {
			github: "https://github.com/Peppermint-Lab/peppermint",
			website: "https://peppermint.sh/",
			docs: "https://docs.peppermint.sh/",
		},
		tags: ["api", "development", "documentation"],
		load: () => import("./peppermint/index").then((m) => m.generate),
	},
	{
		id: "windmill",
		name: "Windmill",
		version: "latest",
		description:
			"A developer platform to build production-grade workflows and internal apps. Open-source alternative to Airplane, Retool, and GitHub Actions.",
		logo: "windmill.svg",
		links: {
			github: "https://github.com/windmill-labs/windmill",
			website: "https://www.windmill.dev/",
			docs: "https://docs.windmill.dev/",
		},
		tags: ["workflow", "automation", "development"],
		load: () => import("./windmill/index").then((m) => m.generate),
	},
	{
		id: "activepieces",
		name: "Activepieces",
		version: "0.35.0",
		description:
			"Open-source no-code business automation tool. An alternative to Zapier, Make.com, and Tray.",
		logo: "activepieces.svg",
		links: {
			github: "https://github.com/activepieces/activepieces",
			website: "https://www.activepieces.com/",
			docs: "https://www.activepieces.com/docs",
		},
		tags: ["automation", "workflow", "no-code"],
		load: () => import("./activepieces/index").then((m) => m.generate),
	},
	{
		id: "invoiceshelf",
		name: "InvoiceShelf",
		version: "latest",
		description:
			"InvoiceShelf is a self-hosted open source invoicing system for freelancers and small businesses.",
		logo: "invoiceshelf.png",
		links: {
			github: "https://github.com/InvoiceShelf/invoiceshelf",
			website: "https://invoiceshelf.com",
			docs: "https://github.com/InvoiceShelf/invoiceshelf#readme",
		},
		tags: ["invoice", "business", "finance"],
		load: () => import("./invoiceshelf/index").then((m) => m.generate),
	},
	{
		id: "postiz",
		name: "Postiz",
		version: "latest",
		description:
			"Postiz is a modern, open-source platform for managing and publishing content across multiple channels.",
		logo: "postiz.png",
		links: {
			github: "https://github.com/gitroomhq/postiz",
			website: "https://postiz.com",
			docs: "https://docs.postiz.com",
		},
		tags: ["cms", "content-management", "publishing"],
		load: () => import("./postiz/index").then((m) => m.generate),
	},
	{
		id: "slash",
		name: "Slash",
		version: "latest",
		description:
			"Slash is a modern, self-hosted bookmarking service and link shortener that helps you organize and share your favorite links.",
		logo: "slash.png",
		links: {
			github: "https://github.com/yourselfhosted/slash",
			website: "https://github.com/yourselfhosted/slash#readme",
			docs: "https://github.com/yourselfhosted/slash/wiki",
		},
		tags: ["bookmarks", "link-shortener", "self-hosted"],
		load: () => import("./slash/index").then((m) => m.generate),
	},
	{
		id: "discord-tickets",
		name: "Discord Tickets",
		version: "4.0.21",
		description:
			"An open-source Discord bot for creating and managing support ticket channels.",
		logo: "discord-tickets.png",
		links: {
			github: "https://github.com/discord-tickets/bot",
			website: "https://discordtickets.app",
			docs: "https://discordtickets.app/self-hosting/installation/docker/",
		},
		tags: ["discord", "tickets", "support"],
		load: () => import("./discord-tickets/index").then((m) => m.generate),
	},
	{
		id: "nextcloud-aio",
		name: "Nextcloud All in One",
		version: "30.0.2",
		description:
			"Nextcloud (AIO) is a self-hosted file storage and sync platform with powerful collaboration capabilities. It integrates Files, Talk, Groupware, Office, Assistant and more into a single platform for remote work and data protection.",
		logo: "nextcloud-aio.svg",
		links: {
			github: "https://github.com/nextcloud/docker",
			website: "https://nextcloud.com/",
			docs: "https://docs.nextcloud.com/",
		},
		tags: ["file", "sync"],
		load: () => import("./nextcloud-aio/index").then((m) => m.generate),
	},
	{
		id: "blender",
		name: "Blender",
		version: "latest",
		description:
			"Blender is a free and open-source 3D creation suite. It supports the entire 3D pipeline—modeling, rigging, animation, simulation, rendering, compositing and motion tracking, video editing and 2D animation pipeline.",
		logo: "blender.svg",
		links: {
			github: "https://github.com/linuxserver/docker-blender",
			website: "https://www.blender.org/",
			docs: "https://docs.blender.org/",
		},
		tags: ["3d", "rendering", "animation"],
		load: () => import("./blender/index").then((m) => m.generate),
	},
	{
		id: "heyform",
		name: "HeyForm",
		version: "latest",
		description:
			"Allows anyone to create engaging conversational forms for surveys, questionnaires, quizzes, and polls. No coding skills required.",
		logo: "heyform.svg",
		links: {
			github: "https://github.com/heyform/heyform",
			website: "https://heyform.net",
			docs: "https://docs.heyform.net",
		},
		tags: ["form", "builder", "questionnaire", "quiz", "survey"],
		load: () => import("./heyform/index").then((m) => m.generate),
	},
	{
		id: "chatwoot",
		name: "Chatwoot",
		version: "v3.14.1",
		description:
			"Open-source customer engagement platform that provides a shared inbox for teams, live chat, and omnichannel support.",
		logo: "chatwoot.svg",
		links: {
			github: "https://github.com/chatwoot/chatwoot",
			website: "https://www.chatwoot.com",
			docs: "https://www.chatwoot.com/docs",
		},
		tags: ["support", "chat", "customer-service"],
		load: () => import("./chatwoot/index").then((m) => m.generate),
	},
	{
		id: "discourse",
		name: "Discourse",
		version: "3.3.2",
		description:
			"Discourse is a modern forum software for your community. Use it as a mailing list, discussion forum, or long-form chat room.",
		logo: "discourse.svg",
		links: {
			github: "https://github.com/discourse/discourse",
			website: "https://www.discourse.org/",
			docs: "https://meta.discourse.org/",
		},
		tags: ["forum", "community", "discussion"],
		load: () => import("./discourse/index").then((m) => m.generate),
	},
	{
		id: "immich",
		name: "Immich",
		version: "v1.121.0",
		description:
			"High performance self-hosted photo and video backup solution directly from your mobile phone.",
		logo: "immich.svg",
		links: {
			github: "https://github.com/immich-app/immich",
			website: "https://immich.app/",
			docs: "https://immich.app/docs/overview/introduction",
		},
		tags: ["photos", "videos", "backup", "media"],
		load: () => import("./immich/index").then((m) => m.generate),
	},
	{
		id: "twenty",
		name: "Twenty CRM",
		version: "latest",
		description:
			"Twenty is a modern CRM offering a powerful spreadsheet interface and open-source alternative to Salesforce.",
		logo: "twenty.svg",
		links: {
			github: "https://github.com/twentyhq/twenty",
			website: "https://twenty.com",
			docs: "https://docs.twenty.com",
		},
		tags: ["crm", "sales", "business"],
		load: () => import("./twenty/index").then((m) => m.generate),
	},
	{
		id: "yourls",
		name: "YOURLS",
		version: "1.9.2",
		description:
			"YOURLS (Your Own URL Shortener) is a set of PHP scripts that will allow you to run your own URL shortening service (a la TinyURL or Bitly).",
		logo: "yourls.svg",
		links: {
			github: "https://github.com/YOURLS/YOURLS",
			website: "https://yourls.org/",
			docs: "https://yourls.org/#documentation",
		},
		tags: ["url-shortener", "php"],
		load: () => import("./yourls/index").then((m) => m.generate),
	},
	{
		id: "ryot",
		name: "Ryot",
		version: "v7.10",
		description:
			"A self-hosted platform for tracking various media types including movies, TV shows, video games, books, audiobooks, and more.",
		logo: "ryot.png",
		links: {
			github: "https://github.com/IgnisDa/ryot",
			website: "https://ryot.io/",
			docs: "https://docs.ryot.io/",
		},
		tags: ["media", "tracking", "self-hosted"],
		load: () => import("./ryot/index").then((m) => m.generate),
	},
	{
		id: "photoprism",
		name: "Photoprism",
		version: "latest",
		description:
			"PhotoPrism® is an AI-Powered Photos App for the Decentralized Web. It makes use of the latest technologies to tag and find pictures automatically without getting in your way.",
		logo: "photoprism.svg",
		links: {
			github: "https://github.com/photoprism/photoprism",
			website: "https://www.photoprism.app/",
			docs: "https://docs.photoprism.app/",
		},
		tags: ["media", "photos", "self-hosted"],
		load: () => import("./photoprism/index").then((m) => m.generate),
	},
	{
		id: "ontime",
		name: "Ontime",
		version: "v3.8.0",
		description:
			"Ontime is browser-based application that manages event rundowns, scheduliing and cuing",
		logo: "ontime.png",
		links: {
			github: "https://github.com/cpvalente/ontime/",
			website: "https://getontime.no",
			docs: "https://docs.getontime.no",
		},
		tags: ["event"],
		load: () => import("./ontime/index").then((m) => m.generate),
	},
	{
		id: "triggerdotdev",
		name: "Trigger.dev",
		version: "v3",
		description:
			"Trigger is a platform for building event-driven applications.",
		logo: "triggerdotdev.svg",
		links: {
			github: "https://github.com/triggerdotdev/trigger.dev",
			website: "https://trigger.dev/",
			docs: "https://trigger.dev/docs",
		},
		tags: ["event-driven", "applications"],
		load: () => import("./triggerdotdev/index").then((m) => m.generate),
	},
	{
		id: "browserless",
		name: "Browserless",
		version: "2.23.0",
		description:
			"Browserless allows remote clients to connect and execute headless work, all inside of docker. It supports the standard, unforked Puppeteer and Playwright libraries, as well offering REST-based APIs for common actions like data collection, PDF generation and more.",
		logo: "browserless.svg",
		links: {
			github: "https://github.com/browserless/browserless",
			website: "https://www.browserless.io/",
			docs: "https://docs.browserless.io/",
		},
		tags: ["browser", "automation"],
		load: () => import("./browserless/index").then((m) => m.generate),
	},
	{
		id: "drawio",
		name: "draw.io",
		version: "24.7.17",
		description:
			"draw.io is a configurable diagramming/whiteboarding visualization application.",
		logo: "drawio.svg",
		links: {
			github: "https://github.com/jgraph/drawio",
			website: "https://draw.io/",
			docs: "https://www.drawio.com/doc/",
		},
		tags: ["drawing", "diagrams"],
		load: () => import("./drawio/index").then((m) => m.generate),
	},
	{
		id: "kimai",
		name: "Kimai",
		version: "2.26.0",
		description:
			"Kimai is a web-based multi-user time-tracking application. Works great for everyone: freelancers, companies, organizations - everyone can track their times, generate reports, create invoices and do so much more.",
		logo: "kimai.svg",
		links: {
			github: "https://github.com/kimai/kimai",
			website: "https://www.kimai.org",
			docs: "https://www.kimai.org/documentation",
		},
		tags: ["invoice", "business", "finance"],
		load: () => import("./kimai/index").then((m) => m.generate),
	},
	{
		id: "logto",
		name: "Logto",
		version: "1.22.0",
		description:
			"Logto is an open-source Identity and Access Management (IAM) platform designed to streamline Customer Identity and Access Management (CIAM) and Workforce Identity Management.",
		logo: "logto.png",
		links: {
			github: "https://github.com/logto-io/logto",
			website: "https://logto.io/",
			docs: "https://docs.logto.io/introduction",
		},
		tags: ["identity", "auth"],
		load: () => import("./logto/index").then((m) => m.generate),
	},
	{
		id: "penpot",
		name: "Penpot",
		version: "2.3.2",
		description:
			"Penpot is the web-based open-source design tool that bridges the gap between designers and developers.",
		logo: "penpot.svg",
		links: {
			github: "https://github.com/penpot/penpot",
			website: "https://penpot.app/",
			docs: "https://docs.penpot.app/",
		},
		tags: ["desing", "collaboration"],
		load: () => import("./penpot/index").then((m) => m.generate),
	},
	{
		id: "huly",
		name: "Huly",
		version: "0.6.377",
		description:
			"Huly — All-in-One Project Management Platform (alternative to Linear, Jira, Slack, Notion, Motion)",
		logo: "huly.svg",
		links: {
			github: "https://github.com/hcengineering/huly-selfhost",
			website: "https://huly.io/",
			docs: "https://docs.huly.io/",
		},
		tags: ["project-management", "community", "discussion"],
		load: () => import("./huly/index").then((m) => m.generate),
	},
	{
		id: "unsend",
		name: "Unsend",
		version: "v1.2.4",
		description: "Open source alternative to Resend,Sendgrid, Postmark etc. ",
		logo: "unsend.png", // we defined the name and the extension of the logo
		links: {
			github: "https://github.com/unsend-dev/unsend",
			website: "https://unsend.dev/",
			docs: "https://docs.unsend.dev/get-started/",
		},
		tags: ["e-mail", "marketing", "business"],
		load: () => import("./unsend/index").then((m) => m.generate),
	},
	{
		id: "langflow",
		name: "Langflow",
		version: "1.1.1",
		description:
			"Langflow is a low-code app builder for RAG and multi-agent AI applications. It’s Python-based and agnostic to any model, API, or database. ",
		logo: "langflow.svg",
		links: {
			github: "https://github.com/langflow-ai/langflow/tree/main",
			website: "https://www.langflow.org/",
			docs: "https://docs.langflow.org/",
		},
		tags: ["ai"],
		load: () => import("./langflow/index").then((m) => m.generate),
	},
	{
		id: "elastic-search",
		name: "Elasticsearch",
		version: "8.10.2",
		description:
			"Elasticsearch is an open-source search and analytics engine, used for full-text search and analytics on structured data such as text, web pages, images, and videos.",
		logo: "elasticsearch.svg",
		links: {
			github: "https://github.com/elastic/elasticsearch",
			website: "https://www.elastic.co/elasticsearch/",
			docs: "https://docs.elastic.co/elasticsearch/",
		},
		tags: ["search", "analytics"],
		load: () => import("./elastic-search/index").then((m) => m.generate),
	},
];
