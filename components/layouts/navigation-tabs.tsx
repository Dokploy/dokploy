import { AddProject } from "@/components/dashboard/projects/add";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { api } from "@/utils/api";

export type TabState =
	| "projects"
	| "monitoring"
	| "settings"
	| "traefik"
	| "docker";

interface Props {
	tab: TabState;
	children: React.ReactNode;
}

export const NavigationTabs = ({ tab, children }: Props) => {
	const router = useRouter();

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

	return (
		<div className="gap-12">
			<header className="mb-6 flex w-full items-center gap-2 justify-between flex-wrap">
				<div className="flex flex-col gap-2">
					<h1 className="text-xl font-bold lg:text-3xl">
						{tab === "projects" && "Projects"}
						{tab === "monitoring" && "Monitoring"}
						{tab === "settings" && "Settings"}
						{tab === "traefik" && "Traefik"}
						{tab === "docker" && "Docker"}
					</h1>
					<p className="lg:text-medium text-muted-foreground">
						{tab === "projects" && "Manage your deployments"}
						{tab === "monitoring" && "Watch the usage of your server"}
						{tab === "settings" && "Check the configuration"}
						{tab === "traefik" && "Read the traefik config and update it"}
						{tab === "docker" && "Manage the docker containers"}
					</p>
				</div>
				{tab === "projects" &&
					(data?.rol === "admin" || user?.canCreateProjects) && <AddProject />}
			</header>
			<div className="flex w-full justify-between gap-8 ">
				<Tabs
					value={activeTab}
					className="w-full"
					onValueChange={(e) => {
						if (e === "settings") {
							router.push("/dashboard/settings/server");
						} else {
							router.push(`/dashboard/${e}`);
						}
						setActiveTab(e as TabState);
					}}
				>
					{/* className="grid w-fit grid-cols-4 bg-transparent" */}
					<div className="flex flex-row items-center justify-between  w-full gap-4 max-sm:overflow-x-auto">
						<TabsList className="md:grid md:w-fit md:grid-cols-5  justify-start bg-transparent">
							<TabsTrigger
								value="projects"
								className="rounded-none border-b-2 border-b-transparent data-[state=active]:border-b-2 data-[state=active]:border-b-border"
							>
								Projects
							</TabsTrigger>
							<TabsTrigger
								value="monitoring"
								className="rounded-none border-b-2 border-b-transparent data-[state=active]:border-b-2 data-[state=active]:border-b-border"
							>
								Monitoring
							</TabsTrigger>

							{(data?.rol === "admin" || user?.canAccessToTraefikFiles) && (
								<TabsTrigger
									value="traefik"
									className="rounded-none border-b-2 border-b-transparent data-[state=active]:border-b-2 data-[state=active]:border-b-border"
								>
									Traefik File System
								</TabsTrigger>
							)}
							{(data?.rol === "admin" || user?.canAccessToDocker) && (
								<TabsTrigger
									value="docker"
									className="rounded-none border-b-2 border-b-transparent data-[state=active]:border-b-2 data-[state=active]:border-b-border"
								>
									Docker
								</TabsTrigger>
							)}

							<TabsTrigger
								value="settings"
								className="rounded-none border-b-2 border-b-transparent data-[state=active]:border-b-2 data-[state=active]:border-b-border"
							>
								Settings
							</TabsTrigger>
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
