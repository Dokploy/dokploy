import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { api } from "@/utils/api";

interface Props {
  containerId: string;
}

export const ShowContainerConfig = ({ containerId }: Props) => {
  const { data } = api.docker.getConfig.useQuery(
    {
      containerId,
    },
    {
      enabled: !!containerId,
    }
  );
  return (
    <Dialog>
      <DialogTrigger asChild>
        <DropdownMenuItem
          className="w-full cursor-pointer"
          onSelect={(e) => e.preventDefault()}
        >
          View Config
        </DropdownMenuItem>
      </DialogTrigger>
      <DialogContent className={"w-full md:w-[70vw] max-w-max"}>
        <DialogHeader>
          <DialogTitle>Container Config</DialogTitle>
          <DialogDescription>
            See in detail the config of this container
          </DialogDescription>
        </DialogHeader>
        <div className="text-wrap rounded-lg border p-4 text-sm bg-card overflow-y-auto max-h-[80vh]">
          <code>
            <pre className="whitespace-pre-wrap break-words">
              {JSON.stringify(data, null, 2)}
            </pre>
          </code>
        </div>
      </DialogContent>
    </Dialog>
  );
};
