import { AlertBlock } from "@/components/shared/alert-block";
import { CodeEditor } from "@/components/shared/code-editor";
import { Button } from "@/components/ui/button";
import { CardTitle } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Dices } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

interface Props {
	composeId: string;
}

const schema = z.object({
	deployable: z.boolean().optional(),
});

type Schema = z.infer<typeof schema>;

export const RandomizeDeployable = ({ composeId }: Props) => {
	const utils = api.useUtils();
	const [compose, setCompose] = useState<string>("");
	const [isOpen, setIsOpen] = useState(false);
	const { mutateAsync, error, isError } =
		api.compose.randomizeDeployableCompose.useMutation();

	const { mutateAsync: updateCompose } = api.compose.update.useMutation();

	const { data, refetch } = api.compose.one.useQuery(
		{ composeId },
		{ enabled: !!composeId },
	);

	const form = useForm<Schema>({
		defaultValues: {
			deployable: false,
		},
		resolver: zodResolver(schema),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				deployable: data?.deployable || false,
			});
		}
	}, [form, form.reset, form.formState.isSubmitSuccessful, data]);

	const onSubmit = async (formData: Schema) => {
		await updateCompose({
			composeId,
			deployable: formData?.deployable || false,
		})
			.then(async (data) => {
				randomizeCompose();
				refetch();
				toast.success("Compose updated");
			})
			.catch(() => {
				toast.error("Error randomizing the compose");
			});
	};

	const randomizeCompose = async () => {
		await mutateAsync({
			composeId,
			suffix: data?.appName || "",
		})
			.then(async (data) => {
				await utils.project.all.invalidate();
				setCompose(data);
				toast.success("Compose randomized");
			})
			.catch(() => {
				toast.error("Error randomizing the compose");
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild onClick={() => randomizeCompose()}>
				<Button className="max-lg:w-full" variant="outline">
					<Dices className="h-4 w-4" />
					Randomize Deployable
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-6xl max-h-[50rem] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Randomize Deployable (Experimental)</DialogTitle>
					<DialogDescription>
						Use this in case you want to deploy the same compose file twice.
					</DialogDescription>
				</DialogHeader>
				<div className="text-sm text-muted-foreground flex flex-col gap-2">
					<span>
						This will randomize the compose file and will add a suffix to the
						property to avoid conflicts
					</span>
					<ul className="list-disc list-inside">
						<li>volumes</li>
						<li>networks</li>
					</ul>
					<AlertBlock type="info">
						When you activate this option, we will include a env
						`DOKPLOY_SUFFIX` variable to the compose file so you can use it in
						your compose file, also we don't include the{" "}
						<code>dokploy-network</code> to any of the services by default.
					</AlertBlock>
				</div>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						id="hook-form-add-project"
						className="grid w-full gap-4"
					>
						{isError && (
							<div className="flex flex-row gap-4 rounded-lg items-center bg-red-50 p-2 dark:bg-red-950">
								<AlertTriangle className="text-red-600 dark:text-red-400" />
								<span className="text-sm text-red-600 dark:text-red-400">
									{error?.message}
								</span>
							</div>
						)}

						<div className="flex flex-col lg:flex-col  gap-4 w-full ">
							<div>
								<FormField
									control={form.control}
									name="deployable"
									render={({ field }) => (
										<FormItem className="mt-4 flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
											<div className="space-y-0.5">
												<FormLabel>Apply Randomize ({data?.appName})</FormLabel>
												<FormDescription>
													Apply randomize to the compose file.
												</FormDescription>
											</div>
											<FormControl>
												<Switch
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
										</FormItem>
									)}
								/>
							</div>

							<div className="flex flex-col lg:flex-row  gap-4 w-full items-end justify-end">
								<Button
									form="hook-form-add-project"
									type="submit"
									className="lg:w-fit"
								>
									Save
								</Button>
							</div>
						</div>
						<pre>
							<CodeEditor
								value={compose || ""}
								language="yaml"
								readOnly
								height="50rem"
							/>
						</pre>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
