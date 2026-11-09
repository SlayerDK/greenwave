"use client";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useCreateDevice } from "@/hooks/devices/use-devices";
import {
  createDeviceSchema,
  type CreateDeviceInput,
} from "@/lib/devices/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

export const CreateDeviceForm = () => {
  const createDevice = useCreateDevice();

  const form = useForm<CreateDeviceInput>({
    resolver: zodResolver(createDeviceSchema),
    defaultValues: { name: "", location: "" },
  });

  const submit = (values: CreateDeviceInput) =>
    createDevice.mutate(values, {
      onError: (error) => toast.error(error.message),
      onSuccess: () => {
        toast.success("Device added");
        form.reset();
      },
    });

  return (
    <form
      className="flex flex-col gap-4 sm:flex-row sm:items-end"
      onSubmit={form.handleSubmit(submit)}
    >
      <Field className="sm:flex-1">
        <FieldLabel htmlFor="device-name">Name</FieldLabel>
        <Input id="device-name" {...form.register("name")} />
        <FieldError errors={[form.formState.errors.name]} />
      </Field>

      <Field className="sm:flex-1">
        <FieldLabel htmlFor="device-location">Location</FieldLabel>
        <Input id="device-location" {...form.register("location")} />
        <FieldError errors={[form.formState.errors.location]} />
      </Field>

      <Button type="submit" disabled={createDevice.isPending}>
        Add device
      </Button>
    </form>
  );
};
