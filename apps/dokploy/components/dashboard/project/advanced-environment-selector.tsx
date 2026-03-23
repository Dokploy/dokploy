import type { findEnvironmentsByProjectId } from "@dokploy/server";
import { ChevronDownIcon, PencilIcon, PlusIcon, TrashIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/router";
import { useState } from "react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/utils/api";

type Environment = Awaited<
	ReturnType<typeof findEnvironmentsByProjectId>
>[number];
interface AdvancedEnvironmentSelectorProps {
	projectId: string;
	currentEnvironmentId?: string;
}

export const AdvancedEnvironmentSelector = ({
	projectId,
	currentEnvironmentId,
}: AdvancedEnvironmentSelectorProps) => {
	const t = useTranslations("advancedEnvironmentSelector");
	const router = useRouter();
	const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
	const [selectedEnvironment, setSelectedEnvironment] =
		useState<Environment | null>(null);

	const { data: environments } = api.environment.byProjectId.useQuery(
		{ projectId: projectId },
		{
			enabled: !!projectId,
		},
	);

	const [name, setName] = useState("");
	const [description, setDescription] = useState("");

	const { data: permissions } = api.user.getPermissions.useQuery();

	const canCreateEnvironments = !!permissions?.environment.create;
	const canDeleteEnvironments = !!permissions?.environment.delete;

	const haveServices =
		selectedEnvironment &&
		((selectedEnvironment?.mariadb?.length || 0) > 0 ||
			(selectedEnvironment?.mongo?.length || 0) > 0 ||
			(selectedEnvironment?.mysql?.length || 0) > 0 ||
			(selectedEnvironment?.postgres?.length || 0) > 0 ||
			(selectedEnvironment?.redis?.length || 0) > 0 ||
			(selectedEnvironment?.applications?.length || 0) > 0 ||
			(selectedEnvironment?.compose?.length || 0) > 0);
	const createEnvironment = api.environment.create.useMutation();
	const updateEnvironment = api.environment.update.useMutation();
	const deleteEnvironment = api.environment.remove.useMutation();
	const duplicateEnvironment = api.environment.duplicate.useMutation();

	const utils = api.useUtils();

	const handleCreateEnvironment = async () => {
		try {
			await createEnvironment.mutateAsync({
				projectId,
				name: name.trim(),
				description: description.trim() || undefined,
			});

			toast.success(t("createdSuccess"));
			utils.environment.byProjectId.invalidate({ projectId });
			utils.project.all.invalidate();
			setIsCreateDialogOpen(false);
			setName("");
			setDescription("");
		} catch (error) {
			toast.error(
				`${t("createFailed")} ${error instanceof Error ? error.message : error}`,
			);
		}
	};

	const handleUpdateEnvironment = async () => {
		if (!selectedEnvironment) return;

		try {
			await updateEnvironment.mutateAsync({
				environmentId: selectedEnvironment.environmentId,
				name: name.trim(),
				description: description.trim() || undefined,
			});

			toast.success(t("updatedSuccess"));
			utils.environment.byProjectId.invalidate({ projectId });
			setIsEditDialogOpen(false);
			setSelectedEnvironment(null);
			setName("");
			setDescription("");
		} catch (error) {
			toast.error(
				`${t("updateFailed")} ${error instanceof Error ? error.message : error}`,
			);
		}
	};

	const handleDeleteEnvironment = async () => {
		if (!selectedEnvironment) return;

		try {
			await deleteEnvironment.mutateAsync({
				environmentId: selectedEnvironment.environmentId,
			});

			toast.success(t("deletedSuccess"));
			utils.environment.byProjectId.invalidate({ projectId });
			setIsDeleteDialogOpen(false);
			setSelectedEnvironment(null);

			if (selectedEnvironment.environmentId === currentEnvironmentId) {
				const firstEnv = environments?.find(
					(env) => env.environmentId !== selectedEnvironment.environmentId,
				);
				if (firstEnv) {
					router.push(
						`/dashboard/project/${projectId}/environment/${firstEnv.environmentId}`,
					);
				} else {
					router.push(`/dashboard/project/${projectId}`);
				}
			}
		} catch (error) {
			toast.error(t("deleteFailed"));
		}
	};

	const handleDuplicateEnvironment = async (environment: Environment) => {
		try {
			const result = await duplicateEnvironment.mutateAsync({
				environmentId: environment.environmentId,
				name: `${environment.name}-copy`,
				description: environment.description || undefined,
			});

			toast.success(t("duplicatedSuccess"));
			utils.project.one.invalidate({ projectId });

			router.push(
				`/dashboard/project/${projectId}/environment/${result.environmentId}`,
			);
		} catch (error) {
			toast.error(t("duplicateFailed"));
		}
	};

	const openEditDialog = (environment: Environment) => {
		setSelectedEnvironment(environment);
		setName(environment.name);
		setDescription(environment.description || "");
		setIsEditDialogOpen(true);
	};

	const openDeleteDialog = (environment: Environment) => {
		setSelectedEnvironment(environment);
		setIsDeleteDialogOpen(true);
	};

	const currentEnv = environments?.find(
		(env) => env.environmentId === currentEnvironmentId,
	);

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="ghost" className="h-auto p-2 font-normal">
						<div className="flex items-center gap-1">
							<span className="text-muted-foreground">/</span>
							<span>{currentEnv?.name || t("selectEnvironment")}</span>
							<ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
						</div>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent className="w-[300px]" align="start">
					<DropdownMenuLabel>{t("environments")}</DropdownMenuLabel>
					<DropdownMenuSeparator />

					{environments?.map((environment) => {
						const servicesCount =
							environment.mariadb.length +
							environment.mongo.length +
							environment.mysql.length +
							environment.postgres.length +
							environment.redis.length +
							environment.applications.length +
							environment.compose.length;
						return (
							<div
								key={environment.environmentId}
								className="flex items-center"
							>
								<DropdownMenuItem
									className="flex-1 cursor-pointer"
									onClick={() => {
										router.push(
											`/dashboard/project/${projectId}/environment/${environment.environmentId}`,
										);
									}}
								>
									<div className="flex items-center justify-between w-full">
										<span>
											{environment.name} ({servicesCount})
										</span>
										{environment.environmentId === currentEnvironmentId && (
											<div className="w-2 h-2 bg-blue-500 rounded-full" />
										)}
									</div>
								</DropdownMenuItem>
								<div className="flex items-center gap-1 px-2">
									{!environment.isDefault && (
										<Button
											variant="ghost"
											size="sm"
											className="h-6 w-6 p-0"
											onClick={(e) => {
												e.stopPropagation();
												openEditDialog(environment);
											}}
										>
											<PencilIcon className="h-3 w-3" />
										</Button>
									)}
									{canDeleteEnvironments && !environment.isDefault && (
										<Button
											variant="ghost"
											size="sm"
											className="h-6 w-6 p-0 text-red-600 hover:text-red-700"
											onClick={(e) => {
												e.stopPropagation();
												openDeleteDialog(environment);
											}}
										>
											<TrashIcon className="h-3 w-3" />
										</Button>
									)}
								</div>
							</div>
						);
					})}

					<DropdownMenuSeparator />
					{canCreateEnvironments && (
						<DropdownMenuItem
							className="cursor-pointer"
							onClick={() => setIsCreateDialogOpen(true)}
						>
							<PlusIcon className="h-4 w-4 mr-2" />
							{t("createEnvironment")}
						</DropdownMenuItem>
					)}
				</DropdownMenuContent>
			</DropdownMenu>

			<Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t("createTitle")}</DialogTitle>
						<DialogDescription>
							{t("createDescription")}
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-4">
						<div className="space-y-1">
							<Label htmlFor="name">{t("nameLabel")}</Label>
							<Input
								id="name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder={t("namePlaceholder")}
							/>
						</div>
						<div className="space-y-1">
							<Label htmlFor="description">{t("descriptionLabel")}</Label>
							<Textarea
								id="description"
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								placeholder={t("descriptionPlaceholder")}
							/>
						</div>
					</div>

					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setIsCreateDialogOpen(false);
								setName("");
								setDescription("");
							}}
						>
							{t("cancel")}
						</Button>
						<Button
							onClick={handleCreateEnvironment}
							disabled={!name.trim() || createEnvironment.isPending}
						>
							{createEnvironment.isPending ? t("creating") : t("create")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t("editTitle")}</DialogTitle>
						<DialogDescription>
							{t("editDescription")}
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-4">
						<div className="space-y-1">
							<Label htmlFor="edit-name">{t("nameLabel")}</Label>
							<Input
								id="edit-name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder={t("namePlaceholder")}
							/>
						</div>
						<div className="space-y-1">
							<Label htmlFor="edit-description">{t("descriptionLabel")}</Label>
							<Textarea
								id="edit-description"
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								placeholder={t("descriptionPlaceholder")}
							/>
						</div>
					</div>

					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setIsEditDialogOpen(false);
								setSelectedEnvironment(null);
								setName("");
								setDescription("");
							}}
						>
							{t("cancel")}
						</Button>
						<Button
							onClick={handleUpdateEnvironment}
							disabled={!name.trim() || updateEnvironment.isPending}
						>
							{updateEnvironment.isPending ? t("updating") : t("update")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t("deleteTitle")}</DialogTitle>
						<DialogDescription>
							{t("deleteDescription", { name: selectedEnvironment?.name ?? "" })}
						</DialogDescription>
					</DialogHeader>

					{haveServices && (
						<AlertBlock type="warning">
							{t("hasServicesWarning")}
						</AlertBlock>
					)}

					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setIsDeleteDialogOpen(false);
								setSelectedEnvironment(null);
							}}
						>
							{t("cancel")}
						</Button>
						<Button
							variant="destructive"
							onClick={handleDeleteEnvironment}
							disabled={
								deleteEnvironment.isPending ||
								haveServices ||
								!selectedEnvironment
							}
						>
							{deleteEnvironment.isPending ? t("deleting") : t("delete")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
};
