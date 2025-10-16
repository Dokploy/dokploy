import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRoundIcon, LockIcon, PenBoxIcon, PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
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
        FormDescription,
        FormField,
        FormItem,
        FormLabel,
        FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { gpgKeyCreate } from "@/server/db/validations";
import { api } from "@/utils/api";

type GpgKey = z.infer<typeof gpgKeyCreate>;

interface Props {
        gpgKeyId?: string;
}

export const HandleGpgKeys = ({ gpgKeyId }: Props) => {
        const utils = api.useUtils();
        const [isOpen, setIsOpen] = useState(false);

        const { data } = api.gpgKey.one.useQuery(
                { gpgKeyId: gpgKeyId || "" },
                { enabled: !!gpgKeyId },
        );

        const createMutation = api.gpgKey.create.useMutation();
        const updateMutation = api.gpgKey.update.useMutation();

        const activeMutation = gpgKeyId ? updateMutation : createMutation;
        const isLoading = activeMutation.isLoading;
        const isError = activeMutation.isError;
        const error = activeMutation.error;

        const form = useForm<GpgKey>({
                resolver: zodResolver(gpgKeyCreate),
                defaultValues: {
                        name: "",
                        description: "",
                        publicKey: "",
                        privateKey: "",
                        passphrase: "",
                },
        });

        useEffect(() => {
                if (data) {
                        form.reset({
                                name: data.name,
                                description: data.description ?? "",
                                publicKey: data.publicKey,
                                privateKey: data.privateKey ?? "",
                                passphrase: data.passphrase ?? "",
                        });
                } else {
                        form.reset({
                                name: "",
                                description: "",
                                publicKey: "",
                                privateKey: "",
                                passphrase: "",
                        });
                }
        }, [data, form]);

        const onSubmit = async (values: GpgKey) => {
                const description = values.description?.trim();
                const privateKey = values.privateKey?.trim();
                const passphrase = values.passphrase?.trim();

                if (gpgKeyId) {
                        await updateMutation.mutateAsync({
                                gpgKeyId,
                                name: values.name,
                                description: description || undefined,
                                publicKey: values.publicKey,
                                privateKey: privateKey || undefined,
                                passphrase: passphrase || undefined,
                        })
                                .then(async () => {
                                        toast.success(
                                                gpgKeyId
                                                        ? "GPG key updated successfully"
                                                        : "GPG key created successfully",
                                        );
                                        await utils.gpgKey.all.invalidate();
                                        form.reset();
                                        setIsOpen(false);
                                })
                                .catch(() => {
                                        toast.error(
                                                gpgKeyId
                                                        ? "Error updating the GPG key"
                                                        : "Error creating the GPG key",
                                        );
                                });
                        return;
                }

                await createMutation.mutateAsync({
                        name: values.name,
                        description: description || undefined,
                        publicKey: values.publicKey,
                        privateKey: privateKey || undefined,
                        passphrase: passphrase || undefined,
                })
                        .then(async () => {
                                toast.success(
                                        gpgKeyId
                                                ? "GPG key updated successfully"
                                                : "GPG key created successfully",
                                );
                                await utils.gpgKey.all.invalidate();
                                form.reset();
                                setIsOpen(false);
                        })
                        .catch(() => {
                                toast.error(
                                        gpgKeyId
                                                ? "Error updating the GPG key"
                                                : "Error creating the GPG key",
                                );
                        });
        };

        return (
                <Dialog open={isOpen} onOpenChange={setIsOpen}>
                        <DialogTrigger asChild>
                                {gpgKeyId ? (
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
                                                Add GPG Key
                                        </Button>
                                )}
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-2xl">
                                <DialogHeader>
                                        <DialogTitle className="flex items-center gap-2">
                                                <KeyRoundIcon className="size-4" /> GPG Key
                                        </DialogTitle>
                                        <DialogDescription className="space-y-4">
                                                <p>
                                                        Store reusable OpenPGP public keys to encrypt database backups.
                                                </p>
                                                <p className="text-muted-foreground text-sm">
                                                        Secret material is optional. When provided it will be securely
                                                        stored so restores can reuse it without retyping.
                                                </p>
                                        </DialogDescription>
                                </DialogHeader>
                                {isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
                                <Form {...form}>
                                        <form
                                                className="grid w-full gap-4"
                                                onSubmit={form.handleSubmit(onSubmit)}
                                        >
                                                <FormField
                                                        control={form.control}
                                                        name="name"
                                                        render={({ field }) => (
                                                                <FormItem>
                                                                        <FormLabel>Name</FormLabel>
                                                                        <FormControl>
                                                                                <Input placeholder="Production backups" {...field} />
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
                                                                                <Input
                                                                                        placeholder="Used for customer-facing databases"
                                                                                        {...field}
                                                                                />
                                                                        </FormControl>
                                                                        <FormMessage />
                                                                </FormItem>
                                                        )}
                                                />
                                                <FormField
                                                        control={form.control}
                                                        name="publicKey"
                                                        render={({ field }) => (
                                                                <FormItem>
                                                                        <FormLabel>Public Key</FormLabel>
                                                                        <FormControl>
                                                                                <Textarea
                                                                                        placeholder="-----BEGIN PGP PUBLIC KEY BLOCK-----"
                                                                                        rows={6}
                                                                                        {...field}
                                                                                />
                                                                        </FormControl>
                                                                        <FormDescription>
                                                                                Required. Used to encrypt backups at rest.
                                                                        </FormDescription>
                                                                        <FormMessage />
                                                                </FormItem>
                                                        )}
                                                />
                                                <FormField
                                                        control={form.control}
                                                        name="privateKey"
                                                        render={({ field }) => (
                                                                <FormItem>
                                                                        <FormLabel className="flex items-center gap-2">
                                                                                Private Key <LockIcon className="size-3.5 text-muted-foreground" />
                                                                        </FormLabel>
                                                                        <FormControl>
                                                                                <Textarea
                                                                                        placeholder="-----BEGIN PGP PRIVATE KEY BLOCK-----"
                                                                                        rows={6}
                                                                                        {...field}
                                                                                />
                                                                        </FormControl>
                                                                        <FormDescription>
                                                                                Optional. Provide it to reuse the secret during restores.
                                                                        </FormDescription>
                                                                        <FormMessage />
                                                                </FormItem>
                                                        )}
                                                />
                                                <FormField
                                                        control={form.control}
                                                        name="passphrase"
                                                        render={({ field }) => (
                                                                <FormItem>
                                                                        <FormLabel>Passphrase</FormLabel>
                                                                        <FormControl>
                                                                                <Input
                                                                                        type="password"
                                                                                        placeholder="Optional passphrase"
                                                                                        {...field}
                                                                                />
                                                                        </FormControl>
                                                                        <FormMessage />
                                                                </FormItem>
                                                        )}
                                                />
                                                <DialogFooter>
                                                        <Button isLoading={isLoading} type="submit">
                                                                {gpgKeyId ? "Update" : "Create"}
                                                        </Button>
                                                </DialogFooter>
                                        </form>
                                </Form>
                        </DialogContent>
                </Dialog>
        );
};
