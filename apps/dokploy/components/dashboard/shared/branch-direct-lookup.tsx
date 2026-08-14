import { Loader2, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/utils/api";

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
	const [isLoading, setIsLoading] = useState(false);
	const canLookup =
		!!providerId &&
		!!repository &&
		(provider === "gitlab" ? !!projectId : !!owner);

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

		setIsLoading(true);
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

			onSelect(result.name);
			setBranch(result.name);
			toast.success(`Found branch ${result.name}`);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Branch lookup failed",
			);
		} finally {
			setIsLoading(false);
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
