import { zodResolver } from "@hookform/resolvers/zod";
import { Terminal } from "lucide-react";
import { useTranslation } from "next-i18next";
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

const updateEnvironmentSchema = z.object({
	env: z.string().optional(),
});

type UpdateEnvironment = z.infer<typeof updateEnvironmentSchema>;

interface Props {
	environmentId: string;
	children?: React.ReactNode;
}

export const EnvironmentVariables = ({ environmentId, children }: Props) => {
	const { t } = useTranslation("common");
	const [isOpen, setIsOpen] = useState(false);
	const utils = api.useUtils();
	const { mutateAsync, error, isError, isLoading } =
		api.environment.update.useMutation();
	const { data } = api.environment.one.useQuery(
		{
			environmentId,
		},
		{
			enabled: !!environmentId,
		},
	);

	const form = useForm<UpdateEnvironment>({
		defaultValues: {
			env: data?.env ?? "",
		},
		resolver: zodResolver(updateEnvironmentSchema),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				env: data.env ?? "",
			});
		}
	}, [data, form, form.reset]);

	const onSubmit = async (formData: UpdateEnvironment) => {
		await mutateAsync({
			env: formData.env || "",
			environmentId: environmentId,
		})
			.then(() => {
				toast.success(t("environment.variables.update.success"));
				utils.environment.one.invalidate({ environmentId });
			})
			.catch(() => {
				toast.error(t("environment.variables.update.error"));
			})
			.finally(() => {});
	};

	// Add keyboard shortcut for Ctrl+S/Cmd+S
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key === "s" && !isLoading && isOpen) {
				e.preventDefault();
				form.handleSubmit(onSubmit)();
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [form, onSubmit, isLoading, isOpen]);

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				{children ?? (
					<DropdownMenuItem
						className="w-full cursor-pointer space-x-3"
						onSelect={(e) => e.preventDefault()}
					>
						<Terminal className="size-4" />
						<span>{t("environment.variables")}</span>
					</DropdownMenuItem>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-6xl">
				<DialogHeader>
					<DialogTitle>{t("environment.variables")}</DialogTitle>
					<DialogDescription>
						{t("environment.variables.description")}
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
				<AlertBlock type="info">
					{t("environment.variables.info")}{" "}
					<code>API_URL=${"{{environment.API_URL}}"}</code>
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
											<FormLabel>{t("environment.variables.label")}</FormLabel>
											<FormControl>
												<CodeEditor
													lineWrapping
													language="properties"
													wrapperClassName="h-[35rem] font-mono"
													placeholder={t("environment.variables.placeholder")}
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
										{t("button.update")}
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
