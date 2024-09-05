import { AddProject } from "@/components/dashboard/projects/add";
import type { Auth } from "@/server/api/services/auth";
import type { User } from "@/server/api/services/user";
import { api } from "@/utils/api";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import i18n from "@/i18n";

interface TabInfo {
	label: string;
	tabLabel?: string;
	description: string;
	index: string;
	isShow?: ({ rol, user }: { rol?: Auth["rol"]; user?: User }) => boolean;
}

export type TabState =
	| "projects"
	| "monitoring"
	| "settings"
	| "traefik"
	| "requests"
	| "docker";

interface Props {
	tab: TabState;
	children: React.ReactNode;
}

export const NavigationTabs = ({ tab, children }: Props) => {
	const router = useRouter();
	const tabMap: Record<TabState, TabInfo> = {
		projects: {
			label: i18n.getText("NAVIGATION.tabs.projects.label"),
			description: i18n.getText("NAVIGATION.tabs.projects.description"),
			index: "/dashboard/projects",
		},
		monitoring: {
			label: i18n.getText("NAVIGATION.tabs.monitoring.label"),
			description: i18n.getText("NAVIGATION.tabs.monitoring.description"),
			index: "/dashboard/monitoring",
		},
		traefik: {
			label: i18n.getText("NAVIGATION.tabs.traefik.label"),
			description: i18n.getText("NAVIGATION.tabs.traefik.description"),
			index: "/dashboard/traefik",
			isShow: ({ rol, user }) => {
				return Boolean(rol === "admin" || user?.canAccessToTraefikFiles);
			},
		},
		docker: {
			label: i18n.getText("NAVIGATION.tabs.docker.label"),
			description: i18n.getText("NAVIGATION.tabs.docker.description"),
			index: "/dashboard/docker",
			isShow: ({ rol, user }) => {
				return Boolean(rol === "admin" || user?.canAccessToDocker);
			},
		},
		settings: {
			label: i18n.getText("NAVIGATION.tabs.settings.label"),
			description: i18n.getText("NAVIGATION.tabs.settings.description"),
			index: "/dashboard/settings/server",
		},
		requests: {
			label: i18n.getText("NAVIGATION.tabs.requests.label"),
			description: i18n.getText("NAVIGATION.tabs.requests.description"),
			index: "/dashboard/requests",
			// isShow: ({ rol, user }) => {
			// 	return Boolean(rol === "admin" || user?.canAccessToRequests);
			// },
		},
	};

	const { data } = api.auth.get.useQuery();
	const [activeTab, setActiveTab] = useState<TabState>(tab);
	const { data: user } = api.user.byAuthId.useQuery(
		{
			authId: data?.id || "",
		},
		{
			enabled: !!data?.id && data?.rol === "user",
		},
	);

	useEffect(() => {
		setActiveTab(tab);
	}, [tab]);

	const activeTabInfo = useMemo(() => {
		return tabMap[activeTab];
	}, [activeTab]);

	return (
		<div className="gap-12">
			<header className="mb-6 flex w-full items-center gap-2 justify-between flex-wrap">
				<div className="flex flex-col gap-2">
					<h1 className="text-xl font-bold lg:text-3xl">
						{activeTabInfo.label}
					</h1>
					<p className="lg:text-medium text-muted-foreground">
						{activeTabInfo.description}
					</p>
				</div>
				{tab === "projects" &&
					(data?.rol === "admin" || user?.canCreateProjects) && <AddProject />}
			</header>
			<div className="flex w-full justify-between gap-8 ">
				<Tabs
					value={activeTab}
					className="w-full"
					onValueChange={async (e) => {
						setActiveTab(e as TabState);
						router.push(tabMap[e as TabState].index);
					}}
				>
					{/* className="grid w-fit grid-cols-4 bg-transparent" */}
					<div className="flex flex-row items-center justify-between w-full gap-4 max-sm:overflow-x-auto border-b border-b-divider pb-1">
						<TabsList className="bg-transparent relative px-0">
							{Object.keys(tabMap).map((key) => {
								const tab = tabMap[key as TabState];
								if (tab.isShow && !tab.isShow?.({ rol: data?.rol, user })) {
									return null;
								}
								return (
									<TabsTrigger
										key={key}
										value={key}
										className="relative py-2.5 md:px-5 data-[state=active]:shadow-none data-[state=active]:bg-transparent rounded-md hover:bg-zinc-100 hover:dark:bg-zinc-800 data-[state=active]:hover:bg-zinc-100 data-[state=active]:hover:dark:bg-zinc-800"
									>
										<span className="relative z-[1] w-full">
											{tab.tabLabel || tab.label}
										</span>
										{key === activeTab && (
											<div className="absolute -bottom-[5.5px] w-full">
												<div className="h-0.5 bg-foreground rounded-t-md" />
											</div>
										)}
									</TabsTrigger>
								);
							})}
						</TabsList>
					</div>

					<TabsContent value={activeTab} className="w-full">
						{children}
					</TabsContent>
				</Tabs>
			</div>
		</div>
	);
};
