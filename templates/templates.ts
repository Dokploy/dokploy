import type { TemplateData } from "./types/templates-data.type";

export const templates: TemplateData[] = [
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
		version: "2.7.6",
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
		version: "10.12.1",
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
];
