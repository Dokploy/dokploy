import { Loader2, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/utils/api";
import { parseRepositoryPath } from "./repository-path";

type GitProvider = "github" | "gitlab" | "bitbucket" | "gitea";

export interface RepositoryLookupResult {
	id: number | string;
	name: string;
	owner: string;
	path: string;
	slug?: string;
	url: string;
}

interface Props {
	provider: GitProvider;
	providerId: string;
	onSelect: (repository: RepositoryLookupResult) => void;
}

export const RepositoryDirectLookup = ({
	provider,
	providerId,
	onSelect,
}: Props) => {
	const utils = api.useUtils();
	const [value, setValue] = useState("");
	const [isLoading, setIsLoading] = useState(false);

	const lookup = async () => {
		const parsed = parseRepositoryPath(value);
		if (!parsed) {
			toast.error("Enter a repository as owner/repository");
			return;
		}

		if (!providerId) {
			toast.error("Select a Git account first");
			return;
		}

		setIsLoading(true);
		try {
			let repository: RepositoryLookupResult;
			switch (provider) {
				case "github":
					repository = await utils.github.getGithubRepository.fetch({
						githubId: providerId,
						...parsed,
					});
					break;
				case "gitlab":
					repository = await utils.gitlab.getGitlabRepository.fetch({
						gitlabId: providerId,
						...parsed,
					});
					break;
				case "bitbucket":
					repository = await utils.bitbucket.getBitbucketRepository.fetch({
						bitbucketId: providerId,
						...parsed,
					});
					break;
				case "gitea":
					repository = await utils.gitea.getGiteaRepository.fetch({
						giteaId: providerId,
						...parsed,
					});
					break;
			}

			onSelect(repository);
			setValue(repository.path);
			toast.success(`Found ${repository.path}`);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Repository lookup failed",
			);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="space-y-2 rounded-md border bg-muted/30 p-3">
			<div>
				<p className="text-sm font-medium">Open repository directly</p>
				<p className="text-xs text-muted-foreground">
					Skip loading the full repository list by entering its path or URL.
				</p>
			</div>
			<div className="flex gap-2">
				<Input
					value={value}
					onChange={(event) => setValue(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							void lookup();
						}
					}}
					placeholder="owner/repository"
					disabled={!providerId || isLoading}
					aria-label="Repository path or URL"
				/>
				<Button
					type="button"
					variant="secondary"
					onClick={() => void lookup()}
					disabled={!providerId || isLoading}
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
