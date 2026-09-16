export type WatchStatus = "not_evaluated" | "reviewing" | "appraised";
export type Role = "collector" | "staff" | "admin";
export type UserStatus = "active" | "invited" | "suspended";
export type PhotoKind = "front" | "back" | "left" | "more" | "buckle" | "papers" | "other";
export type Appearance = "dark" | "light";

export type Timepiece = {
  id: string;
  ownerEmail?: string;
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
  assetCode?: string;
};

export type AgreementStatus = "draft" | "pending_signature" | "signed";

export type BookEndKind = "bought_back" | "in_liquidation" | "liquidated";
export type BookLabel = "open" | "past due" | "bought back" | "in liquidation" | "liquidated";

export type AgreementEnd = {
  kind: BookEndKind;
  date: string;
  amount: number;
};

export type RepoScaleTerms = {
  purchaseShare: number;
  setupFee: number;
  annualAdjustment: number;
  earlyRepurchaseAmount: number;
  brokerFee: number;
  minMonths: number;
  earlyStartMonth: number;
  earlyUntilMonth: number;
};

export type ContractPiece = {
  name?: string;
  brand?: string;
  model?: string;
  reference?: string;
  serial?: string;
  condition?: string;
};

export type ContractInput = {
  sellerName: string;
  sellerEmail?: string;
  sellerPhone?: string;
  saleAmount: number;
  termMonths: number;
  startDate: string;
  delivery?: string;
  agreementCode?: string;
  scale?: RepoScaleTerms;
  timepieces: ContractPiece[];
};

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
  agreementCode?: string;
  bookEnd?: AgreementEnd;
  scale?: RepoScaleTerms;
};

export type UserPreferences = {
  appearance: Appearance;
  pushNotifications: boolean;
  emailUpdates: boolean;
  smsUpdates: boolean;
  preferredContact: "email" | "phone";
  language: "en";
};

export type Profile = {
  name: string;
  email: string;
  phone: string;
  member: boolean;
  avatar: string;
  role: Role;
  onboardingComplete: boolean;
  applicationSubmitted?: boolean;
  promoCode?: string | null;
  preferences: UserPreferences;
};

export type ManagedUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  status: UserStatus;
  member: boolean;
  lastActive: string;
};

export type CatalogEntry = {
  id: string;
  brand: string;
  model: string;
  reference: string;
  caseMetal: string;
  caseDiameter: string;
  typicalLow: number;
  typicalHigh: number;
  financeable: boolean;
  notes: string;
};

export type AgreementShell = {
  id: string;
  code: string;
  title: string;
  termMonths: number;
  rate: number;
  ltv: number;
  setupFee?: number;
  earlyRepurchaseAmount?: number;
  brokerFee?: number;
  minMonths?: number;
  earlyStartMonth?: number;
  earlyUntilMonth?: number;
  status: "open" | "assigned" | "closed";
  createdAt: string;
};

export type PhotoRecord = {
  id: string;
  url: string;
  kind: PhotoKind;
  assetId?: string;
  caption: string;
  uploadedAt: string;
  ownerEmail: string;
};

export type AppSettings = {
  companyName: string;
  phone: string;
  email: string;
  financingEmail: string;
  handle: string;
  startingRate: number;
  minAdvance: number;
  maxLtv: number;
  setupFee: number;
  earlyRepurchaseAmount: number;
  brokerFee: number;
  minMonths: number;
  earlyStartMonth: number;
  earlyUntilMonth: number;
  typicalTerm: number;
  membershipMonthly: number;
  minPieceValue: number;
  closeBusinessDays: number;
  vaultLocation: string;
  requireFourPhotos: boolean;
  ageMinimum: number;
  allowVideo: boolean;
  appearance: Appearance;
};

export type AppState = {
  hydrated: boolean;
  user: Profile | null;
  timepieces: Timepiece[];
  agreements: Agreement[];
  users: ManagedUser[];
  catalog: CatalogEntry[];
  shells: AgreementShell[];
  photos: PhotoRecord[];
  settings: AppSettings;
  profiles: Record<string, Profile>;
};
