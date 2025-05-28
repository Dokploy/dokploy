import { api } from "@/utils/api";
import { ImpersonationBar } from "../dashboard/impersonation/impersonation-bar";
import Page from "./side";
import { ChatwootWidget } from "../shared/ChatwootWidget";

interface Props {
	children: React.ReactNode;
	metaName?: string;
}

export const DashboardLayout = ({ children }: Props) => {
	const { data: haveRootAccess } = api.user.haveRootAccess.useQuery();
	const { data: isCloud } = api.settings.isCloud.useQuery();

	return (
		<>
			<Page>{children}</Page>
			{isCloud && <ChatwootWidget websiteToken="USCpQRKzHvFMssf3p6Eacae5" />}

			{haveRootAccess === true && <ImpersonationBar />}
		</>
	);
};
