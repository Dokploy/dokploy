import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { HelpCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const RegistryProviderSchema = z.object({
  deployRegistryId: z.string().min(1, {
    message: "Registry is required",
  }),
  deployImage: z.string().min(1, {
    message: "Image is required",
  }),
  deployImageTag: z.string().min(1, {
    message: "Tag is required",
  }),
});

type RegistryProvider = z.infer<typeof RegistryProviderSchema>;

interface Props {
  applicationId: string;
}

export const SaveRegistryProvider = ({ applicationId }: Props) => {
  const [selectedRegistryId, setSelectedRegistryId] = useState<string>("");
  const [selectedImage, setSelectedImage] = useState<string>("");

  const { data: application, refetch } = api.application.one.useQuery({
    applicationId,
  });
  const { data: registries } = api.application.getUserRegistries.useQuery();

  const { data: images, isLoading: imagesLoading } =
    api.application.getRegistryImages.useQuery(
      { registryId: selectedRegistryId },
      { enabled: !!selectedRegistryId }
    );

  const { data: tags, isLoading: tagsLoading } =
    api.application.getImageTags.useQuery(
      { registryId: selectedRegistryId, imageName: selectedImage },
      { enabled: !!selectedRegistryId && !!selectedImage }
    );

  const { mutateAsync } = api.application.saveRegistryProvider.useMutation();

  const form = useForm<RegistryProvider>({
    defaultValues: {
      deployRegistryId: "",
      deployImage: "",
      deployImageTag: "latest",
    },
    resolver: zodResolver(RegistryProviderSchema),
  });

  useEffect(() => {
    if (application) {
      const values = {
        deployRegistryId: application.deployRegistryId || "",
        deployImage: application.deployImage || "",
        deployImageTag: application.deployImageTag || "latest",
      };
      form.reset(values);
      setSelectedRegistryId(values.deployRegistryId);
      setSelectedImage(values.deployImage);
    }
  }, [form, application]);

  const onSubmit = async (values: RegistryProvider) => {
    await mutateAsync({
      applicationId,
      ...values,
    })
      .then(async () => {
        toast.success("Registry Provider Saved");
        await refetch();
      })
      .catch(() => {
        toast.error("Error saving the Registry provider");
      });
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
      >
        <div className="grid md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="deployRegistryId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Registry</FormLabel>
                <Select
                  onValueChange={(value) => {
                    field.onChange(value);
                    setSelectedRegistryId(value);
                    setSelectedImage("");
                    form.setValue("deployImage", "");
                    form.setValue("deployImageTag", "latest");
                  }}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a registry" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {registries?.map((registry) => (
                      <SelectItem
                        key={registry.registryId}
                        value={registry.registryId}
                      >
                        {registry.registryName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="deployImage"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Image</FormLabel>
                <Select
                  onValueChange={(value) => {
                    field.onChange(value);
                    setSelectedImage(value);
                    form.setValue("deployImageTag", "latest");
                  }}
                  value={field.value}
                  disabled={!selectedRegistryId}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          imagesLoading
                            ? "Loading images..."
                            : "Select an image"
                        }
                      />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {images?.map((image: string) => (
                      <SelectItem key={image} value={image}>
                        {image}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid md:grid-cols-1 gap-4">
          <FormField
            control={form.control}
            name="deployImageTag"
            render={({ field }) => (
              <FormItem>
                <div className="flex flex-row gap-2">
                  <FormLabel>Tag</FormLabel>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="size-4 text-muted-foreground hover:text-foreground transition-colors cursor-pointer" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>
                          If <code>Daily Docker Cleanup</code> is enabled or if
                          there are any factors that regularly delete tags, it
                          is recommended to use the <code>'latest'</code> tag.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                  disabled={!selectedImage}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          tagsLoading ? "Loading tags..." : "Select a tag"
                        }
                      />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {tags?.map((tag: string) => (
                      <SelectItem key={tag} value={tag}>
                        {tag}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex flex-row justify-end">
          <Button
            type="submit"
            className="w-fit"
            isLoading={form.formState.isSubmitting}
          >
            Save
          </Button>
        </div>
      </form>
    </Form>
  );
};
