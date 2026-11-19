import { Copy, Loader2 } from "lucide-react";
import { useRouter } from "next/router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";

export type Services = {
	serverId?: string | null;
	name: string;
	type:
		| "application"
		| "compose"
		| "libsql"
		| "mariadb"
		| "mongo"
		| "mysql"
		| "postgres"
		| "redis";
	description?: string | null;
	id: string;
	createdAt: string;
	status?: "idle" | "running" | "done" | "error";
};

interface DuplicateProjectProps {
	environmentId: string;
	services: Services[];
	selectedServiceIds: string[];
}

export const DuplicateProject = ({
	environmentId,
	services,
	selectedServiceIds,
}: DuplicateProjectProps) => {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [duplicateType, setDuplicateType] = useState("new-project"); // "new-project" or "existing-environment"
	const [selectedTargetProject, setSelectedTargetProject] =
		useState<string>("");
	const [selectedTargetEnvironment, setSelectedTargetEnvironment] =
		useState<string>("");
	const utils = api.useUtils();
	const router = useRouter();

	// Queries for project and environment selection
	const { data: allProjects } = api.project.all.useQuery();
	const { data: selectedProjectEnvironments } =
		api.environment.byProjectId.useQuery(
			{ projectId: selectedTargetProject },
			{ enabled: !!selectedTargetProject },
		);

	const selectedServices = services.filter((service) =>
		selectedServiceIds.includes(service.id),
	);

	const { mutateAsync: duplicateProject, isPending } =
		api.project.duplicate.useMutation({
			onSuccess: async (newProject) => {
				await utils.project.all.invalidate();

				// If duplicating to same project+environment, invalidate the environment query
				// to refresh the services list
				if (duplicateType === "existing-environment") {
					await utils.environment.one.invalidate({
						environmentId: selectedTargetEnvironment,
					});
					await utils.environment.byProjectId.invalidate({
						projectId: selectedTargetProject,
					});

					// If duplicating to the same environment we're currently viewing,
					// also invalidate the current environment to refresh the services list
					if (selectedTargetEnvironment === environmentId) {
						await utils.environment.one.invalidate({ environmentId });
						// Also invalidate the project query to refresh the project data
						const projectId = router.query.projectId as string;
						if (projectId) {
							await utils.project.one.invalidate({ projectId });
						}
					}
				}

				toast.success(
					duplicateType === "new-project"
						? t("project.duplicate.projectSuccess")
						: t("project.duplicate.servicesSuccess"),
				);
				setOpen(false);
				if (duplicateType === "new-project") {
					router.push(
						`/dashboard/project/${newProject?.projectId}/environment/${newProject?.environmentId}`,
					);
				}
			},
			onError: (error) => {
				toast.error(error.message);
			},
		});

	const handleDuplicate = async () => {
		if (duplicateType === "new-project" && !name) {
			toast.error(t("project.duplicate.nameRequired"));
			return;
		}

		if (duplicateType === "existing-environment") {
			if (!selectedTargetProject) {
				toast.error(t("project.duplicate.selectProjectRequired"));
				return;
			}
			if (!selectedTargetEnvironment) {
				toast.error(t("project.duplicate.selectEnvironmentRequired"));
				return;
			}
		}

		// TODO: Update duplicate API to support targetProjectId and targetEnvironmentId
		await duplicateProject({
			sourceEnvironmentId: selectedTargetEnvironment,
			name,
			description,
			includeServices: true,
			selectedServices: selectedServices.map((service) => ({
				id: service.id,
				type: service.type,
			})),
			duplicateInSameProject: duplicateType === "existing-environment",
		});
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(isOpen) => {
				setOpen(isOpen);
				if (!isOpen) {
					// Reset form when closing
					setName("");
					setDescription("");
					setDuplicateType("new-project");
					setSelectedTargetProject("");
					setSelectedTargetEnvironment("");
				}
			}}
		>
			<DialogTrigger asChild>
				<Button variant="ghost" className="w-full justify-start">
					<Copy className="mr-2 h-4 w-4" />
					{t("project.duplicate.menuLabel")}
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("project.duplicate.title")}</DialogTitle>
					<DialogDescription>
						{t("project.duplicate.description")}
					</DialogDescription>
				</DialogHeader>

				<div className="grid gap-4 py-4">
					<div className="grid gap-2">
						<Label>{t("project.duplicate.duplicateTo")}</Label>
						<RadioGroup
							value={duplicateType}
							onValueChange={(value) => {
								setDuplicateType(value);
								// Reset selections when changing type
								if (value !== "existing-environment") {
									setSelectedTargetProject("");
									setSelectedTargetEnvironment("");
								}
							}}
							className="grid gap-2"
						>
							<div className="flex items-center space-x-2">
								<RadioGroupItem value="new-project" id="new-project" />
								<Label htmlFor="new-project">
									{t("project.duplicate.newProject")}
								</Label>
							</div>
							<div className="flex items-center space-x-2">
								<RadioGroupItem
									value="existing-environment"
									id="existing-environment"
								/>
								<Label htmlFor="existing-environment">
									{t("project.duplicate.existingEnvironment")}
								</Label>
							</div>
						</RadioGroup>
					</div>

					{duplicateType === "new-project" && (
						<>
							<div className="grid gap-2">
								<Label htmlFor="name">{t("project.form.name")}</Label>
								<Input
									id="name"
									value={name}
									onChange={(e) => setName(e.target.value)}
									placeholder={t("project.duplicate.namePlaceholder")}
								/>
							</div>

							<div className="grid gap-2">
								<Label htmlFor="description">
									{t("project.form.description")}
								</Label>
								<Input
									id="description"
									value={description}
									onChange={(e) => setDescription(e.target.value)}
									placeholder={t("project.duplicate.descriptionPlaceholder")}
								/>
							</div>
						</>
					)}

					{duplicateType === "existing-environment" && (
						<>
							{allProjects?.filter((p) => p.projectId !== environmentId)
								.length === 0 ? (
								<div className="flex flex-col items-center justify-center gap-2 py-4 text-center">
									<p className="text-sm text-muted-foreground">
										{t("project.duplicate.noProjects")}
									</p>
								</div>
							) : (
								<>
									{/* Step 1: Select Project */}
									<div className="grid gap-2">
										<Label>{t("project.duplicate.targetProject")}</Label>
										<Select
											value={selectedTargetProject}
											onValueChange={(value) => {
												setSelectedTargetProject(value);
												setSelectedTargetEnvironment(""); // Reset environment when project changes
											}}
										>
											<SelectTrigger>
												<SelectValue
													placeholder={t(
														"project.duplicate.targetProjectPlaceholder",
													)}
												/>
											</SelectTrigger>
											<SelectContent>
												{allProjects
													?.filter((p) => p.projectId !== environmentId)
													.map((project) => (
														<SelectItem
															key={project.projectId}
															value={project.projectId}
														>
															{project.name}
														</SelectItem>
													))}
											</SelectContent>
										</Select>
									</div>

									{/* Step 2: Select Environment (only show if project is selected) */}
									{selectedTargetProject && (
										<div className="grid gap-2">
											<Label>{t("project.duplicate.targetEnvironment")}</Label>
											<Select
												value={selectedTargetEnvironment}
												onValueChange={setSelectedTargetEnvironment}
											>
												<SelectTrigger>
													<SelectValue
														placeholder={t(
															"project.duplicate.targetEnvironmentPlaceholder",
														)}
													/>
												</SelectTrigger>
												<SelectContent>
													{selectedProjectEnvironments?.map((env) => (
														<SelectItem
															key={env.environmentId}
															value={env.environmentId}
														>
															{env.name}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
									)}
								</>
							)}
						</>
					)}

					<div className="grid gap-2">
						<Label>{t("project.duplicate.selectedServices")}</Label>
						<div className="space-y-2 max-h-[200px] overflow-y-auto border rounded-md p-4">
							{selectedServices.map((service) => (
								<div key={service.id} className="flex items-center space-x-2">
									<span className="text-sm">
										{service.name} ({service.type})
									</span>
								</div>
							))}
						</div>
					</div>
				</div>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => setOpen(false)}
						disabled={isPending}
					>
						{t("project.form.cancel")}
					</Button>
					<Button
						onClick={handleDuplicate}
						disabled={
							isPending ||
							(duplicateType === "new-project" && !name) ||
							(duplicateType === "existing-environment" &&
								(!selectedTargetProject || !selectedTargetEnvironment))
						}
					>
						{isPending ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								{duplicateType === "new-project"
									? t("project.duplicate.duplicatingProject")
									: t("project.duplicate.duplicatingEnvironment")}
							</>
						) : duplicateType === "new-project" ? (
							t("project.duplicate.toProject")
						) : (
							t("project.duplicate.toEnvironment")
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
