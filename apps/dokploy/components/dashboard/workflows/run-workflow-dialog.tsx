import type { inferRouterOutputs } from "@trpc/server";
import { Play } from "lucide-react";
import { useRouter } from "next/router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { AppRouter } from "@/server/api/root";
import { api } from "@/utils/api";

type Workflow = inferRouterOutputs<AppRouter>["workflow"]["workflows"][number];

interface Props {
	workflow: Workflow;
	githubId: string;
	owner: string;
	repository: string;
	defaultBranch: string;
	disabled?: boolean;
}

export const RunWorkflowDialog = ({
	workflow,
	githubId,
	owner,
	repository,
	defaultBranch,
	disabled,
}: Props) => {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [branch, setBranch] = useState(defaultBranch);
	const [targetJob, setTargetJob] = useState("all");
	const [inputs, setInputs] = useState<Record<string, string>>({});

	const { data: branches } = api.github.getGithubBranches.useQuery(
		{ githubId, owner, repo: repository },
		{ enabled: open },
	);
	const { mutateAsync, isPending } = api.workflow.dispatch.useMutation();

	const missingRequired = workflow.dispatchInputs.some(
		(input) =>
			input.required && !(inputs[input.name] ?? input.default ?? "").trim(),
	);

	const onSubmit = async () => {
		const values = Object.fromEntries(
			workflow.dispatchInputs.map((input) => [
				input.name,
				inputs[input.name] ?? input.default ?? "",
			]),
		);
		await mutateAsync({
			workflowId: workflow.workflowId,
			branch,
			inputs: values,
			targetJob: targetJob === "all" ? undefined : targetJob,
		})
			.then(async (run) => {
				toast.success("Run queued");
				setOpen(false);
				await router.push(`/dashboard/workflows/runs/${run.workflowRunId}`);
			})
			.catch((error) => {
				toast.error("Error running the workflow", {
					description: error.message,
				});
			});
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm" disabled={disabled}>
					<Play className="size-4" /> Run
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Run {workflow.name}</DialogTitle>
					<DialogDescription>
						Runs <code>{workflow.path}</code> as a{" "}
						<code>workflow_dispatch</code> event on the latest commit of the
						branch.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<Label>Branch</Label>
						<Select value={branch} onValueChange={setBranch}>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{(branches ?? [{ name: defaultBranch }]).map((b) => (
									<SelectItem key={b.name} value={b.name}>
										{b.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{workflow.jobs.length > 1 && (
						<div className="flex flex-col gap-2">
							<Label>Jobs</Label>
							<Select value={targetJob} onValueChange={setTargetJob}>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All jobs</SelectItem>
									{workflow.jobs.map((job) => (
										<SelectItem key={job.id} value={job.id}>
											{job.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}

					{workflow.dispatchInputs.map((input) => (
						<div key={input.name} className="flex flex-col gap-2">
							<Label>
								{input.name}
								{input.required && <span className="text-red-500"> *</span>}
							</Label>
							{input.options?.length ? (
								<Select
									value={inputs[input.name] ?? input.default ?? ""}
									onValueChange={(value) =>
										setInputs((prev) => ({ ...prev, [input.name]: value }))
									}
								>
									<SelectTrigger>
										<SelectValue placeholder="Select an option" />
									</SelectTrigger>
									<SelectContent>
										{input.options.map((option) => (
											<SelectItem key={option} value={option}>
												{option}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							) : input.type === "boolean" ? (
								<Select
									value={inputs[input.name] ?? input.default ?? "false"}
									onValueChange={(value) =>
										setInputs((prev) => ({ ...prev, [input.name]: value }))
									}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="true">true</SelectItem>
										<SelectItem value="false">false</SelectItem>
									</SelectContent>
								</Select>
							) : (
								<Input
									value={inputs[input.name] ?? input.default ?? ""}
									onChange={(e) =>
										setInputs((prev) => ({
											...prev,
											[input.name]: e.target.value,
										}))
									}
								/>
							)}
							{input.description && (
								<span className="text-xs text-muted-foreground">
									{input.description}
								</span>
							)}
						</div>
					))}
				</div>

				<DialogFooter>
					<Button
						isLoading={isPending}
						disabled={!branch || missingRequired}
						onClick={onSubmit}
					>
						Run workflow
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
