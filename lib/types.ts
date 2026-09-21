export type WatchStatus = "not_evaluated" | "reviewing" | "appraised";
/** Retail roles live on the front of the app; desk roles enter `/admin`. See `lib/roles.mjs`. */
export type RetailRole = "collector" | "dealer";
export type DeskRole = "admin" | "appraiser" | "super_admin";
export type Role = RetailRole | DeskRole;
export type UserStatus = "active" | "invited" | "suspended";
export type PhotoKind =
  | "front"
  | "back"
  | "left"
  | "right"
  | "clasp"
  | "more"
  | "buckle"
  | "box"
  | "papers"
  | "other";
export type Appearance = "dark" | "light";

export type Timepiece = {
  id: string;
  ownerEmail?: string;
  brand: string;
  model: string;
  reference?: string;
  images: string[];
  photoKinds?: PhotoKind[];
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
  /** Derived from appraisalAttempts at read; never the source of truth. */
  appraisalState?: AppraisalStateWord;
  decisionsUsed?: number;
  appraisalValue?: number;
};

export type AppraisalAttemptStatus =
  | "under_review"
  | "returned"
  | "accepted"
  | "refused";

export type AppraisalStateWord =
  | "not_sent"
  | "with_mac"
  | "accepted"
  | "not_accepted"
  | "closed";

export type AppraisalSnapshotFields = Pick<
  Timepiece,
  | "brand"
  | "model"
  | "reference"
  | "condition"
  | "boxPapers"
  | "caseMetal"
  | "caseType"
  | "caseDiameter"
  | "dialColor"
  | "buckle"
  | "band"
  | "bandMaterial"
  | "complication"
>;

export type AppraisalSnapshot = {
  fields: AppraisalSnapshotFields;
  note: string;
  /** Projection to restore when a first, undecided submission is returned. */
  baseline?: {
    status: WatchStatus;
    financeable: boolean;
    valueLowCents?: number;
    valueHighCents?: number;
    evaluatedAt?: string;
  };
  /** Browser snapshots are behavioral demos, not retained evidence. */
  book?: "browser";
};

export type AppraisalAttempt = {
  id: string;
  timepieceId: string;
  customerId?: string;
  attemptNo: number;
  decisionNo: number | null;
  status: AppraisalAttemptStatus;
  note: string;
  responseNote?: string;
  snapshot: AppraisalSnapshot;
  submittedAt: string;
  decidedByStaffId?: string;
  decidedAt?: string;
  valueCents?: number;
  rangeLowCents?: number;
  rangeHighCents?: number;
  finalizedAt?: string;
  finalizedByStaffId?: string;
  finalizedAgreementId?: string;
  inspectedValueCents?: number;
  reopenedCount: number;
};

export type AppraisalAttemptPhoto = {
  attemptId: string;
  photoId: string;
  kind: PhotoKind;
  originalKey?: string;
  checksum?: string;
  book?: "browser";
};

/**
 * Request states (KTD6) plus the three legacy values, which exist only until
 * `legacyAgreementToRequest` maps a row once.
 */
export type AgreementStatus =
  | "submitted"
  | "returned"
  | "collector_signed"
  | "inspecting"
  | "executed"
  | "closed"
  | "draft"
  | "pending_signature"
  | "signed";

export type RequestCloseReason =
  | "declined_by_desk"
  | "declined_by_collector"
  | "withdrawn"
  | "expired";

export type BookEndKind = "bought_back" | "in_liquidation" | "liquidated" | "renewed";
export type BookLabel =
  | "open"
  | "past due"
  | "bought back"
  | "in liquidation"
  | "liquidated"
  | "renewed";

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
  /** Collector or dealer at apply/renew. Does not follow later profile edits. */
  partyKind?: RetailRole;
  /** Member ID of the retail party at apply. Desk people never have one. */
  memberId?: string | null;
  status: AgreementStatus;
  createdAt: string;
  signedAt?: string;
  agreementCode?: string;
  bookEnd?: AgreementEnd;
  scale?: RepoScaleTerms;
  /** The day the repo went on the book. The term clock starts here (KTD7). */
  executedOn?: string;
  deliveredOn?: string;
  /** Bumped whenever the amount or the pieces change (KTD6). */
  version?: number;
  lastActionAt?: string;
  closeReason?: RequestCloseReason;
  /** Desk-only flag; never serialized to a retail reader (KTD22). */
  customerSuccess?: boolean;
  paymentReference?: string;
  /** Per-piece caps frozen at Apply so a later appraisal never reprices it. */
  pieceCaps?: Record<string, number>;
  signatures?: AgreementSignature[];
  /** Browser-book thread; live mode loads the same shape from the documents GET. */
  events?: RequestEvent[];
};

export type RequestEvent = {
  action: string;
  toStatus?: string;
  createdAt: string;
  amount?: number;
  version?: number;
  note?: string;
  internal?: boolean;
};

export type AgreementSignature = {
  id: string;
  version: number;
  party: "collector" | "mac";
  typedName: string;
  snapshotHash: string;
  book: "live" | "browser";
  signedAt: string;
};

export type UserPreferences = {
  appearance: Appearance;
  pushNotifications: boolean;
  emailUpdates: boolean;
  smsUpdates: boolean;
  whatsappUpdates: boolean;
  preferredContact: "email" | "phone" | "whatsapp";
  language: "en";
};

export type Profile = {
  name: string;
  email: string;
  phone: string;
  member: boolean;
  /** `{PREFIX}{#####}-{YY}` for retail people. Desk staff never have one. */
  memberId?: string | null;
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
  memberId?: string | null;
  lastActive: string;
};

export type CatalogBrand = {
  id: string;
  name: string;
  tier: 1 | 2;
  slug: string;
  logoAssetKey: string | null;
  retailVisible: boolean;
  sortOrder: number;
};

export type CatalogEntry = {
  id: string;
  brandId: string;
  brand: string;
  model: string;
  reference: string;
  caseMetal: string;
  caseDiameter: string;
  typicalLow: number;
  typicalHigh: number;
  financeable: boolean;
  notes: string;
  retailVisible: boolean;
  photoObjectKey: string | null;
  photoSourceUrl: string;
  photoLicense: string;
  photoAttribution: string;
  marketSourceUrls: string[];
  marketRetrievedOn: string | null;
  lastEditedByStaffId: string | null;
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

export type ApplicationPurchaseShares = Record<string, number>;

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
  requiredPhotoKinds: PhotoKind[];
  brandPreset: "mac" | "mbf";
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
  brands: CatalogBrand[];
  shells: AgreementShell[];
  photos: PhotoRecord[];
  appraisalAttempts: AppraisalAttempt[];
  appraisalAttemptPhotos: AppraisalAttemptPhoto[];
  settings: AppSettings;
  applicationPurchaseShares?: ApplicationPurchaseShares;
  profiles: Record<string, Profile>;
};
