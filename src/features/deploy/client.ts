import { api } from "@/lib/api";
import type { DeployStatus } from "./model";

export const fetchDeployStatus = () => api<{ status: DeployStatus }>("/api/deploy").then((result) => result.status);
export const requestDeployNow = () => api<{ status: DeployStatus }>("/api/deploy", { method: "POST", json: {} }).then((result) => result.status);
export const setDeployPaused = (paused: boolean) => api<{ status: DeployStatus }>("/api/deploy", { method: "PATCH", json: { paused } }).then((result) => result.status);
