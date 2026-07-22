import { requireUser } from "@/lib/auth";
import { AuditTable } from "@/components/audit-table";

export default async function AdminAuditPage() {
  await requireUser(["admin"]);
  return (
    <>
      <h1 className="pg">監査ログ</h1>
      <AuditTable />
    </>
  );
}
