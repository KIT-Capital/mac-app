export type TutorialStep = {
  title: string;
  body: string;
};

export type Tutorial = {
  title: string;
  lead: string;
  steps: readonly TutorialStep[];
};

export const COLLECTOR_TUTORIAL = {
  title: "How MAC works",
  lead: "Mechanical Art Capital buys qualifying timepieces. You may buy them back later at the scheduled dollar price for that month. This is a sale and repurchase.",
  steps: [
    {
      title: "Sign in from your email",
      body: "Enter the address on your collection. MAC sends a one-time link. It lasts fifteen minutes and works once. There is no collector password.",
    },
    {
      title: "Add each timepiece",
      body: "Photograph the front, back, left and right sides of the barrel, and the clasp. Confirm that you have the box and original documentation. Box and papers photographs are optional.",
    },
    {
      title: "Ask the desk to appraise",
      body: "Saving a piece does not set a price. Request a certified appraisal. Desk specialists review the photographs and write the valuation. Only the desk can change that number afterward.",
    },
    {
      title: "Send a sale application when you are ready",
      body: "Choose a term and an amount up to the purchase cap for that piece. Scheduled buyback prices and custody details stay off this app until that application is in.",
    },
    {
      title: "Buy the pieces back later if you choose",
      body: "The repurchase screen shows the scheduled dollar price for the month you select. After MAC pays the sale amount it does not owe a remaining balance. You may still buy the pieces back at that month’s scheduled price.",
    },
    {
      title: "Keep your account current",
      body: "Account holds membership, appearance (dark or light), and profile details. Contact us reaches the desk. Open this guide any time from the menu.",
    },
  ] satisfies TutorialStep[],
} as const satisfies Tutorial;

export const DESK_TUTORIAL = {
  title: "How the desk works",
  lead: "The admin wall is the staff console for the repo operations book. MAC buys; the collector may buy back. Cash stays in ABC Bank. Inventory stays in the MAC Vault. This app does not post QuickBooks.",
  steps: [
    {
      title: "Overview",
      body: "The first desk screen is a 16:9 summary of assets, catalog references, agreements, and photos. Policy in force is the live desk settings when the live book is on.",
    },
    {
      title: "Configure",
      body: "Default purchase cap, Scenario 60 (setup, monthly add, and early amount), typical term, close window, and vault copy live here. Appearance is not a desk setting. Changing money math needs owner approval.",
    },
    {
      title: "Timepiece catalog",
      body: "Manufacturer references the collector matches at intake. Keep names and references accurate so applications land on known models.",
    },
    {
      title: "Client assets",
      body: "Collectors send pieces as Reviewing. Staff move them to Appraised and enter the valuation. The collector cannot edit that value after Appraise.",
    },
    {
      title: "Repo agreements",
      body: "Every live agreement uses the same six labels: open, past due, bought back, in liquidation, liquidated, renewed. Open and past due are derived from the term. Staff record one current end. Only admin Renew closes a live repo at that month’s scheduled repurchase dollars and opens the successor.",
    },
    {
      title: "Photo vault and outbound mail",
      body: "Photos are intake evidence for the desk. Outbound Mail shows messages this server session prepared or sent. Collector sign-in mail is not this list.",
    },
    {
      title: "Access & roles",
      body: "Admin adds or disables staff accounts. Staff cannot manage access. Forced password rotation opens only the password page until the new password is set.",
    },
    {
      title: "Collector app",
      body: "Use Collector app at the bottom of this wall to see the member screens. Collectors never get a desk link in their own navigation. Reopen this tutorial from Tutorial in the desk menu.",
    },
  ] satisfies TutorialStep[],
} as const satisfies Tutorial;
