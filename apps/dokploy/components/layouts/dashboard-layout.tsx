import Page from "./side";
interface Props {
	children: React.ReactNode;
	metaName?: string;
}

export const DashboardLayout = ({ children }: Props) => {
	return <Page>{children}</Page>;
};
