import { formatDistanceToNow } from "date-fns";
import { Clock, ExternalLinkIcon, KeyIcon, Tag, Trash2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { DialogAction } from "@/components/shared/dialog-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/utils/api";
import { AddApiKey } from "./add-api-key";

export const ShowApiKeys = () => {
	const { data, refetch } = api.user.get.useQuery();
	const { mutateAsync: deleteApiKey, isLoading: isLoadingDelete } =
		api.user.deleteApiKey.useMutation();

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar p-2.5 rounded-xl max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md">
					<CardHeader className="flex flex-row gap-2 flex-wrap justify-between items-center">
						<div>
							<CardTitle className="text-xl flex items-center gap-2">
								<KeyIcon className="size-5" />
								API/CLI Keys
							</CardTitle>
							<CardDescription>
								Generate and manage API keys to access the API/CLI
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
					<CardContent className="space-y-6">
						<div className="flex flex-col gap-4">
							{data?.user.apiKeys && data.user.apiKeys.length > 0 ? (
								data.user.apiKeys.map((apiKey) => (
									<div
										key={apiKey.id}
										className="flex flex-col gap-2 p-4 border rounded-lg"
									>
										<div className="flex justify-between items-start">
											<div className="flex flex-col gap-1">
												<span className="font-medium">{apiKey.name}</span>
												<div className="flex flex-wrap gap-2 items-center text-sm text-muted-foreground">
													<span className="flex items-center gap-1">
														<Clock className="size-3.5" />
														Created{" "}
														{formatDistanceToNow(new Date(apiKey.createdAt))}{" "}
														ago
													</span>
													{apiKey.prefix && (
														<Badge
															variant="secondary"
															className="flex items-center gap-1"
														>
															<Tag className="size-3.5" />
															{apiKey.prefix}
														</Badge>
													)}
													{apiKey.expiresAt && (
														<Badge
															variant="outline"
															className="flex items-center gap-1"
														>
															<Clock className="size-3.5" />
															Expires in{" "}
															{formatDistanceToNow(
																new Date(apiKey.expiresAt),
															)}{" "}
														</Badge>
													)}
												</div>
											</div>
											<DialogAction
												title="Delete API Key"
												description="Are you sure you want to delete this API key? This action cannot be undone."
												type="destructive"
												onClick={async () => {
													try {
														await deleteApiKey({
															apiKeyId: apiKey.id,
														});
														await refetch();
														toast.success("API key deleted successfully");
													} catch (error) {
														toast.error(
															error instanceof Error
																? error.message
																: "Error deleting API key",
														);
													}
												}}
											>
												<Button
													variant="ghost"
													size="icon"
													isLoading={isLoadingDelete}
												>
													<Trash2 className="size-4" />
												</Button>
											</DialogAction>
										</div>
									</div>
								))
							) : (
								<div className="flex flex-col items-center gap-3 py-6">
									<KeyIcon className="size-8 text-muted-foreground" />
									<span className="text-base text-muted-foreground">
										No API keys found
									</span>
								</div>
							)}
						</div>

						{/* Generate new API key */}
						<div className="flex justify-end pt-4 border-t">
							<AddApiKey />
						</div>
					</CardContent>
				</div>
			</Card>
		</div>
	);
};
