const DEVELOPMENT_DESK_ROLES = new Map([
  ["admin@mechartcap.com", "admin"],
  ["desk@mechartcap.com", "staff"],
]);

export function developmentDeskRole(email) {
  return DEVELOPMENT_DESK_ROLES.get(String(email ?? "").trim().toLowerCase()) ?? null;
}

export function isReservedDeskEmail(email) {
  return developmentDeskRole(email) !== null;
}
