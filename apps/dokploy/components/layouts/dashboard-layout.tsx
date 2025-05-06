import Page from "./side";
import { ImpersonationBar } from "../dashboard/impersonation/impersonation-bar";
import { api } from "@/utils/api";
import { authClient } from "@/lib/auth-client";
import { useEffect, useState } from "react";

interface Props {
	children: React.ReactNode;
	metaName?: string;
}

export const DashboardLayout = ({ children }: Props) => {
	const { data: user } = api.user.get.useQuery();
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const [isBeingImpersonated, setIsBeingImpersonated] = useState(false);
	const isAdmin = user?.role === "admin" || user?.role === "owner";

	useEffect(() => {
		const checkImpersonation = async () => {
			const session = await authClient.getSession();
			setIsBeingImpersonated(!!session?.data?.session?.impersonatedBy);
		};
		checkImpersonation();
	}, []);

	const showImpersonationBar = (isAdmin || isBeingImpersonated) && isCloud;

	return (
		<>
			<Page>{children}</Page>
			{showImpersonationBar && <ImpersonationBar />}
		</>
	);
};
