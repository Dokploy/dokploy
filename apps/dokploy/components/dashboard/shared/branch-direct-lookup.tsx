import { Loader2, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/utils/api";
import { createLookupRequestGuard } from "./lookup-request-guard";

type GitProvider = "github" | "gitlab" | "bitbucket" | "gitea";

interface Props {
	provider: GitProvider;
	providerId: string;
	owner: string;
	repository: string;
	projectId?: number;
	onSelect: (branch: string) => void;
}

export const BranchDirectLookup = ({
	provider,
	providerId,
	owner,
	repository,
	projectId,
	onSelect,
}: Props) => {
	const utils = api.useUtils();
	const [branch, setBranch] = useState("");
	const [loadingRequest, setLoadingRequest] = useState<number | null>(null);
	const [requestGuard] = useState(createLookupRequestGuard);
	requestGuard.setContext(
		JSON.stringify([provider, providerId, owner, repository, projectId]),
	);
	const isLoading =
		loadingRequest !== null && requestGuard.isCurrent(loadingRequest);
	const canLookup =
		!!providerId &&
		!!repository &&
		(provider === "gitlab" ? !!projectId : !!owner);

	useEffect(() => () => requestGuard.cancel(), [requestGuard]);

	const lookup = async () => {
		const value = branch.trim();
		if (!canLookup) {
			toast.error("Select a repository first");
			return;
		}
		if (!value) {
			toast.error("Enter a branch name");
			return;
		}

		const request = requestGuard.begin();
		setLoadingRequest(request);
		try {
			let result: { name: string };
			switch (provider) {
				case "github":
					result = await utils.github.getGithubBranch.fetch({
						githubId: providerId,
						owner,
						repository,
						branch: value,
					});
					break;
				case "gitlab":
					result = await utils.gitlab.getGitlabBranch.fetch({
						gitlabId: providerId,
						projectId: projectId as number,
						branch: value,
					});
					break;
				case "bitbucket":
					result = await utils.bitbucket.getBitbucketBranch.fetch({
						bitbucketId: providerId,
						owner,
						repository,
						branch: value,
					});
					break;
				case "gitea":
					result = await utils.gitea.getGiteaBranch.fetch({
						giteaId: providerId,
						owner,
						repository,
						branch: value,
					});
					break;
			}

			if (!requestGuard.isCurrent(request)) return;

			onSelect(result.name);
			setBranch(result.name);
			toast.success(`Found branch ${result.name}`);
		} catch (error) {
			if (requestGuard.isCurrent(request)) {
				toast.error(
					error instanceof Error ? error.message : "Branch lookup failed",
				);
			}
		} finally {
			if (requestGuard.isCurrent(request)) {
				setLoadingRequest(null);
			}
		}
	};

	return (
		<div className="space-y-2 rounded-md border bg-muted/30 p-3">
			<div>
				<p className="text-sm font-medium">Open branch directly</p>
				<p className="text-xs text-muted-foreground">
					Skip loading every branch by entering its exact name.
				</p>
			</div>
			<div className="flex gap-2">
				<Input
					value={branch}
					onChange={(event) => setBranch(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							void lookup();
						}
					}}
					placeholder="feature/my-branch"
					disabled={!canLookup || isLoading}
					aria-label="Branch name"
				/>
				<Button
					type="button"
					variant="secondary"
					onClick={() => void lookup()}
					disabled={!canLookup || isLoading}
				>
					{isLoading ? (
						<Loader2 className="h-4 w-4 animate-spin" />
					) : (
						<Search className="h-4 w-4" />
					)}
					Find
				</Button>
			</div>
		</div>
	);
};
