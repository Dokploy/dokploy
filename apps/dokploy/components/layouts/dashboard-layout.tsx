import Page from "./side";
import { ImpersonationBar } from "../dashboard/impersonation/impersonation-bar";
import { api } from "@/utils/api";

interface Props {
	children: React.ReactNode;
	metaName?: string;
}

export const DashboardLayout = ({ children }: Props) => {
	const { data: haveRootAccess } = api.user.haveRootAccess.useQuery();

	return (
		<>
			<Page>{children}</Page>
			{haveRootAccess === true && <ImpersonationBar />}
		</>
	);
};
