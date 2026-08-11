import { Link as RouterLink, useLocation } from "@tanstack/react-router";
import * as React from "react";
import type { NextUrl } from "./next-router";

type NextLinkProps = Omit<React.ComponentPropsWithoutRef<"a">, "href"> & {
	href: NextUrl;
	replace?: boolean;
	prefetch?: boolean;
	shallow?: boolean;
	scroll?: boolean;
	passHref?: boolean;
	legacyBehavior?: boolean;
	locale?: string | false;
};

const isExternal = (href: string) => /^(https?:|mailto:|tel:|\/\/)/.test(href);

const Link = React.forwardRef<HTMLAnchorElement, NextLinkProps>(
	(
		{
			href,
			replace,
			prefetch: _prefetch,
			shallow: _shallow,
			scroll: _scroll,
			passHref: _passHref,
			legacyBehavior: _legacyBehavior,
			locale: _locale,
			...props
		},
		ref,
	) => {
		const location = useLocation();

		let hrefString: string;
		if (typeof href === "string") {
			hrefString = href;
		} else {
			const params = new URLSearchParams();
			for (const [key, value] of Object.entries(href.query ?? {})) {
				if (value === undefined || value === null) continue;
				params.set(key, String(value));
			}
			const search = params.toString();
			hrefString = `${href.pathname ?? location.pathname}${search ? `?${search}` : ""}${href.hash ? `#${href.hash.replace(/^#/, "")}` : ""}`;
		}

		if (isExternal(hrefString)) {
			return <a ref={ref} href={hrefString} {...props} />;
		}

		return (
			<RouterLink
				ref={ref}
				to={hrefString}
				replace={replace}
				{...(props as Record<string, unknown>)}
			/>
		);
	},
);

Link.displayName = "NextLinkShim";

export default Link;
