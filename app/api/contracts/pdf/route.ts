import { renderRepoContractPdf } from "@/lib/contract/repo-contract-pdf.mjs";
import { parseContractInput } from "@/lib/contract/repo-contract.mjs";

export const dynamic = "force-dynamic";

const ERROR_TEXT = {
  INVALID_JSON: "The contract request was not valid JSON.",
  SELLER_NAME_REQUIRED: "Seller name is required.",
  SALE_AMOUNT_REQUIRED: "Sale amount is required.",
  SCALE_TERMS_INVALID: "Repurchase terms are invalid.",
  START_DATE_INVALID: "Agreement date is invalid.",
  TIMEPIECES_REQUIRED: "At least one timepiece is required.",
  TIMEPIECES_LIMIT: "A contract can list at most 24 timepieces.",
  CONTRACT_PDF_FAILED: "The contract PDF could not be created.",
  CONTRACT_FORBIDDEN_LANGUAGE: "Contract copy used forbidden language.",
};

function jsonError(code: string, status: number, extras: string[] = []) {
  return Response.json(
    { error: ERROR_TEXT[code as keyof typeof ERROR_TEXT] ?? code, code, errors: extras.length ? extras : [code] },
    { status },
  );
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return jsonError("INVALID_JSON", 400);
  }
  const parsed = parseContractInput(body);
  if (!parsed.ok) {
    return jsonError(parsed.errors[0], 400, parsed.errors);
  }
  try {
    const pdf = await renderRepoContractPdf(parsed.value);
    if (!pdf.ok || !pdf.bytes) {
      return jsonError(pdf.errors[0] ?? "CONTRACT_PDF_FAILED", 400, pdf.errors);
    }
    return new Response(Buffer.from(pdf.bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="mac-repurchase-agreement.pdf"',
      },
    });
  } catch {
    return jsonError("CONTRACT_PDF_FAILED", 500);
  }
}
