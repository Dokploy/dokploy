import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/utils/api";
import { LockKeyhole } from "lucide-react";
import React from "react";
import { AddSecurity } from "./add-security";
import { DeleteSecurity } from "./delete-security";
import { UpdateSecurity } from "./update-security";
interface Props {
	applicationId: string;
}

export const ShowSecurity = ({ applicationId }: Props) => {
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
					<CardTitle className="text-xl">Security</CardTitle>
					<CardDescription>Add basic auth to your application</CardDescription>
				</div>

				{data && data?.security.length > 0 && (
					<AddSecurity applicationId={applicationId}>Add Security</AddSecurity>
				)}
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{data?.security.length === 0 ? (
					<div className="flex w-full flex-col items-center justify-center gap-3 pt-10">
						<LockKeyhole className="size-8 text-muted-foreground" />
						<span className="text-base text-muted-foreground">
							No security configured
						</span>
						<AddSecurity applicationId={applicationId}>
							Add Security
						</AddSecurity>
					</div>
				) : (
					<div className="flex flex-col pt-2">
						<div className="flex flex-col gap-6 ">
							{data?.security.map((security) => (
								<div key={security.securityId}>
									<div className="flex w-full flex-col sm:flex-row justify-between sm:items-center gap-4 sm:gap-10 border rounded-lg p-4">
										<div className="grid grid-cols-1 sm:grid-cols-2 flex-col gap-4 sm:gap-8">
											<div className="flex flex-col gap-1">
												<span className="font-medium">Username</span>
												<span className="text-sm text-muted-foreground">
													{security.username}
												</span>
											</div>
											<div className="flex flex-col gap-1">
												<span className="font-medium">Password</span>
												<span className="text-sm text-muted-foreground">
													{security.password}
												</span>
											</div>
										</div>
										<div className="flex flex-row gap-2">
											<UpdateSecurity securityId={security.securityId} />
											<DeleteSecurity securityId={security.securityId} />
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
