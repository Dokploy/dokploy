import { api } from "@/utils/api";
import { ImpersonationBar } from "../dashboard/impersonation/impersonation-bar";
import { ChatwootWidget } from "../shared/ChatwootWidget";
import Page from "./side";

interface Props {
	children: React.ReactNode;
	metaName?: string;
}

export const DashboardLayout = ({ children }: Props) => {
	const { data: haveRootAccess } = api.user.haveRootAccess.useQuery();
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { data: isUserSubscribed } = api.settings.isUserSubscribed.useQuery(
		undefined,
		{
			enabled: isCloud === true,
			refetchOnWindowFocus: false,
			refetchOnMount: false,
			refetchOnReconnect: false,
		},
	);

	return (
		<>
			<Page>{children}</Page>
			{isCloud === true && isUserSubscribed === true && (
				<ChatwootWidget websiteToken="USCpQRKzHvFMssf3p6Eacae5" />
			)}

			{haveRootAccess === true && <ImpersonationBar />}
		</>
	);
};
