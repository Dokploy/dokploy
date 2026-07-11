import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
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
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/utils/api";

const updateExternalUpstreamSchema = z.object({
	name: z.string().min(1, { message: "Name is required" }),
	description: z.string().optional(),
	targetUrl: z.string().url("Target URL must be a valid URL"),
	passHostHeader: z.boolean(),
});

type UpdateExternalUpstreamForm = z.infer<
	typeof updateExternalUpstreamSchema
>;

interface Props {
	externalUpstreamId: string;
}

export const UpdateExternalUpstream = ({ externalUpstreamId }: Props) => {
	const utils = api.useUtils();
	const [visible, setVisible] = useState(false);
	const { data } = api.externalUpstream.one.useQuery(
		{ externalUpstreamId },
		{ enabled: !!externalUpstreamId },
	);
	const { mutateAsync, isPending, error, isError } =
		api.externalUpstream.update.useMutation();

	const form = useForm<UpdateExternalUpstreamForm>({
		defaultValues: {
			name: "",
			description: "",
			targetUrl: "http://",
			passHostHeader: true,
		},
		resolver: zodResolver(updateExternalUpstreamSchema),
	});

	useEffect(() => {
		if (!data) {
			return;
		}

		form.reset({
			name: data.name,
			description: data.description || "",
			targetUrl: data.targetUrl,
			passHostHeader: data.passHostHeader,
		});
	}, [data, form]);

	const onSubmit = async (values: UpdateExternalUpstreamForm) => {
		await mutateAsync({
			externalUpstreamId,
			...values,
		})
			.then(async () => {
				toast.success("External Upstream updated");
				setVisible(false);
				await utils.externalUpstream.one.invalidate({
					externalUpstreamId,
				});
				await utils.environment.one.invalidate({
					environmentId: data?.environmentId || "",
				});
			})
			.catch(() => {
				toast.error("Error updating the external upstream");
			});
	};

	return (
		<Dialog open={visible} onOpenChange={setVisible}>
			<DialogTrigger asChild>
				<Button variant="outline">Edit</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>Edit</DialogTitle>
					<DialogDescription>
						Update the upstream target and metadata for this service
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
				<Form {...form}>
					<form
						id="hook-form"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Name</FormLabel>
									<FormControl>
										<Input {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="targetUrl"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Target URL</FormLabel>
									<FormControl>
										<Input {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="description"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Description</FormLabel>
									<FormControl>
										<Textarea rows={3} {...field} value={field.value || ""} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="passHostHeader"
							render={({ field }) => (
								<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
									<div className="space-y-1">
										<FormLabel>Pass Host Header</FormLabel>
										<p className="text-sm text-muted-foreground">
											Forward the original host header to the upstream service
										</p>
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
					</form>
				</Form>
				<DialogFooter>
					<Button form="hook-form" type="submit" isLoading={isPending}>
						Save
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
