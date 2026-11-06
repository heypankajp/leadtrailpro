import { api } from "@/lib/api";
import type { MapsOverview } from "./model";

export const fetchMapsUsage = () => api<{ usage: MapsOverview }>("/api/maps/usage");
