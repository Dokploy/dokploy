import { CheckIcon, ChevronsUpDown, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
} from "@/components/ui/command";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";

export const ImportWorkflowRepository = () => {
	const router = useRouter();
	const utils = api.useUtils();
	const [open, setOpen] = useState(false);
	const [githubId, setGithubId] = useState("");
	const [repository, setRepository] = useState<{
		owner: string;
		repo: string;
	} | null>(null);
	const [serverId, setServerId] = useState("");

	const { data: githubProviders } = api.github.githubProviders.useQuery(
		undefined,
		{ enabled: open },
	);
	const { data: workflowServers } = api.server.workflowServers.useQuery(
		undefined,
		{ enabled: open },
	);
	const { data: repositories, isPending: isLoadingRepositories } =
		api.github.getGithubRepositories.useQuery(
			{ githubId },
			{ enabled: open && !!githubId },
		);

	const { mutateAsync, isPending } =
		api.workflow.importRepository.useMutation();

	const reset = () => {
		setGithubId("");
		setRepository(null);
		setServerId("");
	};

	const onSubmit = async () => {
		if (!repository) return;
		await mutateAsync({
			githubId,
			owner: repository.owner,
			repository: repository.repo,
			serverId: serverId || null,
		})
			.then(async (result) => {
				toast.success("Repository imported");
				await utils.workflow.repositories.invalidate();
				setOpen(false);
				reset();
				await router.push(
					`/dashboard/workflows/${result.workflowRepositoryId}`,
				);
			})
			.catch((error) => {
				toast.error("Error importing the repository", {
					description: error.message,
				});
			});
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(value) => {
				setOpen(value);
				if (!value) reset();
			}}
		>
			<DialogTrigger asChild>
				<Button>
					<Plus className="size-4" /> Import Repository
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Import repository</DialogTitle>
					<DialogDescription>
						Run the workflows of a GitHub repository on one of your workflow
						servers.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<Label>GitHub account</Label>
						<Select
							value={githubId}
							onValueChange={(value) => {
								setGithubId(value);
								setRepository(null);
							}}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select a GitHub account" />
							</SelectTrigger>
							<SelectContent>
								{githubProviders?.map((provider) => (
									<SelectItem key={provider.githubId} value={provider.githubId}>
										{provider.gitProvider.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						{githubProviders?.length === 0 && (
							<span className="text-sm text-muted-foreground">
								No GitHub providers yet.{" "}
								<Link
									href="/dashboard/settings/git-providers"
									className="text-primary"
								>
									Add one
								</Link>
							</span>
						)}
					</div>

					<div className="flex flex-col gap-2">
						<Label>Repository</Label>
						<Popover>
							<PopoverTrigger asChild>
								<Button
									variant="outline"
									disabled={!githubId}
									className={cn(
										"w-full justify-between",
										!repository && "text-muted-foreground",
									)}
								>
									{repository
										? `${repository.owner}/${repository.repo}`
										: "Select repository"}
									<ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
								</Button>
							</PopoverTrigger>
							<PopoverContent
								className="w-[var(--radix-popover-trigger-width)] p-0"
								align="start"
							>
								<Command>
									<CommandInput
										placeholder="Search repository..."
										className="h-9"
									/>
									{isLoadingRepositories && (
										<span className="py-6 text-center text-sm">
											Loading repositories...
										</span>
									)}
									<CommandEmpty>No repositories found.</CommandEmpty>
									<ScrollArea className="h-80">
										<CommandGroup>
											{repositories?.map((repo) => (
												<CommandItem
													key={repo.id}
													value={`${repo.owner.login}/${repo.name}`}
													onSelect={() =>
														setRepository({
															owner: repo.owner.login,
															repo: repo.name,
														})
													}
												>
													<span className="truncate">
														{repo.owner.login}/{repo.name}
													</span>
													<CheckIcon
														className={cn(
															"ml-auto size-4",
															repository?.owner === repo.owner.login &&
																repository?.repo === repo.name
																? "opacity-100"
																: "opacity-0",
														)}
													/>
												</CommandItem>
											))}
										</CommandGroup>
									</ScrollArea>
								</Command>
							</PopoverContent>
						</Popover>
					</div>

					<div className="flex flex-col gap-2">
						<Label>Workflow server</Label>
						<Select value={serverId} onValueChange={setServerId}>
							<SelectTrigger>
								<SelectValue placeholder="Select a workflow server" />
							</SelectTrigger>
							<SelectContent>
								{workflowServers?.map((server) => (
									<SelectItem key={server.serverId} value={server.serverId}>
										{server.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						{workflowServers?.length === 0 && (
							<AlertBlock type="warning">
								You don't have workflow servers yet. Add a remote server with
								the type <b>Workflow Server</b> in{" "}
								<Link href="/dashboard/settings/servers" className="underline">
									Remote Servers
								</Link>
								. You can import the repository now and pick the server later.
							</AlertBlock>
						)}
					</div>
				</div>

				<DialogFooter>
					<Button
						isLoading={isPending}
						disabled={!githubId || !repository}
						onClick={onSubmit}
					>
						Import
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
