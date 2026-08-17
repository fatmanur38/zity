export function createZip321Uri(recipient, amount) {
  if (typeof recipient !== "string" || recipient.length < 20) {
    throw new TypeError("A valid recipient is required.");
  }
  return `zcash:${recipient}?amount=${amount}`;
}

export function isRecognizableTestnetRecipient(recipient) {
  const normalized = String(recipient).toLowerCase();
  return ["utest1", "ztestsapling1", "tutest1", "textest1", "tm", "t2"].some((prefix) =>
    normalized.startsWith(prefix),
  );
}
