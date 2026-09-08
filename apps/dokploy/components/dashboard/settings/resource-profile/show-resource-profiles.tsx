import { Layers, Loader2, Trash2 } from "lucide-react";
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
import { HandleResourceGroup } from "./handle-resource-group";
import { HandleResourceProfile } from "./handle-resource-profile";

const formatMemory = (value: string | null): string => {
	if (!value) return "-";
	const bytes = Number.parseInt(value, 10);
	if (!bytes) return value;
	return bytes >= 1024 * 1024 * 1024
		? `${(bytes / (1024 * 1024 * 1024)).toFixed(2).replace(/\.?0+$/, "")} GB`
		: `${(bytes / (1024 * 1024)).toFixed(2).replace(/\.?0+$/, "")} MB`;
};

const formatCpu = (value: string | null): string => {
	if (!value) return "-";
	const nano = Number.parseInt(value, 10);
	if (!nano) return value;
	return `${(nano / 1_000_000_000).toFixed(2).replace(/\.?0+$/, "")} CPU`;
};

interface ProfileRowProps {
	profile: {
		profileId: string;
		name: string;
		memoryReservation: string | null;
		memoryLimit: string | null;
		cpuReservation: string | null;
		cpuLimit: string | null;
		usageCount: number;
	};
	groupId: string;
}

const ProfileRow = ({ profile, groupId }: ProfileRowProps) => {
	const utils = api.useUtils();
	const { mutateAsync, isPending } =
		api.resourceProfile.removeProfile.useMutation();

	return (
		<div className="flex items-center justify-between gap-4 p-3 rounded-lg border bg-sidebar">
			<div className="flex flex-col gap-1 min-w-0">
				<div className="flex items-center gap-2">
					<span className="text-sm font-medium">{profile.name}</span>
					<Badge variant={profile.usageCount > 0 ? "default" : "secondary"}>
						{profile.usageCount === 0
							? "Unused"
							: `${profile.usageCount} service${profile.usageCount > 1 ? "s" : ""}`}
					</Badge>
				</div>
				<span className="text-xs text-muted-foreground truncate">
					Memory Limit: {formatMemory(profile.memoryLimit)} · Memory
					Reservation: {formatMemory(profile.memoryReservation)} · CPU Limit:{" "}
					{formatCpu(profile.cpuLimit)} · CPU Reservation:{" "}
					{formatCpu(profile.cpuReservation)}
				</span>
			</div>
			<div className="flex items-center gap-1 shrink-0">
				<HandleResourceProfile
					groupId={groupId}
					profileId={profile.profileId}
				/>
				<DialogAction
					title="Delete Resource Profile"
					description={`Are you sure you want to delete the profile "${profile.name}"? Profiles assigned to services cannot be deleted.`}
					type="destructive"
					onClick={async () => {
						await mutateAsync({ profileId: profile.profileId })
							.then(() => {
								toast.success("Profile deleted successfully");
								utils.resourceProfile.all.invalidate();
							})
							.catch((error) => {
								toast.error(error?.message || "Error deleting the profile");
							});
					}}
				>
					<Button
						variant="ghost"
						size="icon"
						className="group hover:bg-red-500/10"
						isLoading={isPending}
					>
						<Trash2 className="size-4 text-primary group-hover:text-red-500" />
					</Button>
				</DialogAction>
			</div>
		</div>
	);
};

export const ShowResourceProfiles = () => {
	const { data, isPending, refetch } = api.resourceProfile.all.useQuery();
	const { mutateAsync, isPending: isRemoving } =
		api.resourceProfile.removeGroup.useMutation();

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar p-2.5 rounded-xl max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md">
					<CardHeader>
						<CardTitle className="text-xl flex flex-row gap-2">
							<Layers className="size-6 text-muted-foreground self-center" />
							Resource Profiles
						</CardTitle>
						<CardDescription>
							Create groups of named resource profiles (for example one group
							per server tier) and reuse them across your applications,
							databases and compose services. Editing a profile updates the
							effective resources of every linked service on the next deploy.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4 py-8 border-t">
						{isPending ? (
							<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[25vh]">
								<span>Loading...</span>
								<Loader2 className="animate-spin size-4" />
							</div>
						) : !data || data.length === 0 ? (
							<div className="flex flex-col items-center gap-3 min-h-[25vh] justify-center">
								<Layers className="size-8 self-center text-muted-foreground" />
								<span className="text-base text-muted-foreground">
									Create a group to start organizing your resource profiles.
								</span>
								<HandleResourceGroup />
							</div>
						) : (
							<div className="flex flex-col gap-6">
								{data.map((group) => (
									<div
										key={group.groupId}
										className="flex flex-col gap-3 p-4 rounded-lg border"
									>
										<div className="flex items-start justify-between gap-4">
											<div className="flex flex-col gap-1">
												<span className="text-base font-semibold">
													{group.name}
												</span>
												{group.description && (
													<span className="text-xs text-muted-foreground">
														{group.description}
													</span>
												)}
											</div>
											<div className="flex items-center gap-1">
												<HandleResourceGroup groupId={group.groupId} />
												<DialogAction
													title="Delete Resource Group"
													description={`Are you sure you want to delete the group "${group.name}" and all its profiles? Groups whose profiles are still in use cannot be deleted.`}
													type="destructive"
													onClick={async () => {
														await mutateAsync({ groupId: group.groupId })
															.then(() => {
																toast.success("Group deleted successfully");
																refetch();
															})
															.catch((error) => {
																toast.error(
																	error?.message || "Error deleting the group",
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
										<div className="flex flex-col gap-2">
											{group.profiles.length === 0 ? (
												<span className="text-xs text-muted-foreground">
													No profiles in this group yet.
												</span>
											) : (
												group.profiles.map((profile) => (
													<ProfileRow
														key={profile.profileId}
														profile={profile}
														groupId={group.groupId}
													/>
												))
											)}
										</div>
										<div className="flex justify-end">
											<HandleResourceProfile groupId={group.groupId} />
										</div>
									</div>
								))}
								<div className="flex justify-end">
									<HandleResourceGroup />
								</div>
							</div>
						)}
					</CardContent>
				</div>
			</Card>
		</div>
	);
};
