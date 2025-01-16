"use client";

import type * as React from "react";
import { useEffect, useState } from "react";
import { SIDEBAR_COOKIE_NAME } from "../ui/sidebar";
import Page from "./side";

export default function SideWrapper({
	children,
}: {
	children: React.ReactNode;
}) {
	const [defaultOpen, setDefaultOpen] = useState(true);

	useEffect(() => {
		const cookieValue = document.cookie
			.split("; ")
			.find((row) => row.startsWith(`${SIDEBAR_COOKIE_NAME}=`))
			?.split("=")[1];
		setDefaultOpen(cookieValue === "true");
	}, []);

	return <Page defaultOpen={defaultOpen}>{children}</Page>;
}
