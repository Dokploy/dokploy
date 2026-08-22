import { useRouter } from "next/router";
import { useEffect, useState } from "react";

let lastDepth: number | null = null;

const depthOf = (path: string) =>
	path.split("?")[0]!.split("/").filter(Boolean).length;

export const DnsPageTransition = ({
	children,
}: {
	children: React.ReactNode;
}) => {
	const { asPath } = useRouter();
	const depth = depthOf(asPath);
	const [direction] = useState(() =>
		lastDepth !== null && depth < lastDepth ? "back" : "forward",
	);

	useEffect(() => {
		lastDepth = depth;
	}, [depth]);

	return (
		<div
			data-direction={direction}
			className="t-page-enter flex w-full flex-col gap-4"
		>
			{children}
		</div>
	);
};
