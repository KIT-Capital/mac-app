import { handleContractsPdf } from "@/lib/contract/pdf-request-policy.mjs";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleContractsPdf(request, process.env);
}
