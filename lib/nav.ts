import {
  BookOpen,
  Clock,
  FileSignature,
  Mail,
  Plus,
  Settings,
  SlidersHorizontal,
  Star,
  UserRound,
  UsersRound,
} from "lucide-react";
import { COLLECTOR_TUTORIAL } from "@/lib/tutorials";

export const COLLECTOR_PRIMARY = [
  { href: "/collection", label: "Timepieces", icon: Clock },
  { href: "/collection/add", label: "Add a timepiece", icon: Plus },
  { href: "/repurchase", label: "Repurchase", icon: FileSignature },
  { href: "/contact", label: "Contact us", icon: Mail },
  { href: "/profile", label: "Account", icon: UserRound },
] as const;

export const COLLECTOR_GUIDE = {
  href: "/guide",
  label: COLLECTOR_TUTORIAL.title,
  icon: BookOpen,
} as const;

export const COLLECTOR_LINKS = [
  ...COLLECTOR_PRIMARY,
  COLLECTOR_GUIDE,
  { href: "/profile/preferences", label: "Preferences", icon: SlidersHorizontal },
  { href: "/profile/membership", label: "Membership", icon: Star },
  { href: "/profile/partners", label: "Partners", icon: UsersRound },
  { href: "/profile/settings", label: "Settings", icon: Settings },
] as const;
