import { requireUser } from "@/lib/auth";
import { AuditTable } from "@/components/audit-table";

export default async function ExecutiveAuditPage() {
  await requireUser(["executive"]);
  return (
    <>
      <h1 className="pg">監査ログ</h1>
      <AuditTable />
    </>
  );
}
