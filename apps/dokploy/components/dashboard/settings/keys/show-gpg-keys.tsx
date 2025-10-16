import { formatDistanceToNow } from "date-fns";
import { KeySquare, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DialogAction } from "@/components/shared/dialog-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
        Card,
        CardContent,
        CardDescription,
        CardHeader,
        CardTitle,
} from "@/components/ui/card";
import { api } from "@/utils/api";
import { HandleGpgKeys } from "./handle-gpg-keys";

export const GpgKeysCard = () => {
        const { data, isLoading, refetch } = api.gpgKey.all.useQuery();
        const { mutateAsync, isLoading: isRemoving } = api.gpgKey.remove.useMutation();

        return (
                <div className="w-full">
                        <Card className="h-full bg-sidebar p-2.5 rounded-xl max-w-5xl mx-auto">
                                <div className="rounded-xl bg-background shadow-md">
                                        <CardHeader>
                                                <CardTitle className="text-xl flex flex-row gap-2">
                                                        <KeySquare className="size-6 text-muted-foreground self-center" />
                                                        GPG Keys
                                                </CardTitle>
                                                <CardDescription>
                                                        Manage reusable OpenPGP keys for encrypting database and compose
                                                        backups.
                                                </CardDescription>
                                        </CardHeader>
                                        <CardContent className="space-y-2 py-8 border-t">
                                                {isLoading ? (
                                                        <div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[25vh]">
                                                                <span>Loading...</span>
                                                                <Loader2 className="animate-spin size-4" />
                                                        </div>
                                                ) : (
                                                        <>
                                                                {data?.length === 0 ? (
                                                                        <div className="flex flex-col items-center gap-3 min-h-[25vh] justify-center">
                                                                                <KeySquare className="size-8 self-center text-muted-foreground" />
                                                                                <span className="text-base text-muted-foreground text-center">
                                                                                        You don't have any GPG keys yet
                                                                                </span>
                                                                                <HandleGpgKeys />
                                                                        </div>
                                                                ) : (
                                                                        <div className="flex flex-col gap-4 min-h-[25vh]">
                                                                                <div className="flex flex-col gap-4 rounded-lg">
                                                                                        {data?.map((gpgKey, index) => (
                                                                                                <div
                                                                                                        key={gpgKey.gpgKeyId}
                                                                                                        className="flex items-center justify-between bg-sidebar p-1 w-full rounded-lg"
                                                                                                >
                                                                                                        <div className="flex items-center justify-between p-3.5 rounded-lg bg-background border w-full">
                                                                                                                <div className="flex flex-col gap-3">
                                                                                                                        <div className="flex flex-col gap-1">
                                                                                                                                <span className="text-sm font-medium">
                                                                                                                                        {index + 1}. {gpgKey.name}
                                                                                                                                </span>
                                                                                                                                {gpgKey.description && (
                                                                                                                                        <span className="text-xs text-muted-foreground">
                                                                                                                                                {gpgKey.description}
                                                                                                                                        </span>
                                                                                                                                )}
                                                                                                                        </div>
                                                                                                                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                                                                                                                <Badge
                                                                                                                                        variant={gpgKey.privateKey ? "default" : "outline"}
                                                                                                                                        className="flex items-center gap-1"
                                                                                                                                >
                                                                                                                                        <ShieldCheck className="size-3" />
                                                                                                                                        {gpgKey.privateKey ? "Secret stored" : "Secret not stored"}
                                                                                                                                </Badge>
                                                                                                                                <Badge
                                                                                                                                        variant={gpgKey.passphrase ? "default" : "outline"}
                                                                                                                                >
                                                                                                                                        {gpgKey.passphrase ? "Passphrase stored" : "No passphrase"}
                                                                                                                                </Badge>
                                                                                                                                <span>
                                                                                                                                        Created {" "}
                                                                                                                                        {formatDistanceToNow(new Date(gpgKey.createdAt), {
                                                                                                                                                addSuffix: true,
                                                                                                                                        })}
                                                                                                                                </span>
                                                                                                                        </div>
                                                                                                                </div>

                                                                                                                <div className="flex flex-row gap-1">
                                                                                                                        <HandleGpgKeys gpgKeyId={gpgKey.gpgKeyId} />
                                                                                                                        <DialogAction
                                                                                                                                title="Delete GPG Key"
                                                                                                                                description="Are you sure you want to delete this GPG key?"
                                                                                                                                type="destructive"
                                                                                                                                onClick={async () => {
                                                                                                                                        await mutateAsync({ gpgKeyId: gpgKey.gpgKeyId })
                                                                                                                                                .then(() => {
                                                                                                                                                        toast.success("GPG key deleted successfully");
                                                                                                                                                        refetch();
                                                                                                                                                })
                                                                                                                                                .catch(() => {
                                                                                                                                                        toast.error("Error deleting GPG key");
                                                                                                                                                });
                                                                                                                                }}
                                                                                                                        >
                                                                                                                                <Button
                                                                                                                                        variant="ghost"
                                                                                                                                        size="icon"
                                                                                                                                        className="group hover:bg-red-500/10"
                                                                                                                                        isLoading={isRemoving}
                                                                                                                                >
                                                                                                                                        <Trash2 className="size-4 text-primary group-hover:text-red-500" />
                                                                                                                                </Button>
                                                                                                                        </DialogAction>
                                                                                                                </div>
                                                                                                        </div>
                                                                                                </div>
                                                                                        ))}
                                                                                </div>
                                                                                <div className="flex flex-row gap-2 flex-wrap w-full justify-end mr-4">
                                                                                        <HandleGpgKeys />
                                                                                </div>
                                                                        </div>
                                                                )}
                                                        </>
                                                )}
                                        </CardContent>
                                </div>
                        </Card>
                </div>
        );
};
