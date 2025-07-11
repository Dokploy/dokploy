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
import { api } from "@/utils/api";
import { Copy, Loader2 } from "lucide-react";
import { useTranslation } from "next-i18next";
import { useRouter } from "next/router";
import { useState } from "react";
import { toast } from "sonner";

export type Services = {
	appName: string;
	serverId?: string | null;
	name: string;
	type:
		| "mariadb"
		| "application"
		| "postgres"
		| "mysql"
		| "mongo"
		| "redis"
		| "compose";
	description?: string | null;
	id: string;
	createdAt: string;
	status?: "idle" | "running" | "done" | "error";
};

interface DuplicateProjectProps {
	projectId: string;
	services: Services[];
	selectedServiceIds: string[];
}

export const DuplicateProject = ({
	projectId,
	services,
	selectedServiceIds,
}: DuplicateProjectProps) => {
	const { t } = useTranslation("dashboard");
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [duplicateType, setDuplicateType] = useState("new-project"); // "new-project" or "same-project"
	const utils = api.useUtils();
	const router = useRouter();

	const selectedServices = services.filter((service) =>
		selectedServiceIds.includes(service.id),
	);

	const { mutateAsync: duplicateProject, isLoading } =
		api.project.duplicate.useMutation({
			onSuccess: async (newProject) => {
				await utils.project.all.invalidate();
				toast.success(
					duplicateType === "new-project"
						? t("dashboard.duplicate.projectDuplicatedSuccessfully")
						: t("dashboard.duplicate.servicesDuplicatedSuccessfully"),
				);
				setOpen(false);
				if (duplicateType === "new-project") {
					router.push(`/dashboard/project/${newProject.projectId}`);
				}
			},
			onError: (error) => {
				toast.error(error.message);
			},
		});

	const handleDuplicate = async () => {
		if (duplicateType === "new-project" && !name) {
			toast.error(t("dashboard.duplicate.projectNameRequired"));
			return;
		}

		await duplicateProject({
			sourceProjectId: projectId,
			name,
			description,
			includeServices: true,
			selectedServices: selectedServices.map((service) => ({
				id: service.id,
				type: service.type,
			})),
			duplicateInSameProject: duplicateType === "same-project",
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
				}
			}}
		>
			<DialogTrigger asChild>
				<Button variant="ghost" className="w-full justify-start">
					<Copy className="mr-2 h-4 w-4" />
					{t("dashboard.duplicate.duplicate")}
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{t("dashboard.duplicate.duplicateServices")}
					</DialogTitle>
					<DialogDescription>
						{t("dashboard.duplicate.chooseWhereToDuplicate")}
					</DialogDescription>
				</DialogHeader>

				<div className="grid gap-4 py-4">
					<div className="grid gap-2">
						<Label>{t("dashboard.duplicate.duplicateTo")}</Label>
						<RadioGroup
							value={duplicateType}
							onValueChange={setDuplicateType}
							className="grid gap-2"
						>
							<div className="flex items-center space-x-2">
								<RadioGroupItem value="new-project" id="new-project" />
								<Label htmlFor="new-project">
									{t("dashboard.duplicate.newProject")}
								</Label>
							</div>
							<div className="flex items-center space-x-2">
								<RadioGroupItem value="same-project" id="same-project" />
								<Label htmlFor="same-project">
									{t("dashboard.duplicate.sameProject")}
								</Label>
							</div>
						</RadioGroup>
					</div>

					{duplicateType === "new-project" && (
						<>
							<div className="grid gap-2">
								<Label htmlFor="name">{t("dashboard.duplicate.name")}</Label>
								<Input
									id="name"
									value={name}
									onChange={(e) => setName(e.target.value)}
									placeholder={t("dashboard.duplicate.namePlaceholder")}
								/>
							</div>

							<div className="grid gap-2">
								<Label htmlFor="description">
									{t("dashboard.duplicate.description")}
								</Label>
								<Input
									id="description"
									value={description}
									onChange={(e) => setDescription(e.target.value)}
									placeholder={t("dashboard.duplicate.descriptionPlaceholder")}
								/>
							</div>
						</>
					)}

					<div className="grid gap-2">
						<Label>
							{t("dashboard.duplicate.selectedServicesToDuplicate")}
						</Label>
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
						disabled={isLoading}
					>
						{t("dashboard.duplicate.cancel")}
					</Button>
					<Button onClick={handleDuplicate} disabled={isLoading}>
						{isLoading ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								{duplicateType === "new-project"
									? t("dashboard.duplicate.duplicatingProject")
									: t("dashboard.duplicate.duplicatingServices")}
							</>
						) : duplicateType === "new-project" ? (
							t("dashboard.duplicate.duplicateProject")
						) : (
							t("dashboard.duplicate.duplicateServices")
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
