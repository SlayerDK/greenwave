"use server";

import { requireAuth } from "@/lib/auth/session";
import { deviceMutations } from "@/lib/devices/mutations";
import {
  createDeviceSchema,
  updateDeviceSchema,
  type CreateDeviceInput,
  type UpdateDeviceInput,
} from "@/lib/devices/schema";
import { type ActionResult } from "@/lib/utils/action-result";
import { safeAction } from "@/lib/utils/safe-action";
import { revalidatePath } from "next/cache";

const DEVICES_PATH = "/devices";

export const createDeviceAction = async (
  input: CreateDeviceInput,
): Promise<ActionResult<{ id: string }>> =>
  safeAction(async () => {
    const { user } = await requireAuth();

    const parsed = createDeviceSchema.safeParse(input);
    if (!parsed.success)
      return { success: false, error: parsed.error.issues[0].message };

    const { id } = await deviceMutations.create({
      ...parsed.data,
      ownerId: user.id,
    });

    revalidatePath(DEVICES_PATH);
    return { success: true, data: { id } };
  });

export const renameDeviceAction = async (
  input: UpdateDeviceInput,
): Promise<ActionResult<{ id: string }>> =>
  safeAction(async () => {
    const { user } = await requireAuth();

    const parsed = updateDeviceSchema.safeParse(input);
    if (!parsed.success)
      return { success: false, error: parsed.error.issues[0].message };

    const { count } = await deviceMutations.rename(
      parsed.data.id,
      user.id,
      parsed.data.name,
    );
    if (count === 0) return { success: false, error: "Device not found." };

    revalidatePath(DEVICES_PATH);
    return { success: true, data: { id: parsed.data.id } };
  });

export const deleteDeviceAction = async (
  id: string,
): Promise<ActionResult<{ id: string }>> =>
  safeAction(async () => {
    const { user } = await requireAuth();

    const { count } = await deviceMutations.remove(id, user.id);
    if (count === 0) return { success: false, error: "Device not found." };

    revalidatePath(DEVICES_PATH);
    return { success: true, data: { id } };
  });
