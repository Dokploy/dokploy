import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { FileIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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

const updateProjectSchema = z.object({
	env: z.string().optional(),
});

type UpdateProject = z.infer<typeof updateProjectSchema>;

interface Props {
	projectId: string;
	children?: React.ReactNode;
}

export const ProjectEnvironment = ({ projectId, children }: Props) => {
	const t = useTranslations("dashboardProjects");
	const { data: permissions } = api.user.getPermissions.useQuery();
	const canRead = permissions?.projectEnvVars.read ?? false;
	const canWrite = permissions?.projectEnvVars.write ?? false;
	const [isOpen, setIsOpen] = useState(false);
	const utils = api.useUtils();
	const { mutateAsync, error, isError, isPending } =
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
				toast.success(t("projectEnvironment.updatedSuccess"));
				utils.project.all.invalidate();
			})
			.catch(() => {
				toast.error(t("projectEnvironment.updateError"));
			})
			.finally(() => {});
	};

	// Add keyboard shortcut for Ctrl+S/Cmd+S
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key === "s" && !isPending && isOpen) {
				e.preventDefault();
				form.handleSubmit(onSubmit)();
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [form, onSubmit, isPending, isOpen]);

	if (!canRead) {
		return null;
	}

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				{children ?? (
					<DropdownMenuItem
						className="w-full cursor-pointer space-x-3"
						onSelect={(e) => e.preventDefault()}
					>
						<FileIcon className="size-4" />
						<span>{t("projectEnvironment.menuLabel")}</span>
					</DropdownMenuItem>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-6xl">
				<DialogHeader>
					<DialogTitle>{t("projectEnvironment.title")}</DialogTitle>
					<DialogDescription>
						{t("projectEnvironment.description")}
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
				<AlertBlock type="info">
					{t("projectEnvironment.hint")}{" "}
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
												{t("projectEnvironment.fieldLabel")}
											</FormLabel>
											<FormControl>
												<CodeEditor
													lineWrapping
													language="properties"
													readOnly={!canWrite}
													wrapperClassName="h-[35rem] font-mono"
													placeholder={`NODE_ENV=production
PORT=3000

                                                    `}
													{...field}
												/>
											</FormControl>

											<pre>
												<FormMessage />
											</pre>
										</FormItem>
									)}
								/>
								{canWrite && (
									<DialogFooter>
										<Button isLoading={isPending} type="submit">
											{t("projectEnvironment.submitUpdate")}
										</Button>
									</DialogFooter>
								)}
							</form>
						</Form>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
};
