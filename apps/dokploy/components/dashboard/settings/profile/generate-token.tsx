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
		<Card className="bg-transparent">
			<CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
				<div>
					<CardTitle className="text-xl">API/CLI</CardTitle>
					<CardDescription>
						Generate a token to access the API/CLI
					</CardDescription>
				</div>
				<div className="flex flex-row items-end gap-2 max-sm:flex-wrap">
					<span className="font-medium text-muted-foreground text-sm">
						Swagger API:
					</span>
					<Link
						href="/swagger"
						target="_blank"
						className="flex flex-row items-center gap-2"
					>
						<span className="font-medium text-sm">View</span>
						<ExternalLinkIcon className="size-4" />
					</Link>
				</div>
			</CardHeader>
			<CardContent className="space-y-2">
				<div className="flex flex-row items-end justify-end gap-2 max-sm:flex-wrap">
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
		</Card>
	);
};
