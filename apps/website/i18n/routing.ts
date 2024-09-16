import { createSharedPathnamesNavigation } from "next-intl/navigation";
import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
	// A list of all locales that are supported
	locales: ["en", "zh-Hans"],

	// Used when no locale matches
	defaultLocale: "en",
	localePrefix: "as-needed",
});

// Lightweight wrappers around Next.js' navigation APIs
// that will consider the routing configuration
export const { Link, redirect, usePathname, useRouter } =
	createSharedPathnamesNavigation(routing);
