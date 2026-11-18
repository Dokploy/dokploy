import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";

import { PlusIcon, SquarePen } from "lucide-react";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { TagSelector } from "@/components/shared/tag-selector";
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
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/utils/api";

const AddProjectSchema = z.object({
	name: z
		.string()
		.min(1, "projects.nameRequired")
		.refine(
			(name) => {
				const trimmedName = name.trim();
				const validNameRegex =
					/^[\p{L}\p{N}_-][\p{L}\p{N}\s_.-]*[\p{L}\p{N}_-]$/u;
				return validNameRegex.test(trimmedName);
			},
			{
				message: "projects.nameInvalidChars",
			},
		)
		.refine((name) => !/^\d/.test(name.trim()), {
			message: "projects.nameNoNumberStart",
		})
		.transform((name) => name.trim()),
	description: z.string().optional(),
});

type AddProject = z.infer<typeof AddProjectSchema>;

interface Props {
	projectId?: string;
}

export const HandleProject = ({ projectId }: Props) => {
	const { t } = useTranslation();
	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);
	const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

	const { mutateAsync, error, isError } = projectId
		? api.project.update.useMutation()
		: api.project.create.useMutation();

	const { data, refetch } = api.project.one.useQuery(
		{
			projectId: projectId || "",
		},
		{
			enabled: !!projectId,
		},
	);

	const { data: availableTags = [] } = api.tag.all.useQuery();
	const bulkAssignMutation = api.tag.bulkAssign.useMutation();

	const router = useRouter();
	const form = useForm<AddProject>({
		defaultValues: {
			description: "",
			name: "",
		},
		resolver: standardSchemaResolver(AddProjectSchema),
	});

	useEffect(() => {
		form.reset({
			description: data?.description ?? "",
			name: data?.name ?? "",
		});
		// Load existing tags when editing a project
		if (data?.projectTags) {
			const tagIds = data.projectTags.map((pt) => pt.tagId);
			setSelectedTagIds(tagIds);
		} else {
			setSelectedTagIds([]);
		}
	}, [form, form.reset, form.formState.isSubmitSuccessful, data]);

	const onSubmit = async (data: AddProject) => {
		await mutateAsync({
			name: data.name,
			description: data.description,
			projectId: projectId || "",
		})
			.then(async (data) => {
				// Assign tags to the project (both create and update)
				const projectIdToUse =
					projectId ||
					(data && "project" in data ? data.project.projectId : undefined);

				if (projectIdToUse) {
					try {
						await bulkAssignMutation.mutateAsync({
							projectId: projectIdToUse,
							tagIds: selectedTagIds,
						});
					} catch (error) {
						toast.error(t("projects.assignTagsError"));
					}
				}

				await utils.project.all.invalidate();
				toast.success(
					projectId ? t("projects.updateSuccess") : t("projects.createSuccess"),
				);
				setIsOpen(false);
				if (!projectId) {
					const environmentIdToUse =
						data && "environment" in data
							? data.environment.environmentId
							: undefined;

					if (environmentIdToUse && projectIdToUse) {
						router.push(
							`/dashboard/project/${projectIdToUse}/environment/${environmentIdToUse}`,
						);
					}
				} else {
					refetch();
				}
			})
			.catch(() => {
				toast.error(
					projectId ? t("projects.updateError") : t("projects.createError"),
				);
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				{projectId ? (
					<DropdownMenuItem
						className="w-full cursor-pointer space-x-3"
						onSelect={(e) => e.preventDefault()}
					>
						<SquarePen className="size-4" />
						<span>{t("projects.update")}</span>
					</DropdownMenuItem>
				) : (
					<Button>
						<PlusIcon className="h-4 w-4" />
						{t("projects.create")}
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:m:max-w-lg ">
				<DialogHeader>
					<DialogTitle>
						{projectId ? t("projects.updateTitle") : t("projects.addTitle")}
					</DialogTitle>
					<DialogDescription>
						{t("projects.dialogDescription")}
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
				<Form {...form}>
					<form
						id="hook-form-add-project"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<div className="flex flex-col gap-4">
							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("projects.form.name")}</FormLabel>
										<FormControl>
											<Input
												placeholder={t("projects.form.namePlaceholder")}
												{...field}
											/>
										</FormControl>

										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						<FormField
							control={form.control}
							name="description"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("projects.form.description")}</FormLabel>
									<FormControl>
										<Textarea
											placeholder={t("projects.form.descriptionPlaceholder")}
											className="resize-none"
											{...field}
										/>
									</FormControl>

									<FormMessage />
								</FormItem>
							)}
						/>

						<div className="space-y-2">
							<FormLabel>{t("projects.form.tags")}</FormLabel>
							<TagSelector
								tags={availableTags.map((tag) => ({
									id: tag.tagId,
									name: tag.name,
									color: tag.color ?? undefined,
								}))}
								selectedTags={selectedTagIds}
								onTagsChange={setSelectedTagIds}
								placeholder={t("projects.form.tagsPlaceholder")}
							/>
						</div>
					</form>

					<DialogFooter>
						<Button
							isLoading={form.formState.isSubmitting}
							form="hook-form-add-project"
							type="submit"
						>
							{projectId
								? t("projects.submitUpdate")
								: t("projects.submitCreate")}
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
