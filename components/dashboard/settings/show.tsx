import React from "react";
import { ProfileForm } from "./profile/profile-form";
import { GithubSetup } from "./github/github-setup";
import { AppearanceForm } from "./appearance-form";
import { ShowDestinations } from "./destination/show-destinations";
import { ShowCertificates } from "./certificates/show-certificates";
import { WebDomain } from "./web-domain";
import { WebServer } from "./web-server";
import { api } from "@/utils/api";
import { ShowUsers } from "./users/show-users";
import { cn } from "@/lib/utils";

export const ShowSettings = () => {
	const { data } = api.auth.get.useQuery();

	return (
		<div
			className={cn(
				"mt-6 md:grid flex flex-col gap-4 pb-20  md:grid-cols-2",
				data?.rol === "user" && "col-span-2",
			)}
		>
			<div className={cn(data?.rol === "user" && "col-span-2")}>
				<ProfileForm />
			</div>

			{data?.rol === "admin" && (
				<>
					<GithubSetup />
					<AppearanceForm />
					<ShowDestinations />
					<ShowCertificates />
					<WebDomain />
					<WebServer />
					<ShowUsers />
				</>
			)}
		</div>
	);
};
