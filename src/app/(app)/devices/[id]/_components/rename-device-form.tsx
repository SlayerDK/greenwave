"use client";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useRenameDevice } from "@/hooks/devices/use-devices";
import {
  updateDeviceSchema,
  type UpdateDeviceInput,
} from "@/lib/devices/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

export const RenameDeviceForm = ({
  id,
  name,
}: {
  id: string;
  name: string;
}) => {
  const renameDevice = useRenameDevice();

  const form = useForm<UpdateDeviceInput>({
    resolver: zodResolver(updateDeviceSchema),
    defaultValues: { id, name },
  });

  const submit = (values: UpdateDeviceInput) =>
    renameDevice.mutate(values, {
      onError: (error) => toast.error(error.message),
      onSuccess: () => toast.success("Device renamed"),
    });

  return (
    <form
      className="flex flex-col gap-4 sm:flex-row sm:items-end"
      onSubmit={form.handleSubmit(submit)}
    >
      <Field className="sm:flex-1">
        <FieldLabel htmlFor="rename-device">Name</FieldLabel>
        <Input id="rename-device" {...form.register("name")} />
        <FieldError errors={[form.formState.errors.name]} />
      </Field>

      <Button type="submit" disabled={renameDevice.isPending}>
        Rename
      </Button>
    </form>
  );
};
