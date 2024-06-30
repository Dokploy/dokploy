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
		version: "0.251.0",
		description:
			"NocoDB is an opensource Airtable alternative that turns any MySQL, PostgreSQL, SQL Server, SQLite & MariaDB into a smart spreadsheet.",

		links: {
			github: "https://github.com/nocodb/nocodb",
			website: "https://nocodb.com/",
			docs: "https://docs.nocodb.com/",
		},
		logo: "nocodb.png",
		tags: ["database", "spreadsheet", "low-code", 'nocode'],
		load: () => import("./nocodb/index").then((m) => m.generate),
	},
];
