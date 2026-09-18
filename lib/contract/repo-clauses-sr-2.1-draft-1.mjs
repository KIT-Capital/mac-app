export const TEMPLATE_VERSION = "sr-2.1-draft-1";

export const CLAUSE_HEADINGS = [
  "Parties and complete agreement",
  "Sale of the named collection",
  "Included boxes, certificates, warranties, and exceptions",
  "Payment and delivery",
  "MAC ownership and custody during the term",
  "Restriction on third-party sale or encumbrance",
  "Term, expiration, and weekend or holiday handling",
  "Seller option to repurchase the complete collection",
  "No partial repurchase unless both parties agree in writing",
  "Monthly repurchase pricing schedule",
  "Return of the collection after cleared repurchase payment",
  "MAC rights if the seller does not repurchase during the term",
  "Repurchase payment method",
  "Entire agreement",
  "Confidentiality, communications, and notice",
  "Assignment",
  "Governing law and dispute resolution",
  "Seller and buyer signature blocks",
  "Annex A placeholder",
];

/**
 * @param {{
 *   sellerName: string,
 *   buyerName: string,
 *   saleAmountLabel: string,
 *   termMonths: number,
 *   startDate: string,
 *   collectionLines: string[],
 * }} facts
 */
export function buildDraftClauses(facts) {
  const collection = facts.collectionLines.join("; ") || "the named collection";
  const bodies = [
    `This writing is the complete sale and repurchase agreement between ${facts.sellerName} (Seller) and ${facts.buyerName} (Buyer).`,
    `Seller sells ${collection} to Buyer for ${facts.saleAmountLabel}. This is a sale and repurchase, not a loan.`,
    "The sale includes the named pieces together with stated boxes, certificates, and warranties, except items the parties list in writing.",
    `Buyer pays the sale amount. Delivery follows the stated terms. After Buyer pays, Buyer does not owe Seller a remaining balance.`,
    "During the term, title and custody of the collection are with Buyer.",
    "During the term Buyer will not sell or encumber the collection to a third party except as this agreement allows.",
    `The term is ${facts.termMonths} months beginning ${facts.startDate}. Weekend and holiday handling follows the schedule dates.`,
    "Seller may repurchase the complete collection by paying the scheduled dollar price for the month of repurchase.",
    "Seller may not repurchase only some pieces unless both parties agree in writing.",
    "The monthly repurchase prices are the schedule rows attached to this agreement.",
    "After Buyer receives cleared repurchase payment, Buyer returns the collection to Seller.",
    "If Seller does not repurchase during the term, Buyer may keep or sell the collection.",
    "Repurchase payment is in US dollars by a method the parties confirm in writing. This annex does not contain bank account or routing numbers.",
    "This writing and its schedule are the entire agreement on this sale and repurchase.",
    "Notices go to the addresses the parties have given for this transaction.",
    "Neither party assigns this agreement without the other party's written consent, except Buyer may assign to an affiliate.",
    "Counsel has not approved the governing-law or dispute-resolution wording. This draft does not resolve any conflict in the sample template.",
    "Signature lines are for later wet-ink or electronic signing. They are not an invitation to sign this draft.",
    "Annex A is a placeholder for approved wiring instructions. It contains no bank credentials.",
  ];
  return CLAUSE_HEADINGS.map((heading, index) => ({
    number: index + 1,
    heading,
    body: bodies[index],
  }));
}
