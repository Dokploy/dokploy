import { PlusIcon, PenBoxIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    DESTINATION_SCHEMAS,
    type DestinationType,
} from "./destination-schema";
import { DestinationDialog } from "./destination-dialog";

type DestinationDialogType = DestinationType | null;

interface Props {
    destinationId?: string;
    type?: DestinationDialogType;
}

export const HandleDestinations = ({ destinationId, type: initialType }: Props) => {
    const [openType, setOpenType] = useState<DestinationDialogType>(null);

    const handleEdit = () => {
        setOpenType(initialType || "s3");
    };

    const destinationOptions = DESTINATION_SCHEMAS.map((schema) => ({
        type: schema.type,
        label: schema.type === "s3" ? "S3 Storage" : schema.name,
    }));

    return (
        <>
            {destinationId ? (
                <Button
                    variant="ghost"
                    size="icon"
                    className="group hover:bg-blue-500/10"
                    onClick={handleEdit}
                >
                    <PenBoxIcon className="size-3.5 text-primary group-hover:text-blue-500" />
                </Button>
            ) : (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button className="cursor-pointer space-x-3">
                            <PlusIcon className="h-4 w-4" />
                            <span>Add Destination</span>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                        {destinationOptions.map((option) => (
                            <DropdownMenuItem
                                key={option.type}
                                onClick={() => setOpenType(option.type)}
                            >
                                {option.label}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            )}

            {DESTINATION_SCHEMAS.map((schema) => {
                return (
                    <DestinationDialog
                        key={schema.type}
                        open={openType === schema.type}
                        onOpenChange={(open: boolean) => !open && setOpenType(null)}
                        destinationId={destinationId}
                        type={schema.type}
                    />
                );
            })}
        </>
    );
};
