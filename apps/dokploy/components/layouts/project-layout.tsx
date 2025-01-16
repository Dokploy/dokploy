import { useEffect, useState } from "react";
import Page from "./side";

interface Props {
	children: React.ReactNode;
}

export const ProjectLayout = ({ children }: Props) => {
	const [defaultOpen, setDefaultOpen] = useState(true);

	useEffect(() => {
		const cookieValue = document.cookie
			.split("; ")
			.find(row => row.startsWith("sidebar:state="))
			?.split("=")[1];
		setDefaultOpen(cookieValue === "true");
	}, []);

	return (
		<div>
			<Page defaultOpen={defaultOpen}>{children}</Page>
		</div>
	);
};
