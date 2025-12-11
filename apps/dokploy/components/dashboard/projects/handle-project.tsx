import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, SquarePen } from "lucide-react";
import { useRouter } from "next/router";
import { useTranslation } from "next-i18next";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
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

const createAddProjectSchema = (t: (key: string) => string) =>
	z.object({
		name: z
			.string()
			.min(1, { message: t("project.validation.nameRequired") })
			.refine(
				(name) => {
					const trimmedName = name.trim();
					const validNameRegex =
						/^[\p{L}\p{N}_-][\p{L}\p{N}\s_.-]*[\p{L}\p{N}_-]$/u;
					return validNameRegex.test(trimmedName);
				},
				{
					message: t("project.validation.nameFormat"),
				},
			)
			.refine((name) => !/^\d/.test(name.trim()), {
				message: t("project.validation.nameCannotStartWithNumber"),
			})
			.transform((name) => name.trim()),
		description: z.string().optional(),
	});

type AddProject = z.infer<ReturnType<typeof createAddProjectSchema>>;

interface Props {
	projectId?: string;
}

export const HandleProject = ({ projectId }: Props) => {
	const utils = api.useUtils();
	const { t } = useTranslation("common");
	const [isOpen, setIsOpen] = useState(false);

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
	const router = useRouter();
	const AddProjectSchema = createAddProjectSchema(t);
	const form = useForm<AddProject>({
		defaultValues: {
			description: "",
			name: "",
		},
		resolver: zodResolver(AddProjectSchema),
	});

	useEffect(() => {
		form.reset({
			description: data?.description ?? "",
			name: data?.name ?? "",
		});
	}, [form, form.reset, form.formState.isSubmitSuccessful, data]);

	const onSubmit = async (data: AddProject) => {
		await mutateAsync({
			name: data.name,
			description: data.description,
			projectId: projectId || "",
		})
			.then(async (data) => {
				await utils.project.all.invalidate();
				toast.success(
					projectId
						? t("project.update.success")
						: t("project.create.success"),
				);
				setIsOpen(false);
				if (!projectId) {
					const projectIdToUse =
						data && "project" in data ? data.project.projectId : undefined;
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
					projectId
						? t("project.update.error")
						: t("project.create.error"),
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
						<span>{t("button.update")}</span>
					</DropdownMenuItem>
				) : (
					<Button>
						<PlusIcon className="h-4 w-4" />
						{t("project.create")}
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:m:max-w-lg ">
				<DialogHeader>
					<DialogTitle>
						{projectId
							? t("project.dialog.updateTitle")
							: t("project.dialog.createTitle")}
					</DialogTitle>
					<DialogDescription>
						{t("project.dialog.description")}
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
										<FormLabel>{t("project.name")}</FormLabel>
										<FormControl>
											<Input
												placeholder={t("project.namePlaceholder")}
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
									<FormLabel>{t("project.description")}</FormLabel>
									<FormControl>
										<Textarea
											placeholder={t("project.descriptionPlaceholder")}
											className="resize-none"
											{...field}
										/>
									</FormControl>

									<FormMessage />
								</FormItem>
							)}
						/>
					</form>

					<DialogFooter>
						<Button
							isLoading={form.formState.isSubmitting}
							form="hook-form-add-project"
							type="submit"
						>
							{projectId ? t("button.update") : t("button.create")}
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
