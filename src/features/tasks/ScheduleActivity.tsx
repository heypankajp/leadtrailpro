"use client";

import type { ReactNode } from "react";
import { Clock3, Flag, Mail, MapPin, Phone, Users, UtensilsCrossed } from "lucide-react";
import type { TaskActivityType } from "./model";

/**
 * The icon of each activity type, shared by the Schedule an Activity dialog (`TaskFormDialog`), the Activity List, the
 * Activity Calendar, the day agenda and the deal page. Until November 19, 2026 this file also held a second, smaller
 * form for the deal page and the board card; every place now opens the one dialog.
 */
export const activityIcons: Record<TaskActivityType, ReactNode> = {
  call: <Phone size={14} />, meeting: <Users size={14} />, task: <Clock3 size={14} />, deadline: <Flag size={14} />,
  email: <Mail size={14} />, lunch: <UtensilsCrossed size={14} />, visit: <MapPin size={14} />,
};
