import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { api } from "@/utils/api"
import { zodResolver } from "@hookform/resolvers/zod"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

const addInvitationSchema = z.object({
  email: z.string().email("Email non valida"),
  role: z.enum(["owner", "admin", "member"]),
})

type AddInvitationValues = z.infer<typeof addInvitationSchema>

interface AddInvitationProps {
  organizationId: string
  onSuccess?: () => void
}

export function AddInvitation({ organizationId, onSuccess }: AddInvitationProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const utils = api.useUtils()

  const form = useForm<AddInvitationValues>({
    resolver: zodResolver(addInvitationSchema),
    defaultValues: {
      email: "",
      role: "member",
    },
  })

  const { mutateAsync: createInvitation } = api.organization.createInvitation.useMutation({
    onSuccess: () => {
      toast.success("Invito inviato con successo")
      utils.organization.getInvitations.invalidate()
      setIsOpen(false)
      form.reset()
      onSuccess?.()
    },
    onError: (error) => {
      toast.error(error.message || "Errore durante l'invio dell'invito")
    },
  })

  async function onSubmit(values: AddInvitationValues) {
    try {
      setIsLoading(true)
      await createInvitation({
        organizationId,
        email: values.email,
        role: values.role,
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button>Invita membro</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Invita un nuovo utente</DialogTitle>
          <DialogDescription>
            Inserisci l'indirizzo email e seleziona il ruolo per l'invito.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input placeholder="nome@esempio.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ruolo</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona un ruolo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="owner">Proprietario</SelectItem>
                      <SelectItem value="admin">Amministratore</SelectItem>
                      <SelectItem value="member">Membro</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Invio in corso..." : "Invia Invito"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}