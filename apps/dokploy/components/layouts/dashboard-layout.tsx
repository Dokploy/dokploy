import SideWrapper from "./side-wrapper";

interface Props {
	children: React.ReactNode;
	metaName?: string;
}

export const DashboardLayout = ({ children }: Props) => {
	return (
		<SideWrapper>
			<div>{children}</div>
		</SideWrapper>
	);
};
