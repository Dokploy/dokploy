import Page from "./side";

interface Props {
	children: React.ReactNode;
}

export const ProjectLayout = ({ children }: Props) => {
	return <Page>{children}</Page>;
};
