import { Button, buttonVariants } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api } from "@/utils/api";
import { BadgeCheck } from "lucide-react";
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { RemoveGithubApp } from "./remove-github-app";
export const generateName = () => {
	const n1 = ["Blue", "Green", "Red", "Orange", "Violet", "Indigo", "Yellow"];
	const n2 = [
		"One",
		"Two",
		"Three",
		"Four",
		"Five",
		"Six",
		"Seven",
		"Eight",
		"Nine",
		"Zero",
	];
	return `Dokploy-${n1[Math.round(Math.random() * (n1.length - 1))]}-${
		n2[Math.round(Math.random() * (n2.length - 1))]
	}`;
};
function slugify(text: string) {
	return text
		.toLowerCase()
		.replace(/[\s\^&*()+=!]+/g, "-")
		.replace(/[\$.,*+~()'"!:@^&]+/g, "")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export const GithubSetup = () => {
	const [isOrganization, setIsOrganization] = useState(false);
	const { data: haveGithubConfigured } =
		api.admin.haveGithubConfigured.useQuery();
	const [manifest, setManifest] = useState<string>("");
	const [organizationName, setOrganization] = useState<string>("");
	const { data } = api.admin.one.useQuery();
	useEffect(() => {
		const url = document.location.origin;
		const manifest = JSON.stringify(
			{
				redirect_url: `${origin}/api/redirect?authId=${data?.authId}`,
				name: generateName(),
				url: origin,
				hook_attributes: {
					// JUST FOR TESTING
					url: `${url}/api/deploy/github`,
					// url: `${origin}/api/webhook`, // Aquí especificas la URL del endpoint de tu webhook
				},
				callback_urls: [`${origin}/api/redirect`], // Los URLs de callback para procesos de autenticación
				public: false,
				request_oauth_on_install: true,
				default_permissions: {
					contents: "read",
					metadata: "read",
					emails: "read",
					pull_requests: "write",
				},
				default_events: ["pull_request", "push"],
			},
			null,
			4,
		);

		setManifest(manifest);
	}, [data?.authId]);
	return (
		<Card className="bg-transparent">
			<CardHeader>
				<CardTitle className="text-xl">Configure Github </CardTitle>
				<CardDescription>
					Setup your github account to access to your repositories.
				</CardDescription>
			</CardHeader>
			<CardContent className="h-full space-y-2">
				{haveGithubConfigured ? (
					<div className="flex flex-col gap-2">
						<div className="flex items-center gap-4">
							<span className="text-muted-foreground text-sm">
								Github account configured succesfully.
							</span>
							<BadgeCheck className="size-4 text-green-700" />
						</div>
						<div className="flex items-end gap-4 flex-wrap">
							<RemoveGithubApp />
							{/* <Link
								href={`https://github.com/settings/apps/${data?.githubAppName}`}
								target="_blank"
								className={buttonVariants({
									className: "w-fit",
									variant: "secondary",
								})}
							>
								<span className="text-sm">Manage Github App</span>
							</Link> */}
						</div>
					</div>
				) : (
					<>
						{data?.githubAppName ? (
							<div className="flex w-fit flex-col gap-4">
								<span className="text-muted-foreground">
									You've successfully created a github app named{" "}
									<strong>{data.githubAppName}</strong>! The next step is to
									install this app in your GitHub account.
								</span>

								<div className="flex flex-row gap-4">
									<Link
										href={`https://github.com/apps/${slugify(
											data.githubAppName,
										)}/installations/new?state=gh_setup:${data?.authId}`}
										className={buttonVariants({ className: "w-fit" })}
									>
										Install Github App
									</Link>
									<RemoveGithubApp />
								</div>
							</div>
						) : (
							<div>
								<div className="flex items-center gap-2">
									<p className="text-muted-foreground text-sm">
										To integrate your GitHub account with our services, you'll
										need to create and install a GitHub app. This process is
										straightforward and only takes a few minutes. Click the
										button below to get started.
									</p>
								</div>

								<div className="mt-4 flex flex-col gap-4">
									<div className="flex flex-row gap-4">
										<span>Organization?</span>
										<Switch
											checked={isOrganization}
											onCheckedChange={(checked) => setIsOrganization(checked)}
										/>
									</div>

									{isOrganization && (
										<Input
											required
											placeholder="Organization name"
											onChange={(e) => setOrganization(e.target.value)}
										/>
									)}
								</div>

								<form
									action={
										isOrganization
											? `https://github.com/organizations/${organizationName}/settings/apps/new?state=gh_init:${data?.authId}`
											: `https://github.com/settings/apps/new?state=gh_init:${data?.authId}`
									}
									method="post"
								>
									<input
										type="text"
										name="manifest"
										id="manifest"
										defaultValue={manifest}
										className="invisible"
									/>
									<br />

									<Button
										disabled={isOrganization && organizationName.length < 1}
										type="submit"
									>
										Create GitHub App
									</Button>
								</form>
							</div>
						)}
					</>
				)}
			</CardContent>
		</Card>
	);
};
