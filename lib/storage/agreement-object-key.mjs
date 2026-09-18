/**
 * Server-owned R2 key for a stored agreement PDF. Clients never supply this.
 * @param {{
 *   appEnv: string,
 *   customerId: string,
 *   liveAgreementId: string,
 *   version: number,
 *   documentId: string,
 * }} input
 */
export function agreementObjectKey(input) {
  return `${input.appEnv}/agreements/${input.customerId}/${input.liveAgreementId}/v${input.version}-${input.documentId}.pdf`;
}

/**
 * Presigned GET lifetime is at most five minutes.
 * @param {unknown} seconds
 */
export function cappedPresignExpires(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0 || value > 300) return 300;
  return Math.floor(value);
}
