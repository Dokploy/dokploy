import { UpdateSSHKey } from "@/components/dashboard/settings/ssh-keys/update-ssh-key";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/utils/api";
import { formatDistanceToNow } from "date-fns";
import { KeyRound, KeyRoundIcon, PenBoxIcon } from "lucide-react";
import { AddSSHKey } from "./add-ssh-key";
import { DeleteSSHKey } from "./delete-ssh-key";

export const ShowDestinations = () => {
	const { data } = api.sshKey.all.useQuery();

	return (
		<div className="w-full">
			<Card className="h-full bg-transparent">
				<CardHeader>
					<CardTitle className="text-xl">SSH Keys</CardTitle>
					<CardDescription>
						Use SSH to be able to clone from private repositories.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-2 pt-4">
					{data?.length === 0 ? (
						<div className="flex flex-col items-center gap-3">
							<KeyRound className="size-8 self-center text-muted-foreground" />
							<span className="text-base text-muted-foreground">
								Add your first SSH Key
							</span>
							<AddSSHKey>
								<Button>
									<KeyRoundIcon className="size-4" /> Add SSH Key
								</Button>
							</AddSSHKey>
						</div>
					) : (
						<div className="space-y-8">
							<div className="flex flex-col gap-4">
								<div className="flex gap-4 text-xs px-3.5">
									<div className="col-span-2 basis-4/12">Key</div>
									<div className="basis-3/12">Added</div>
									<div>Last Used</div>
								</div>
								{data?.map((sshKey) => (
									<div
										key={sshKey.sshKeyId}
										className="flex gap-4 items-center border p-3.5 rounded-lg text-sm"
									>
										<div className="flex flex-col basis-4/12">
											<span>{sshKey.name}</span>
											{sshKey.description && (
												<span className="text-xs text-muted-foreground">
													{sshKey.description}
												</span>
											)}
										</div>
										<div className="basis-3/12">
											{formatDistanceToNow(new Date(sshKey.createdAt), {
												addSuffix: true,
											})}
										</div>
										<div className="grow">
											{sshKey.lastUsedAt
												? formatDistanceToNow(new Date(sshKey.lastUsedAt), {
														addSuffix: true,
													})
												: "Never"}
										</div>
										<div className="flex flex-row gap-1">
											<UpdateSSHKey sshKeyId={sshKey.sshKeyId}>
												<Button variant="ghost">
													<PenBoxIcon className="size-4 text-muted-foreground" />
												</Button>
											</UpdateSSHKey>
											<DeleteSSHKey sshKeyId={sshKey.sshKeyId} />
										</div>
									</div>
								))}
							</div>
							<AddSSHKey>
								<Button>
									<KeyRoundIcon className="size-4" /> Add SSH Key
								</Button>
							</AddSSHKey>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
};
