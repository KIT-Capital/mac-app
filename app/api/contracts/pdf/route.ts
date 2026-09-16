import { renderRepoContractPdf } from "@/lib/contract/repo-contract-pdf.mjs";
import { parseContractInput } from "@/lib/contract/repo-contract.mjs";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const parsed = parseContractInput(body ?? {});
  if (!parsed.ok) {
    return Response.json({ error: parsed.errors[0] }, { status: 400 });
  }
  const pdf = await renderRepoContractPdf(parsed.value);
  if (!pdf.ok || !pdf.bytes) {
    return Response.json({ error: pdf.errors[0] ?? "CONTRACT_PDF_FAILED" }, { status: 400 });
  }
  return new Response(Buffer.from(pdf.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="mac-repurchase-agreement.pdf"',
    },
  });
}
