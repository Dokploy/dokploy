import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/utils/api";
import { Split } from "lucide-react";
import React from "react";
import { AddRedirect } from "./add-redirect";
import { DeleteRedirect } from "./delete-redirect";
import { UpdateRedirect } from "./update-redirect";
interface Props {
	applicationId: string;
}

export const ShowRedirects = ({ applicationId }: Props) => {
	const { data } = api.application.one.useQuery(
		{
			applicationId,
		},
		{ enabled: !!applicationId },
	);

	return (
		<Card className="bg-background">
			<CardHeader className="flex flex-row justify-between flex-wrap gap-4">
				<div>
					<CardTitle className="text-xl">Redirects</CardTitle>
					<CardDescription>
						If you want to redirect requests to this application use the
						following config to setup the redirects
					</CardDescription>
				</div>

				{data && data?.redirects.length > 0 && (
					<AddRedirect applicationId={applicationId}>Add Redirect</AddRedirect>
				)}
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{data?.redirects.length === 0 ? (
					<div className="flex w-full flex-col items-center justify-center gap-3 pt-10">
						<Split className="size-8 text-muted-foreground" />
						<span className="text-base text-muted-foreground">
							No redirects configured
						</span>
						<AddRedirect applicationId={applicationId}>
							Add Redirect
						</AddRedirect>
					</div>
				) : (
					<div className="flex flex-col pt-2">
						<div className="flex flex-col gap-6">
							{data?.redirects.map((redirect) => (
								<div key={redirect.redirectId}>
									<div className="flex w-full flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-10 border rounded-lg p-4">
										<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 flex-col gap-4 sm:gap-8">
											<div className="flex flex-col gap-1">
												<span className="font-medium">Regex</span>
												<span className="text-sm text-muted-foreground">
													{redirect.regex}
												</span>
											</div>
											<div className="flex flex-col gap-1">
												<span className="font-medium">Replacement</span>
												<span className="text-sm text-muted-foreground">
													{redirect.replacement}
												</span>
											</div>
											<div className="flex flex-col gap-1">
												<span className="font-medium">Permanent</span>
												<span className="text-sm text-muted-foreground">
													{redirect.permanent ? "Yes" : "No"}
												</span>
											</div>
										</div>
										<div className="flex flex-row gap-4">
											<UpdateRedirect redirectId={redirect.redirectId} />
											<DeleteRedirect redirectId={redirect.redirectId} />
										</div>
									</div>
								</div>
							))}
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
};
