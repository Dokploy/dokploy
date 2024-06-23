import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/utils/api";
import { toast } from "sonner";
import { ToggleVisibilityInput } from "@/components/shared/toggle-visibility-input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { ExternalLinkIcon } from "lucide-react";

export const GenerateToken = () => {
	const { data, refetch } = api.auth.get.useQuery();

	const { mutateAsync: generateToken, isLoading: isLoadingToken } =
		api.auth.generateToken.useMutation();

	return (
		<Card className="bg-transparent">
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
							<ToggleVisibilityInput value={data?.token || ""} disabled />
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
		</Card>
	);
};
