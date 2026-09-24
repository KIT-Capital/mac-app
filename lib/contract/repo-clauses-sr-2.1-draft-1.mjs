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
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function longDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ""));
  if (!match) return String(value ?? "");
  const month = Number(match[2]);
  const date = Number(match[3]);
  if (month < 1 || month > 12 || date < 1 || date > 31) return String(value ?? "");
  return `${MONTHS[month - 1]} ${date}, ${match[1]}`;
}

export function buildDraftClauses(facts) {
  const collection = facts.collectionLines.join("; ") || "the timepieces named in this Agreement";
  const start = longDate(facts.startDate);
  const bodies = [
    `This Agreement is made by and between ${facts.sellerName} ("Seller") and ${facts.buyerName} ("Buyer"). Seller and Buyer are referred to together as the "Parties," and each as a "Party."`,
    `Seller hereby sells, assigns, and conveys to Buyer, and Buyer hereby purchases from Seller, ${collection} (the "Collection"), for ${facts.saleAmountLabel} (the "Sale Amount"). This transaction is a sale and repurchase, not a loan.`,
    "The sale includes each timepiece in the Collection, together with the boxes, certificates, and warranties stated for that timepiece, except any item the Parties exclude in a writing signed by both Parties.",
    "Buyer shall pay the Sale Amount to Seller. Delivery shall be made on the terms stated in this Agreement. Upon payment of the Sale Amount, Buyer shall owe Seller no further sum on account of the sale.",
    "During the Term, title to the Collection, and custody of the Collection, shall be and remain in Buyer.",
    "During the Term, Buyer shall not sell, transfer, or encumber the Collection in favor of any third party, except as this Agreement expressly permits.",
    `The term of this Agreement is ${facts.termMonths} months, commencing on ${start} (the "Term"). If a date set out in Schedule A falls on a Saturday, Sunday, or day on which commercial banks in New York, New York are authorized to close, that date shall be deemed to fall on the next such day on which those banks are open.`,
    "Seller may repurchase the Collection, in its entirety, by paying the repurchase price set forth in Schedule A for the month in which the repurchase occurs.",
    "Seller shall have no right to repurchase fewer than all of the timepieces in the Collection, unless both Parties so agree in a writing signed by both Parties.",
    "The repurchase price payable in each month of the Term is the price set forth opposite that month in Schedule A. Schedule A is attached to and made a part of this Agreement.",
    "Promptly after Buyer receives cleared funds in payment of the applicable repurchase price, Buyer shall return the Collection to Seller.",
    "If Seller does not repurchase the Collection during the Term, Buyer may retain the Collection or may sell the Collection to any person.",
    "Any repurchase price shall be paid in lawful money of the United States, by a method the Parties confirm in a writing signed by both Parties. This Agreement sets out no bank account number and no routing number.",
    "This Agreement, including Schedule A, constitutes the entire agreement of the Parties with respect to the subject matter hereof and supersedes all prior and contemporaneous agreements and understandings, whether written or oral, relating to that subject matter.",
    "Each notice under this Agreement shall be in writing and shall be given to the address that the receiving Party has designated for this transaction.",
    "Neither Party may assign this Agreement, or any right hereunder, without the prior written consent of the other Party; provided, however, that Buyer may assign this Agreement to an affiliate of Buyer.",
    "This Agreement shall be governed by, and construed in accordance with, the laws of the State of New York, without regard to any conflict-of-laws rule that would call for the application of the law of any other jurisdiction. Each Party submits to the exclusive jurisdiction of the state and federal courts sitting in the County of New York, State of New York.",
    "The Parties shall sign this Agreement in the signature blocks at the end hereof when the timepieces are delivered to Buyer. Each such signature constitutes that Party's acceptance of this Agreement. This Agreement may be signed in counterparts, each of which shall be deemed an original.",
    "Any instructions for the payment of money under this Agreement shall be set out in a separate writing signed by both Parties. This Agreement contains no bank account number and no routing number.",
  ];
  return CLAUSE_HEADINGS.map((heading, index) => ({
    number: index + 1,
    heading,
    body: bodies[index],
  }));
}
