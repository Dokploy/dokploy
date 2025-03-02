import { ToggleVisibilityInput } from "@/components/shared/toggle-visibility-input";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { api } from "@/utils/api";
import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

export const GenerateToken = () => {
	const { data, refetch } = api.auth.get.useQuery();

	const { mutateAsync: generateToken, isLoading: isLoadingToken } =
		api.auth.generateToken.useMutation();

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar  p-2.5 rounded-xl  max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md ">
					<CardHeader className="flex flex-row gap-2 flex-wrap justify-between items-center">
						<div>
							<CardTitle className="text-xl">API/CLI</CardTitle>
							<CardDescription>
								Generate a token to access the API/CLI
							</CardDescription>
						</div>
						<div className="flex flex-row gap-2 max-sm:flex-wrap items-end">
							<span className="text-sm font-medium text-muted-foreground">
								Swagger API:
							</span>
							<Link
								href="/swagger"
								target="_blank"
								className="flex flex-row gap-2 items-center"
							>
								<span className="text-sm font-medium">View</span>
								<ExternalLinkIcon className="size-4" />
							</Link>
						</div>
					</CardHeader>
					<CardContent className="space-y-2">
						<div className="flex flex-row gap-2 max-sm:flex-wrap justify-end items-end">
							<div className="grid w-full gap-8">
								<div className="flex flex-col gap-2">
									<Label>Token</Label>
									<ToggleVisibilityInput
										placeholder="Token"
										value={data?.token || ""}
										disabled
									/>
								</div>
							</div>
							<Button
								type="button"
								isLoading={isLoadingToken}
								onClick={async () => {
									await generateToken().then(() => {
										refetch();
										toast.success("Token generated");
									});
								}}
							>
								Generate
							</Button>
						</div>
					</CardContent>
				</div>
			</Card>
		</div>
	);
};
