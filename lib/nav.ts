import {
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

export const COLLECTOR_LINKS = [
  { href: "/collection", label: "Timepieces", icon: Clock },
  { href: "/collection/add", label: "Add a timepiece", icon: Plus },
  { href: "/repurchase", label: "Repurchase", icon: FileSignature },
  { href: "/contact", label: "Contact us", icon: Mail },
  { href: "/profile", label: "Account", icon: UserRound },
  { href: "/profile/preferences", label: "Preferences", icon: SlidersHorizontal },
  { href: "/profile/membership", label: "Membership", icon: Star },
  { href: "/profile/partners", label: "Partners", icon: UsersRound },
  { href: "/profile/settings", label: "Settings", icon: Settings },
] as const;

export const COLLECTOR_PRIMARY = COLLECTOR_LINKS.slice(0, 5);
