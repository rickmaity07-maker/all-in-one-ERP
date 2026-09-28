"use client";

import { supabase } from "./supabase";
import { isTauri, type Row } from "./utils";

// Digitally signed credentials: Open Badges 3.0 as a VC-JWT, signed ES256 (ECDSA P-256) with the
// school's issuer key. Anyone can check the signature against the public key with no account.

// The desktop/phone apps have no public address, so links point at the hosted web version.
export const PUBLIC_SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://rickmaity07-maker.github.io/all-in-one-ERP";
export const siteBase = () =>
  typeof window === "undefined" || isTauri() ? PUBLIC_SITE : `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}`;
export const verifyUrl = (code: string) => `${siteBase()}/verify?code=${code}`;

const b64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));
const ALG = { name: "ECDSA", namedCurve: "P-256" } as const;

// The school's signing key; created on first use by an administrator.
export async function issuerPrivateKey(): Promise<CryptoKey> {
  const { data } = await supabase.from("issuer_keys").select("private_jwk").eq("id", "default").maybeSingle();
  if (data?.private_jwk) return crypto.subtle.importKey("jwk", data.private_jwk as JsonWebKey, ALG, false, ["sign"]);
  const pair = await crypto.subtle.generateKey(ALG, true, ["sign", "verify"]);
  const [pub, priv] = await Promise.all([crypto.subtle.exportKey("jwk", pair.publicKey), crypto.subtle.exportKey("jwk", pair.privateKey)]);
  const publicJwk = { kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y, kid: "default", alg: "ES256", use: "sig" };
  const { error } = await supabase.from("issuer_keys").insert({ id: "default", public_jwk: publicJwk, private_jwk: priv });
  if (error) {
    // Another administrator created it at the same moment: use theirs.
    const again = await supabase.from("issuer_keys").select("private_jwk").eq("id", "default").maybeSingle();
    if (!again.data) throw error;
    return crypto.subtle.importKey("jwk", again.data.private_jwk as JsonWebKey, ALG, false, ["sign"]);
  }
  return pair.privateKey;
}

// Signed documents always name the public web address, whichever app issued them.
export function openBadgeCredential(award: Row, badge: Row, holder: string) {
  const base = PUBLIC_SITE;
  return {
    "@context": ["https://www.w3.org/ns/credentials/v2", "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json"],
    id: `${base}/verify?code=${award.verification_code}`,
    type: ["VerifiableCredential", "OpenBadgeCredential"],
    issuer: { id: base, type: ["Profile"], name: "All-In-One ERP" },
    validFrom: new Date(award.issued_at).toISOString(),
    name: badge.name,
    credentialSubject: {
      type: ["AchievementSubject"],
      name: holder,
      achievement: {
        id: `${base}/credentials#${badge.id}`,
        type: ["Achievement"],
        name: badge.name,
        description: badge.description || badge.name,
        criteria: { narrative: badge.criteria || badge.description || badge.name },
        ...(badge.skills?.length ? { tag: badge.skills } : {}),
      },
    },
  };
}

export async function signCredential(credential: object, key: CryptoKey) {
  const input = `${enc({ alg: "ES256", typ: "vc+jwt", kid: "default" })}.${enc(credential)}`;
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(input));
  return `${input}.${b64url(sig)}`;
}

// Signs every award that has no signature yet (administrators only). Returns how many were signed.
export async function signPending(awards: Row[], badges: Row[], people: Record<string, string>) {
  const pending = awards.filter((a) => !a.credential_jwt && !a.revoked);
  if (!pending.length) return 0;
  const key = await issuerPrivateKey();
  let n = 0;
  for (const a of pending) {
    const badge = badges.find((b) => b.id === a.badge_id);
    if (!badge) continue;
    const jwt = await signCredential(openBadgeCredential(a, badge, people[a.student_id] ?? ""), key);
    const { error } = await supabase.from("badge_awards").update({ credential_jwt: jwt }).eq("id", a.id);
    if (!error) n++;
  }
  return n;
}

// Checks a VC-JWT against the issuer's public key. Returns the credential when the signature is valid.
export async function verifyCredentialJwt(jwt: string, publicJwk: JsonWebKey): Promise<Row | null> {
  try {
    const [h, p, s] = jwt.split(".");
    const header = JSON.parse(new TextDecoder().decode(fromB64url(h)));
    if (header.alg !== "ES256") return null;
    const key = await crypto.subtle.importKey("jwk", { kty: publicJwk.kty, crv: publicJwk.crv, x: publicJwk.x, y: publicJwk.y }, ALG, false, ["verify"]);
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, fromB64url(s), new TextEncoder().encode(`${h}.${p}`));
    return ok ? JSON.parse(new TextDecoder().decode(fromB64url(p))) : null;
  } catch {
    return null;
  }
}
