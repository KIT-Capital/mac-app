export type WatchStatus = "not_evaluated" | "reviewing" | "appraised";

export type Timepiece = {
  id: string;
  brand: string;
  model: string;
  reference?: string;
  images: string[];
  status: WatchStatus;
  valueLow?: number;
  valueHigh?: number;
  financeable: boolean;
  condition: string;
  boxPapers: string;
  caseMetal: string;
  caseType: string;
  caseDiameter: string;
  dialColor: string;
  buckle: string;
  band: "strap" | "bracelet";
  bandMaterial: string;
  complication: string;
  evaluatedAt?: string;
};

export type AgreementStatus = "draft" | "pending_signature" | "signed";

export type Agreement = {
  id: string;
  watchIds: string[];
  amount: number;
  termMonths: number;
  delivery: string;
  ownerName: string;
  email: string;
  status: AgreementStatus;
  createdAt: string;
  signedAt?: string;
};

export type Profile = {
  name: string;
  email: string;
  phone: string;
  member: boolean;
  avatar: string;
};

export type AppState = {
  hydrated: boolean;
  user: Profile | null;
  timepieces: Timepiece[];
  agreements: Agreement[];
};
