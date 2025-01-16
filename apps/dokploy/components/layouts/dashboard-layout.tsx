import { useEffect, useState } from "react";
import Page from "./side";

interface Props {
	children: React.ReactNode;
	metaName?: string;
}

export const DashboardLayout = ({ children }: Props) => {
	const [defaultOpen, setDefaultOpen] = useState(true);

	useEffect(() => {
		const cookieValue = document.cookie
			.split("; ")
			.find((row) => row.startsWith("sidebar:state="))
			?.split("=")[1];
		setDefaultOpen(cookieValue === "true");
	}, []);

	return (
		<Page defaultOpen={defaultOpen}>
			<div>{children}</div>
		</Page>
	);
};
