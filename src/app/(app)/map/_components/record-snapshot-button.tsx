"use client";

import { Button } from "@/components/ui/button";
import { useRecordNetworkSnapshot } from "@/hooks/traffic/use-traffic";
import { toast } from "sonner";

/**
 * The only trigger for the snapshot ingest path. Nothing reads those snapshots
 * back yet — the read path is to land with whatever renders it.
 */
export const RecordSnapshotButton = () => {
  const recordSnapshot = useRecordNetworkSnapshot();

  const record = () =>
    recordSnapshot.mutate(undefined, {
      onError: (error) => toast.error(error.message),
      onSuccess: ({ recorded, failed }) => {
        const segments = recorded.reduce(
          (total, { segmentCount }) => total + segmentCount,
          0,
        );
        const message = `Recorded ${recorded.length} snapshots (${segments} segments)`;

        if (failed.length === 0) return toast.success(message);

        toast.warning(`${message} · ${failed.length} route(s) unavailable`);
      },
    });

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={recordSnapshot.isPending}
      onClick={record}
    >
      {recordSnapshot.isPending ? "Recording…" : "Record all snapshots"}
    </Button>
  );
};
