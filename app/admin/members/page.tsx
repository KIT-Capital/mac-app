"use client";

import Link from "next/link";
import { AdminChrome, AdminTable } from "@/components/admin-chrome";
import { ownedCounts, retailMembers } from "@/lib/owners";
import { useStore } from "@/lib/store";

export default function AdminMembersPage() {
  const { users, agreements, timepieces } = useStore();
  const members = retailMembers(users);

  return (
    <AdminChrome title="Members">
      <p className="mb-4 max-w-2xl text-sm text-white/55">
        Collectors and dealers of this tenant. Member IDs look like MAC12345-22 and never belong to
        desk staff. Repo forms take name, contacts, and party from this profile.
      </p>
      {!members.length ? (
        <p className="rounded-2xl border border-dashed border-white/15 bg-[#161B24] p-6 text-sm text-white/50">
          No retail members yet.
        </p>
      ) : (
        <AdminTable
          headers={["Member ID", "Name", "Party", "Email", "Phone", "Pieces", "Repos"]}
          rows={members.map((member) => {
            const counts = ownedCounts(member.email, timepieces, agreements);
            return [
              member.memberId || "—",
              <Link key={member.id} href="/admin/assets" className="text-mac-gold">
                {member.name}
              </Link>,
              member.role,
              member.email,
              member.phone || "—",
              String(counts.pieces),
              String(counts.agreements),
            ];
          })}
        />
      )}
    </AdminChrome>
  );
}
