"use client";

import {
  createDeviceAction,
  deleteDeviceAction,
  renameDeviceAction,
} from "@/lib/devices/actions";
import {
  type CreateDeviceInput,
  type UpdateDeviceInput,
} from "@/lib/devices/schema";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

export const useCreateDevice = () => {
  const refresh = useRefreshOnSuccess();

  return useMutation({
    mutationFn: async (input: CreateDeviceInput) => {
      const result = await createDeviceAction(input);
      if (!result.success) throw new Error(result.error);

      return result.data;
    },
    onSuccess: refresh,
  });
};

export const useRenameDevice = () => {
  const refresh = useRefreshOnSuccess();

  return useMutation({
    mutationFn: async (input: UpdateDeviceInput) => {
      const result = await renameDeviceAction(input);
      if (!result.success) throw new Error(result.error);

      return result.data;
    },
    onSuccess: refresh,
  });
};

export const useDeleteDevice = () => {
  const refresh = useRefreshOnSuccess();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteDeviceAction(id);
      if (!result.success) throw new Error(result.error);

      return result.data;
    },
    onSuccess: refresh,
  });
};

/**
 * Reads are server-rendered, so a successful mutation re-renders the RSC tree
 * rather than invalidating a client cache. The action already revalidated the
 * server cache.
 */
const useRefreshOnSuccess = () => {
  const router = useRouter();

  return () => router.refresh();
};
