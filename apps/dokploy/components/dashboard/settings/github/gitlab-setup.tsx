import React, { useState, useEffect } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { BadgeCheck, ExternalLink } from "lucide-react";
import Link from "next/link";
import { api } from "@/utils/api";

export const GitlabSetup = () => {
	const [applicationId, setApplicationId] = useState("");
	const [applicationSecret, setApplicationSecret] = useState("");
	const haveGitlabConfigured = false;
	const [url, setUrl] = useState("");
	// const { data: haveGitlabConfigured } =
	// 	api.admin.haveGitlabConfigured.useQuery();
	const { data: adminData } = api.admin.one.useQuery();

	useEffect(() => {
		const protocolAndHost = `${window.location.protocol}//${window.location.host}`;

		setUrl(`${protocolAndHost}`);
	}, [adminData]);

	// const createGitlabApp = api.admin.createGitlabApp.useMutation();

	const handleCreateApp = async () => {
		// try {
		// 	// await createGitlabApp.mutateAsync({
		// 	// 	applicationId,
		// 	// 	applicationSecret,
		// 	// 	callbackUrl: `${window.location.origin}/api/gitlab/callback`,
		// 	// });
		// 	// Refetch the configuration status
		// 	// await haveGitlabConfigured.refetch();
		// } catch (error) {
		// 	console.error("Failed to create GitLab app", error);
		// }
	};

	return (
		<Card className="bg-transparent">
			<CardHeader>
				<CardTitle className="text-xl">Configure GitLab</CardTitle>
				<CardDescription>
					Setup your GitLab account to access your repositories.
				</CardDescription>
			</CardHeader>
			<CardContent className="h-full space-y-2">
				{haveGitlabConfigured ? (
					<div className="flex flex-col gap-2">
						<div className="flex items-center gap-4">
							<span className="text-muted-foreground text-sm">
								GitLab account configured successfully.
							</span>
							<BadgeCheck className="size-4 text-green-700" />
						</div>
						<div className="flex items-end gap-4 flex-wrap">
							<Button
								variant="destructive"
								onClick={() => {
									/* Implement remove GitLab app logic */
								}}
							>
								Remove GitLab App
							</Button>
							<Link
								href="https://gitlab.com/-/profile/applications"
								target="_blank"
								className={buttonVariants({
									className: "w-fit",
									variant: "secondary",
								})}
							>
								<span className="text-sm">Manage GitLab App</span>
							</Link>
						</div>
					</div>
				) : (
					<div className="flex flex-col gap-4">
						<p className="text-muted-foreground text-sm">
							To integrate your GitLab account, you need to create a new
							application in your GitLab settings. Follow these steps:
						</p>
						<ol className="list-decimal list-inside text-sm text-muted-foreground">
							<li className="flex flex-row gap-2">
								Go to your GitLab profile settings{" "}
								<Link
									href="https://gitlab.com/-/profile/applications"
									target="_blank"
								>
									<ExternalLink className="w-fit text-primary size-4" />
								</Link>
							</li>
							<li>Navigate to Applications</li>
							<li>
								Create a new application with the following details:
								<ul className="list-disc list-inside ml-4">
									<li>Name: Dokploy</li>
									<li>Redirect URI: {`${url}/api/gitlab/callback`}</li>
									<li>Scopes: api, read_user, read_repository</li>
								</ul>
							</li>
							<li>
								After creating, you'll receive an Application ID and Secret
							</li>
						</ol>
						<Input
							placeholder="Application ID"
							value={applicationId}
							onChange={(e) => setApplicationId(e.target.value)}
						/>
						<Input
							type="password"
							placeholder="Application Secret"
							value={applicationSecret}
							onChange={(e) => setApplicationSecret(e.target.value)}
						/>
						<Button
							onClick={handleCreateApp}
							disabled={!applicationId || !applicationSecret}
						>
							Configure GitLab App
						</Button>
					</div>
				)}
			</CardContent>
		</Card>
	);
};
