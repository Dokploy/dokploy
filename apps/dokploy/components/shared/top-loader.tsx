import { useRouter } from "next/router";
import { useEffect } from "react";
import NProgress from "nprogress";

// Configure NProgress
NProgress.configure({
	minimum: 0.3,
	easing: "ease",
	speed: 500,
	showSpinner: false,
	trickleSpeed: 200,
});

export const TopLoader = () => {
	const router = useRouter();

	useEffect(() => {
		const handleRouteChangeStart = () => {
			NProgress.start();
		};

		const handleRouteChangeComplete = () => {
			NProgress.done();
		};

		const handleRouteChangeError = () => {
			NProgress.done();
		};

		router.events.on("routeChangeStart", handleRouteChangeStart);
		router.events.on("routeChangeComplete", handleRouteChangeComplete);
		router.events.on("routeChangeError", handleRouteChangeError);

		return () => {
			router.events.off("routeChangeStart", handleRouteChangeStart);
			router.events.off("routeChangeComplete", handleRouteChangeComplete);
			router.events.off("routeChangeError", handleRouteChangeError);
		};
	}, [router]);

	return null;
};

