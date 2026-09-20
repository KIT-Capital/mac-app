import { INSPECTION_CONDITION } from "./contract/repo-agreement-snapshot.mjs";

export const REQUEST_NOTICE_KINDS = [
  "request_submitted",
  "request_confirmed",
  "request_declined",
  "request_withdrawn",
  "request_signed",
  "request_inspected",
  "request_expired",
];

const NOT_A_LOAN = "This is a sale and repurchase, not a loan.";

/**
 * @param {string} kind
 * @param {{
 *   name: string,
 *   email: string,
 *   watch?: string,
 *   amount?: string,
 *   delivery?: string,
 *   termMonths?: number,
 *   message?: string,
 *   deskEmail: string,
 * }} input
 */
export function composeRequestNotices(kind, input) {
  const code = String(input.watch || "your request");
  const amount = String(input.amount || "—");
  const delivery = String(input.delivery || "—");
  const term = input.termMonths ? `${input.termMonths} months` : "—";
  const greeting = String(input.name || "Collector").split(" ")[0] || "Collector";
  const facts = [
    ["Request", code],
    ["Seller", input.name],
    ["Email", input.email],
    ["Proposed sale", amount],
    ["Term", term],
    ["Delivery", delivery],
  ];
  const footer = `${NOT_A_LOAN}\n${INSPECTION_CONDITION}`;

  switch (kind) {
    case "request_submitted":
      return [
        {
          audience: "desk",
          to: [input.deskEmail],
          replyTo: input.email,
          subject: `Request submitted: ${code}`,
          heading: "New repo request",
          intro: `${input.name} submitted a sale-and-repurchase request. MAC may still decline after inspection.`,
          rows: facts,
          body: footer,
        },
        {
          audience: "retail",
          to: [input.email],
          subject: `We received your request ${code}`,
          heading: `Thank you, ${greeting}`,
          intro: "MAC has your request. A partner will confirm or decline. MAC accepts only after inspection and may still say no.",
          rows: facts,
          body: footer,
        },
      ];
    case "request_confirmed":
      return [
        {
          audience: "retail",
          to: [input.email],
          subject: `Your turn to sign ${code}`,
          heading: `${greeting}, MAC confirmed your request`,
          intro: "Sign the proposal when you are ready. MAC still inspects every piece before it executes.",
          rows: facts,
          body: footer,
        },
      ];
    case "request_declined":
      return [
        {
          audience: "retail",
          to: [input.email],
          subject: `MAC declined request ${code}`,
          heading: `${greeting}, this request is closed`,
          intro: "The Desk declined this request. The pieces are released from it.",
          rows: facts,
          body: footer,
        },
      ];
    case "request_withdrawn":
      return [
        {
          audience: "desk",
          to: [input.deskEmail],
          subject: `Request withdrawn: ${code}`,
          heading: "Collector withdrew a request",
          intro: `${input.name} withdrew ${code}.`,
          rows: facts,
          body: footer,
        },
      ];
    case "request_signed":
      return [
        {
          audience: "desk",
          to: [input.deskEmail],
          subject: `Request signed: ${code}`,
          heading: "Collector signed",
          intro: `${input.name} signed ${code}. Delivery: ${delivery}.`,
          rows: facts,
          body: footer,
        },
        {
          audience: "retail",
          to: [input.email],
          subject: `You signed ${code}`,
          heading: `${greeting}, next is delivery`,
          intro: `Bring or send the pieces as agreed: ${delivery}. MAC inspects them before it executes.`,
          rows: facts,
          body: footer,
        },
      ];
    case "request_inspected":
      return [
        {
          audience: "retail",
          to: [input.email],
          subject: `New amount to sign for ${code}`,
          heading: `${greeting}, inspection changed the sale amount`,
          intro: `The inspected sale amount is ${amount}. Sign the returned proposal if you still want to proceed.`,
          rows: facts,
          body: footer,
        },
      ];
    case "request_expired":
      return [
        {
          audience: "desk",
          to: [input.deskEmail],
          subject: `Request expired: ${code}`,
          heading: "A request expired",
          intro: `${code} closed because its window ran out.`,
          rows: facts,
          body: footer,
        },
        {
          audience: "retail",
          to: [input.email],
          subject: `Request ${code} expired`,
          heading: `${greeting}, this request closed`,
          intro: "The window to act on this request ran out. You may start again from your collection.",
          rows: facts,
          body: footer,
        },
      ];
    default:
      return [];
  }
}

/** Collector declined a confirmed request: the Desk is told, not the collector. */
export function composeCollectorDeclineNotice(input) {
  const code = String(input.watch || "a request");
  return [
    {
      audience: "desk",
      to: [input.deskEmail],
      subject: `Collector declined request ${code}`,
      heading: "Collector declined",
      intro: `${input.name} declined ${code}.`,
      rows: [
        ["Request", code],
        ["Seller", input.name],
        ["Email", input.email],
      ],
      body: `${NOT_A_LOAN}\n${INSPECTION_CONDITION}`,
    },
  ];
}
