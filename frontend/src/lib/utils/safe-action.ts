import { type ActionResult } from "@/lib/utils/action-result";
import { unstable_rethrow } from "next/navigation";

const UNEXPECTED_ERROR = "Something went wrong. Please try again.";

export const safeAction = async <T>(
  run: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> => {
  try {
    return await run();
  } catch (error) {
    unstable_rethrow(error);

    console.error(error);
    return { success: false, error: UNEXPECTED_ERROR };
  }
};
