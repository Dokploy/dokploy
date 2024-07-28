import { cn } from "@/lib/utils";
import { api } from "@/utils/api";
import React from "react";
import { AppearanceForm } from "./appearance-form";
import { ShowCertificates } from "./certificates/show-certificates";
import { ShowDestinations } from "./destination/show-destinations";
import { GithubSetup } from "./github/github-setup";
import { ProfileForm } from "./profile/profile-form";
import { ShowUsers } from "./users/show-users";
import { WebDomain } from "./web-domain";
import { WebServer } from "./web-server";

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
