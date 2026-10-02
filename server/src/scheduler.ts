import { enqueue } from "./jobs/queue";

export function startScheduler() {
  setInterval(() => {
    enqueue("check_missed_sessions", {}).catch((e) => console.error("[scheduler]", e));
  }, 60_000);
}
