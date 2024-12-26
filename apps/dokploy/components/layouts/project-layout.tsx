import { Navbar } from "./navbar";
import Page from "./side";

interface Props {
	children: React.ReactNode;
}

export const ProjectLayout = ({ children }: Props) => {
	return (
		<div>
			<Page>{children}</Page>
		</div>
	);
};
