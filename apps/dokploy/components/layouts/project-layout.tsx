import SideWrapper from "./side-wrapper";

interface Props {
	children: React.ReactNode;
}

export const ProjectLayout = ({ children }: Props) => {
	return (
		<div>
			<SideWrapper>{children}</SideWrapper>
		</div>
	);
};
