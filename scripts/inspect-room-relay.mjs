#!/usr/bin/env node
/**
 * Temporary ROOMS E2EE inspector.
 *
 * Usage:
 *   node scripts/inspect-room-relay.mjs --help
 *   node scripts/inspect-room-relay.mjs --sample '{"v":2,"proto":"signal",...}'
 *
 * In the browser (npm run dev), watch the console for `[e2ee-inspect]`.
 * Disable with localStorage.setItem("darke.e2ee.inspect","0")
 */

function looksSignalV2(blob) {
  try {
    const rec = JSON.parse(blob);
    return (
      rec.v === 2 &&
      rec.proto === "signal" &&
      typeof rec.type === "number" &&
      typeof rec.body === "string" &&
      rec.body.length > 0
    );
  } catch {
    return false;
  }
}

function looksSenderKey(blob) {
  try {
    const rec = JSON.parse(blob);
    return (
      rec.v === 2 &&
      rec.proto === "signal-sk" &&
      typeof rec.groupId === "string" &&
      typeof rec.body === "string"
    );
  } catch {
    return false;
  }
}

function inspectWire(label, blob, secrets = []) {
  let proto = null;
  let type = null;
  try {
    const rec = JSON.parse(blob);
    proto = rec.proto ?? null;
    type = rec.type ?? null;
  } catch {
    proto = "not-json";
  }
  const leaks = secrets.filter(
    (secret) => secret && secret.length >= 8 && blob.includes(secret),
  );
  const report = {
    label,
    signalV2Pairwise: looksSignalV2(blob),
    senderKeyEnvelope: looksSenderKey(blob),
    proto,
    type,
    bytes: blob.length,
    plaintextNeedlesOnWire: leaks.length > 0,
    sample: blob.slice(0, 240) + (blob.length > 240 ? "…" : ""),
    pass: looksSignalV2(blob) && leaks.length === 0 && !looksSenderKey(blob),
    note:
      "pending_messages.encrypted_content must be pairwise Signal v2. Room SenderKey (signal-sk) and SKDM bytes live inside that ciphertext and are unwrapped on-device only.",
  };
  console.log(JSON.stringify(report, null, 2));
  return report.pass;
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.length === 0) {
  console.log(`DARKE rooms relay inspector (temporary)

1) Browser (preferred)
   npm run dev → send a room message / invite a member
   DevTools console → filter [e2ee-inspect]
   Expected:
     ROOM MSG → relay  pass:true  wire.proto:"signal"  plaintextOnWire:false  innerSenderKeyEnvelope:true
     SKDM → relay      pass:true  pairwisePrekeyOrSession:true  skdmRawOnWire:false
     on-device decrypt stage:"pairwise-mailbox" then stage:"sender-key"

2) Paste a copied pending_messages.encrypted_content value:
   node scripts/inspect-room-relay.mjs --sample "<json>"

Optional secrets check (must NOT appear on the wire):
   node scripts/inspect-room-relay.mjs --sample "<json>" --secret "hello room"
`);
  process.exit(0);
}

const sampleIdx = args.indexOf("--sample");
const secretIdx = args.indexOf("--secret");
const sample = sampleIdx >= 0 ? args[sampleIdx + 1] : "";
const secret = secretIdx >= 0 ? args[secretIdx + 1] : "";
if (!sample) {
  console.error("Missing --sample ciphertext JSON");
  process.exit(1);
}
const ok = inspectWire("pending_messages.encrypted_content", sample, secret ? [secret] : []);
process.exit(ok ? 0 : 2);
