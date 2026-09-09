# Apple root certificates

Trust anchors for verifying App Store signed data — the transaction the app
posts after a purchase, and the notifications Apple sends afterwards. Both are
JWS with an x5c chain, and a chain is only worth checking against a root you
already have. Fetching these at runtime would defeat the point.

Downloaded from Apple and committed deliberately; they are public certificates,
not secrets:

| File | Source | Expires |
|---|---|---|
| `AppleIncRootCertificate.cer` | apple.com/appleca/ | 2035-02-09 |
| `AppleRootCA-G2.cer` | apple.com/certificateauthority/ | 2039-04-30 |
| `AppleRootCA-G3.cer` | apple.com/certificateauthority/ | 2039-04-30 |

`AppleComputerRootCertificate.cer` is deliberately absent. It appears in
Apple's own samples, but it expired on 2025-02-10 and an expired certificate
cannot be a trust anchor — carrying it would only suggest a fourth root is
being checked when nothing can validate against it.

Verify any of them with:

```
openssl x509 -inform DER -in certs/apple/AppleRootCA-G3.cer -noout -subject -enddate
```
