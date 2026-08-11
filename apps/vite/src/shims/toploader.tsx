import { useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";

interface TopLoaderProps {
	color?: string;
	height?: number;
}

const TopLoader = ({ color, height = 3 }: TopLoaderProps) => {
	const router = useRouter();
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		const unsubStart = router.subscribe("onBeforeNavigate", () =>
			setLoading(true),
		);
		const unsubEnd = router.subscribe("onResolved", () => setLoading(false));
		return () => {
			unsubStart();
			unsubEnd();
		};
	}, [router]);

	if (!loading) return null;

	return (
		<div
			className="fixed inset-x-0 top-0 z-[9999] animate-pulse"
			style={{
				height,
				background: color ?? "hsl(var(--sidebar-ring))",
			}}
		/>
	);
};

export default TopLoader;
