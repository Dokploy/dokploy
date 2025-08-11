import { AlertBlock } from "@/components/shared/alert-block";
import { CodeEditor } from "@/components/shared/code-editor";
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
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { FileIcon } from "lucide-react";
import { useTranslation } from "next-i18next";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const updateProjectSchema = z.object({
	env: z.string().optional(),
});

type UpdateProject = z.infer<typeof updateProjectSchema>;

interface Props {
	projectId: string;
	children?: React.ReactNode;
}

export const ProjectEnvironment = ({ projectId, children }: Props) => {
	const { t } = useTranslation("dashboard");
	const [isOpen, setIsOpen] = useState(false);
	const utils = api.useUtils();
	const { mutateAsync, error, isError, isLoading } =
		api.project.update.useMutation();
	const { data } = api.project.one.useQuery(
		{
			projectId,
		},
		{
			enabled: !!projectId,
		},
	);

	const form = useForm<UpdateProject>({
		defaultValues: {
			env: data?.env ?? "",
		},
		resolver: zodResolver(updateProjectSchema),
	});
	useEffect(() => {
		if (data) {
			form.reset({
				env: data.env ?? "",
			});
		}
	}, [data, form, form.reset]);

	const onSubmit = async (formData: UpdateProject) => {
		await mutateAsync({
			env: formData.env || "",
			projectId: projectId,
		})
			.then(() => {
				toast.success(t("dashboard.projects.envUpdatedSuccessfully"));
				utils.project.all.invalidate();
			})
			.catch(() => {
				toast.error(t("dashboard.projects.errorUpdatingEnv"));
			})
			.finally(() => {});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				{children ?? (
					<DropdownMenuItem
						className="w-full cursor-pointer space-x-3"
						onSelect={(e) => e.preventDefault()}
					>
						<FileIcon className="size-4" />
						<span>{t("dashboard.projects.projectEnvironment")}</span>
					</DropdownMenuItem>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-6xl">
				<DialogHeader>
					<DialogTitle>
						{t("dashboard.projects.projectEnvironment")}
					</DialogTitle>
					<DialogDescription>
						{t("dashboard.projects.projectEnvironmentDescription")}
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
				<AlertBlock type="info">
					{t("dashboard.projects.envSyntaxInfo")}{" "}
					<code>DATABASE_URL=${"{{project.DATABASE_URL}}"}</code>
				</AlertBlock>
				<div className="grid gap-4">
					<div className="grid items-center gap-4">
						<Form {...form}>
							<form
								onSubmit={form.handleSubmit(onSubmit)}
								className="grid w-full gap-4 "
							>
								<FormField
									control={form.control}
									name="env"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												{t("dashboard.projects.environmentVariables")}
											</FormLabel>
											<FormControl>
												<CodeEditor
													lineWrapping
													language="properties"
													wrapperClassName="h-[35rem] font-mono"
													placeholder={t("dashboard.projects.envPlaceholder")}
													{...field}
												/>
											</FormControl>

											<pre>
												<FormMessage />
											</pre>
										</FormItem>
									)}
								/>
								<DialogFooter>
									<Button isLoading={isLoading} type="submit">
										{t("dashboard.projects.update")}
									</Button>
								</DialogFooter>
							</form>
						</Form>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
};
