import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { PenBoxIcon, PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/utils/api";

const schema = z
	.object({
		name: z.string().min(1, { message: "Name is required" }),
		mode: z.enum(["keyed", "keyless"]),
		publicKey: z.string().optional(),
		certificateIdentityRegexp: z.string().optional(),
		certificateOidcIssuer: z.string().optional(),
		ignoreTlog: z.boolean(),
		cosignImage: z.string().optional(),
	})
	.refine((v) => v.mode !== "keyed" || !!v.publicKey, {
		path: ["publicKey"],
		message: "Public key is required for keyed mode",
	})
	.refine(
		(v) =>
			v.mode !== "keyless" ||
			(!!v.certificateIdentityRegexp && !!v.certificateOidcIssuer),
		{
			path: ["certificateIdentityRegexp"],
			message: "Identity regexp and issuer are required for keyless mode",
		},
	);

type FormValues = z.infer<typeof schema>;

interface Props {
	trustPolicyId?: string;
}

export const HandleTrustPolicy = ({ trustPolicyId }: Props) => {
	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);

	const { data: policy } = api.trustPolicy.one.useQuery(
		{ trustPolicyId: trustPolicyId || "" },
		{ enabled: !!trustPolicyId },
	);

	const { mutateAsync } = trustPolicyId
		? api.trustPolicy.update.useMutation()
		: api.trustPolicy.create.useMutation();

	const form = useForm<FormValues>({
		defaultValues: {
			name: "",
			mode: "keyless",
			publicKey: "",
			certificateIdentityRegexp: "",
			certificateOidcIssuer: "",
			ignoreTlog: false,
			cosignImage: "",
		},
		resolver: zodResolver(schema),
	});

	const mode = form.watch("mode");

	useEffect(() => {
		if (policy) {
			form.reset({
				name: policy.name,
				mode: policy.mode,
				publicKey: policy.publicKey ?? "",
				certificateIdentityRegexp: policy.certificateIdentityRegexp ?? "",
				certificateOidcIssuer: policy.certificateOidcIssuer ?? "",
				ignoreTlog: policy.ignoreTlog,
				cosignImage: policy.cosignImage ?? "",
			});
		} else {
			form.reset({
				name: "",
				mode: "keyless",
				publicKey: "",
				certificateIdentityRegexp: "",
				certificateOidcIssuer: "",
				ignoreTlog: false,
				cosignImage: "",
			});
		}
	}, [form, form.reset, form.formState.isSubmitSuccessful, policy]);

	const onSubmit = async (data: FormValues) => {
		const payload: any = {
			name: data.name,
			mode: data.mode,
			publicKey: data.publicKey || undefined,
			certificateIdentityRegexp: data.certificateIdentityRegexp || undefined,
			certificateOidcIssuer: data.certificateOidcIssuer || undefined,
			ignoreTlog: data.ignoreTlog,
			cosignImage: data.cosignImage || undefined,
			...(trustPolicyId ? { trustPolicyId } : {}),
		};

		await mutateAsync(payload)
			.then(async () => {
				await utils.trustPolicy.all.invalidate();
				toast.success(
					trustPolicyId
						? "Trust policy updated successfully"
						: "Trust policy created successfully",
				);
				setIsOpen(false);
			})
			.catch(() => {
				toast.error(
					trustPolicyId
						? "Error updating trust policy"
						: "Error creating trust policy",
				);
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				{trustPolicyId ? (
					<Button
						variant="ghost"
						size="icon"
						className="group hover:bg-blue-500/10"
					>
						<PenBoxIcon className="size-3.5 text-primary group-hover:text-blue-500" />
					</Button>
				) : (
					<Button className="cursor-pointer space-x-3">
						<PlusIcon className="h-4 w-4" />
						Add Trust Policy
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>
						{trustPolicyId ? "Edit Trust Policy" : "Add Trust Policy"}
					</DialogTitle>
					<DialogDescription>
						Configure a cosign verification policy for admitted images.
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid grid-cols-1 sm:grid-cols-2 w-full gap-4"
					>
						<div className="flex flex-col gap-4">
							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Name</FormLabel>
										<FormControl>
											<Input placeholder="Policy name" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						<div className="flex flex-col gap-4">
							<FormField
								control={form.control}
								name="mode"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Mode</FormLabel>
										<FormControl>
											<Select
												onValueChange={field.onChange}
												value={field.value}
											>
												<SelectTrigger className="w-full">
													<SelectValue placeholder="Select mode" />
												</SelectTrigger>
												<SelectContent>
													<SelectGroup>
														<SelectItem value="keyed">Keyed</SelectItem>
														<SelectItem value="keyless">Keyless</SelectItem>
													</SelectGroup>
												</SelectContent>
											</Select>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						{mode === "keyed" && (
							<div className="flex flex-col gap-4 col-span-2">
								<FormField
									control={form.control}
									name="publicKey"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Public Key (PEM)</FormLabel>
											<FormControl>
												<Textarea
													placeholder="-----BEGIN PUBLIC KEY-----"
													className="font-mono text-xs"
													rows={6}
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>
						)}

						{mode === "keyless" && (
							<>
								<div className="flex flex-col gap-4">
									<FormField
										control={form.control}
										name="certificateIdentityRegexp"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Certificate Identity Regexp</FormLabel>
												<FormControl>
													<Input
														placeholder="^https://github.com/myorg/.*"
														{...field}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								</div>

								<div className="flex flex-col gap-4">
									<FormField
										control={form.control}
										name="certificateOidcIssuer"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Certificate OIDC Issuer</FormLabel>
												<FormControl>
													<Input
														placeholder="https://token.actions.githubusercontent.com"
														{...field}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								</div>
							</>
						)}

						<div className="flex flex-col gap-4 col-span-2">
							<FormField
								control={form.control}
								name="ignoreTlog"
								render={({ field }) => (
									<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
										<div className="space-y-0.5">
											<FormLabel>
												Ignore transparency log (private/air-gapped)
											</FormLabel>
											<FormDescription>
												Bypass Rekor transparency log verification. Only enable
												for air-gapped environments.
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

						<div className="flex flex-col gap-4 col-span-2">
							<FormField
								control={form.control}
								name="cosignImage"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Cosign Image (Optional)</FormLabel>
										<FormDescription>
											Override the cosign binary image. Must be digest-pinned
											(e.g. ghcr.io/sigstore/cosign/cosign:v2@sha256:...).
										</FormDescription>
										<FormControl>
											<Input
												placeholder="ghcr.io/sigstore/cosign/cosign:v2@sha256:..."
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						<DialogFooter className="col-span-2 flex justify-end">
							<Button isLoading={form.formState.isSubmitting} type="submit">
								{trustPolicyId ? "Update" : "Create"}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
