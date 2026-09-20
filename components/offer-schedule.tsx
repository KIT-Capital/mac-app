import { money } from "@/lib/catalog";
import { repurchaseSchedule, resolveScale } from "@/lib/contract/repo-scale.mjs";

function moneyExact(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function OfferSchedule({
  amount,
  maxPurchase,
  termMonths,
  startDate,
  scale,
}: {
  amount: number;
  maxPurchase: number;
  termMonths: number;
  startDate: string;
  scale?: Record<string, unknown> | null;
}) {
  const tenor = resolveScale(scale ?? {}, termMonths);
  const schedule = amount > 0
    ? repurchaseSchedule({
        ...tenor,
        saleAmount: amount,
        termMonths,
        startDate,
      })
    : null;

  return (
    <section
      data-testid="offer-schedule"
      className="rounded-xl border border-mac-line bg-mac-card p-3"
    >
      <p className="text-[10px] font-bold tracking-[0.16em] text-[#E8D5C0] uppercase">
        This offer
      </p>
      <p className="mt-1 text-[13px] text-mac-muted">
        Maximum {maxPurchase ? money(maxPurchase) : "—"}
      </p>
      <p className="text-2xl font-bold text-mac-fg">{amount ? money(amount) : "—"}</p>
      {schedule?.ok ? (
        <div className="mt-3 max-h-40 overflow-y-auto">
          <table className="w-full text-left text-[12px] text-mac-muted">
            <caption className="sr-only">Repurchase schedule</caption>
            <thead>
              <tr className="text-[10px] tracking-[0.12em] text-mac-faint uppercase">
                <th className="pb-1 font-semibold">Month</th>
                <th className="pb-1 font-semibold">Date</th>
                <th className="pb-1 font-semibold">Price</th>
              </tr>
            </thead>
            <tbody>
              {schedule.rows.map((row) => (
                <tr key={row.month}>
                  <td>{row.month}</td>
                  <td>{row.date ?? ""}</td>
                  <td>{moneyExact(row.price || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
