import type { TemplateData } from "./types/templates-data.type";

export const templates: TemplateData[] = [
	{
		id: "pocketbase",
		name: "Pocketbase",
		description:
			"Pocketbase is a self-hosted alternative to Firebase that allows you to build and host your own backend services.",
		links: {
			github: "https://github.com/pocketbase/pocketbase",
			docs: "https://pocketbase.io/docs/",
			website: "https://pocketbase.io/",
		},
		logo: "pocketbase.svg",
		load: () => import("./pocketbase/index").then((m) => m.generate),
		tags: ["database", "cms", "headless"],
	},
	// {
	// 	name: "Plausible",
	// 	description:
	// 		"Plausible is a simple, open source, self-hosted web analytics platform that lets you track website traffic and user behavior.",
	// 	type: "docker-compose",
	// 	folder: "plausible",
	// 	links: {
	// 		github: "https://github.com/plausible/plausible",
	// 		docs: "https://plausible.io/docs/docker/",
	// 	},
	// 	logo: "https://plausible.io/assets/images/icon/plausible_logo.svg",
	// 	// load: () => import("./plausible/index").then((m) => m.generate),
	// },
	// {
	// 	name: "Directus",
	// 	description:
	// 		"Directus is a self-hosted headless CMS that allows you to build and host your own backend services.",
	// 	type: "docker-compose",
	// 	folder: "directus",
	// 	links: {
	// 		github: "https://github.com/directus/directus",
	// 		docs: "https://docs.directus.io/",
	// 	},
	// 	logo: "https://directus.io/_nuxt/logo-dark.Bhm22UGW.svg",
	// 	// load: () => import("./directus/index").then((m) => m.generate),
	// },
	// {
	// 	name: "ActualBudget",
	// 	description:
	// 		"ActualBudget is a self-hosted budgeting app that allows you to build and host your own backend services.",
	// 	type: "docker-compose",
	// 	folder: "actualbudget",
	// 	links: {
	// 		github: "https://github.com/actualbudget/actualbudget",
	// 		docs: "https://docs.actualbudget.org/",
	// 	},
	// 	logo: "https://actualbudget.org/img/actual.png",
	// 	// load: () => import("./actualbudget/index").then((m) => m.generate),
	// },
	// {
	// 	name: "Calcom",
	// 	description:
	// 		"Calcom is a open source alternative to Calendly that allows to create scheduling and booking services.",
	// 	type: "docker-compose",
	// 	folder: "calcom",
	// 	links: {
	// 		github: "https://github.com/calcom/cal.com",
	// 		docs: "https://docs.calcom.com/",
	// 	},
	// 	logo: "https://raw.githubusercontent.com/calcom/cal.com/main/apps/web/public/emails/logo.png",
	// 	// load: () => import("./calcom/index").then((m) => m.generate),
	// },
	// {
	// 	name: "Directus",
	// 	description:
	// 		"Directus is a self-hosted headless CMS that allows you to build and host your own backend services.",
	// 	type: "docker-compose",
	// 	folder: "directus",
	// 	links: {
	// 		github: "https://github.com/directus/directus",
	// 		docs: "https://docs.directus.io/",
	// 	},
	// 	logo: "https://directus.io/_nuxt/logo-dark.Bhm22UGW.svg",
	// 	// load: () => import("./directus/index").then((m) => m.generate),
	// },
	// {
	// 	name: "ActualBudget",
	// 	description:
	// 		"ActualBudget is a self-hosted budgeting app that allows you to build and host your own backend services.",
	// 	type: "docker-compose",
	// 	folder: "actualbudget",
	// 	links: {
	// 		github: "https://github.com/actualbudget/actualbudget",
	// 		docs: "https://docs.actualbudget.org/",
	// 	},
	// 	logo: "https://actualbudget.org/img/actual.png",
	// 	// load: () => import("./actualbudget/index").then((m) => m.generate),
	// },
	// {
	// 	name: "Calcom",
	// 	description:
	// 		"Calcom is a open source alternative to Calendly that allows to create scheduling and booking services.",
	// 	type: "docker-compose",
	// 	folder: "calcom",
	// 	links: {
	// 		github: "https://github.com/calcom/cal.com",
	// 		docs: "https://docs.calcom.com/",
	// 	},
	// 	logo: "https://raw.githubusercontent.com/calcom/cal.com/main/apps/web/public/emails/logo.png",
	// 	// load: () => import("./calcom/index").then((m) => m.generate),
	// },
	// {
	// 	name: "Directus",
	// 	description:
	// 		"Directus is a self-hosted headless CMS that allows you to build and host your own backend services.",
	// 	type: "docker-compose",
	// 	folder: "directus",
	// 	links: {
	// 		github: "https://github.com/directus/directus",
	// 		docs: "https://docs.directus.io/",
	// 	},
	// 	logo: "https://directus.io/_nuxt/logo-dark.Bhm22UGW.svg",
	// 	// load: () => import("./directus/index").then((m) => m.generate),
	// },
	// {
	// 	name: "ActualBudget",
	// 	description:
	// 		"ActualBudget is a self-hosted budgeting app that allows you to build and host your own backend services.",
	// 	type: "docker-compose",
	// 	folder: "actualbudget",
	// 	links: {
	// 		github: "https://github.com/actualbudget/actualbudget",
	// 		docs: "https://docs.actualbudget.org/",
	// 	},
	// 	logo: "https://actualbudget.org/img/actual.png",
	// 	// load: () => import("./actualbudget/index").then((m) => m.generate),
	// },
	// {
	// 	name: "Calcom",
	// 	description:
	// 		"Calcom is a open source alternative to Calendly that allows to create scheduling and booking services.",
	// 	type: "docker-compose",
	// 	folder: "calcom",
	// 	links: {
	// 		github: "https://github.com/calcom/cal.com",
	// 		docs: "https://docs.calcom.com/",
	// 	},
	// 	logo: "https://raw.githubusercontent.com/calcom/cal.com/main/apps/web/public/emails/logo.png",
	// 	// load: () => import("./calcom/index").then((m) => m.generate),
	// },
];
