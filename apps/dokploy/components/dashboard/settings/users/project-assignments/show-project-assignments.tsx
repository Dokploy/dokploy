import { Folder, Loader2, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { SERVICE_TYPE_OPTIONS } from "@/components/shared/service-type-icon";
import { toPickerUser, UserPicker } from "@/components/shared/user-picker";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { matchesSearch } from "@/lib/utils";
import { ResourceActions } from "./resource-actions";
import {
	emptySelection,
	filterTree,
	ResourceTree,
	type Selection,
	useProjectTree,
} from "./resource-tree";

const ASSIGNEE_FILTERS = [
	{ value: "all", label: "All users" },
	{ value: "removed", label: "Removed users" },
	{ value: "unassigned", label: "Unassigned" },
];

const STATUS_FILTERS: Record<string, string[]> = {
	running: ["running", "done"],
	stopped: ["idle"],
	error: ["error"],
};

export const ShowProjectAssignments = () => {
	const { projects, assigneeNames, members, isPending } = useProjectTree();
	const [search, setSearch] = useState("");
	const [assignee, setAssignee] = useState("all");
	const [status, setStatus] = useState("all");
	const [type, setType] = useState("all");
	const [selection, setSelection] = useState<Selection>(emptySelection);

	const visible = useMemo(() => {
		const byAssignee = (assignedTo: string | null | undefined) => {
			if (assignee === "all") return true;
			if (assignee === "unassigned") return !assignedTo;
			if (assignee === "removed") {
				return !!assignedTo && !assigneeNames.has(assignedTo);
			}
			return assignedTo === assignee;
		};
		// Status and type only describe services, so with either one set,
		// projects and environments are shown only as containers.
		const serviceFiltersOnly = status !== "all" || type !== "all";
		return filterTree(projects, {
			project: (project) =>
				!serviceFiltersOnly &&
				matchesSearch(search, project.name) &&
				byAssignee(project.assignedTo),
			environment: (environment, project) =>
				!serviceFiltersOnly &&
				matchesSearch(search, project.name, environment.name) &&
				byAssignee(environment.assignedTo),
			service: (service, environment, project) =>
				matchesSearch(search, project.name, environment.name, service.name) &&
				byAssignee(service.assignedTo) &&
				(status === "all" ||
					(STATUS_FILTERS[status] ?? []).includes(service.status ?? "idle")) &&
				(type === "all" || service.type === type),
		});
	}, [projects, assigneeNames, search, assignee, status, type]);
	const isFiltering =
		search.trim() !== "" ||
		assignee !== "all" ||
		status !== "all" ||
		type !== "all";

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar p-2.5 rounded-xl max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md">
					<CardHeader>
						<CardTitle className="text-xl flex flex-row gap-2">
							<Folder className="size-6 text-muted-foreground self-center" />
							Project Assignments
						</CardTitle>
						<CardDescription>
							Every project, environment and service in this organization, and
							the user it is assigned to. New items are assigned to whoever
							creates them. Select items to reassign them, or start, stop or
							delete them.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4 py-8 border-t">
						{isPending ? (
							<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[25vh]">
								<span>Loading...</span>
								<Loader2 className="animate-spin size-4" />
							</div>
						) : (
							<>
								<div className="flex flex-col gap-2 lg:flex-row">
									<div className="relative flex-1">
										<Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
										<Input
											placeholder="Search projects, environments and services..."
											value={search}
											onChange={(event) => setSearch(event.target.value)}
											className="pl-9"
										/>
									</div>
									<UserPicker
										users={members.map(toPickerUser)}
										value={assignee}
										onChange={setAssignee}
										placeholder="All users"
										options={ASSIGNEE_FILTERS}
										className="lg:w-56"
									/>
									<Select value={status} onValueChange={setStatus}>
										<SelectTrigger className="lg:w-36">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">Any status</SelectItem>
											<SelectItem value="running">Running</SelectItem>
											<SelectItem value="stopped">Stopped</SelectItem>
											<SelectItem value="error">Error</SelectItem>
										</SelectContent>
									</Select>
									<Select value={type} onValueChange={setType}>
										<SelectTrigger className="lg:w-40">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">Any type</SelectItem>
											{SERVICE_TYPE_OPTIONS.map((option) => (
												<SelectItem key={option.value} value={option.value}>
													{option.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								<ResourceActions
									projects={projects}
									members={members}
									selection={selection}
									onDone={() => setSelection(emptySelection())}
								/>
								{visible.length === 0 ? (
									<div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
										Nothing matches the current filters
									</div>
								) : (
									<ResourceTree
										projects={visible}
										assigneeNames={assigneeNames}
										selection={selection}
										onSelectionChange={setSelection}
										expandAll={isFiltering}
									/>
								)}
							</>
						)}
					</CardContent>
				</div>
			</Card>
		</div>
	);
};
