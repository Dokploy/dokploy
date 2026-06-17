import { KeyRound, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DialogAction } from "@/components/shared/dialog-action";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/utils/api";
import { HandleTrustPolicy } from "./handle-trust-policy";

export const ShowTrustPolicies = () => {
	const { mutateAsync, isPending: isRemoving } =
		api.trustPolicy.remove.useMutation();
	const { data, isPending, refetch } = api.trustPolicy.all.useQuery();

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar p-2.5 rounded-xl max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md">
					<CardHeader>
						<CardTitle className="text-xl flex flex-row gap-2">
							<ShieldCheck className="size-6 text-muted-foreground self-center" />
							Trust Policies
						</CardTitle>
						<CardDescription>
							Manage cosign verification policies for admitted images
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2 py-8 border-t">
						{isPending ? (
							<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[25vh]">
								<span>Loading...</span>
								<Loader2 className="animate-spin size-4" />
							</div>
						) : (
							<>
								{data?.length === 0 ? (
									<div className="flex flex-col items-center gap-3 min-h-[25vh] justify-center">
										<ShieldCheck className="size-8 self-center text-muted-foreground" />
										<span className="text-base text-muted-foreground text-center">
											No trust policies configured
										</span>
										<HandleTrustPolicy />
									</div>
								) : (
									<div className="flex flex-col gap-4 min-h-[25vh]">
										<div className="flex flex-col gap-4 rounded-lg">
											{data?.map((policy, index) => (
												<div
													key={policy.trustPolicyId}
													className="flex items-center justify-between bg-sidebar p-1 w-full rounded-lg"
												>
													<div className="flex items-center justify-between p-3.5 rounded-lg bg-background border w-full">
														<div className="flex items-center justify-between">
															<div className="flex gap-2 flex-col">
																<span className="text-sm font-medium">
																	{index + 1}. {policy.name}
																</span>
																<div className="flex flex-row gap-2 items-center">
																	<span className="text-xs text-muted-foreground capitalize bg-sidebar px-2 py-0.5 rounded">
																		{policy.mode}
																	</span>
																	<span className="text-xs text-muted-foreground">
																		{policy.mode === "keyed" ? (
																			<span className="flex items-center gap-1">
																				<KeyRound className="size-3" />
																				{policy.publicKey
																					? `Key: ${policy.publicKey.slice(0, 40)}…`
																					: "No public key"}
																			</span>
																		) : (
																			<span>
																				{policy.certificateIdentityRegexp
																					? `Identity: ${policy.certificateIdentityRegexp}`
																					: "No identity regexp"}
																				{policy.certificateOidcIssuer && (
																					<>
																						{" "}
																						· Issuer:{" "}
																						{policy.certificateOidcIssuer}
																					</>
																				)}
																			</span>
																		)}
																	</span>
																</div>
															</div>
														</div>

														<div className="flex flex-row gap-1">
															<HandleTrustPolicy
																trustPolicyId={policy.trustPolicyId}
															/>

															<DialogAction
																title="Delete Trust Policy"
																description="Are you sure you want to delete this trust policy?"
																type="destructive"
																onClick={async () => {
																	await mutateAsync({
																		trustPolicyId: policy.trustPolicyId,
																	})
																		.then(() => {
																			toast.success(
																				"Trust policy deleted successfully",
																			);
																			refetch();
																		})
																		.catch(() => {
																			toast.error(
																				"Error deleting trust policy",
																			);
																		});
																}}
															>
																<Button
																	variant="ghost"
																	size="icon"
																	className="group hover:bg-red-500/10"
																	isLoading={isRemoving}
																>
																	<Trash2 className="size-4 text-primary group-hover:text-red-500" />
																</Button>
															</DialogAction>
														</div>
													</div>
												</div>
											))}
										</div>

										<div className="flex flex-row gap-2 flex-wrap w-full justify-end mr-4">
											<HandleTrustPolicy />
										</div>
									</div>
								)}
							</>
						)}
					</CardContent>
				</div>
			</Card>
		</div>
	);
};
