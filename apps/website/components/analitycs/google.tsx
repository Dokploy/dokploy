"use client";

import { useEffect } from "react";
import initializeGA from ".";

export default function GoogleAnalytics() {
	useEffect(() => {
		// @ts-ignore
		if (!window.GA_INITIALIZED) {
			initializeGA();
			// @ts-ignore
			window.GA_INITIALIZED = true;
		}
	}, []);

	return null;
}
