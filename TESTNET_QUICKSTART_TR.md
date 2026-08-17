# ZITY — Zcash Testnet: Adım Adım Kurulum ve Canlıya Alma

Node, Docker veya zincir senkronu **gerektirmez**. Toplam süre ~15 dakika.

---

## Genel bakış — kim neye ihtiyaç duyuyor

İki farklı adres var, karıştırmayın:

| | Ne işe yarar | Kim kontrol eder |
|---|---|---|
| **Alıcı adres (R)** | ZITY'nin izlediği adres. Ödemeler buraya gelir. | **Siz** (operatör) |
| **Ödeyen cüzdan (P)** | QR'ı okutup ödemeyi yapar | Oyuncu / test eden |

Akış:

```
Faucet ──TAZ──► Ödeyen cüzdan P ──ödeme──► Alıcı adres R
                                              │
Tarayıcı ──► /api/testnet ──► public explorer ┘
```

> **Neden saydam (`tm…`) adres?** Public explorer'lar shielded (`z…`) çıktıların
> tutarını göremez — mahremiyetin amacı zaten bu. Kendi node'unuz olmadan
> doğrulama yapabilmek için alıcı adresin saydam olması şart. Kod bunu
> başlangıçta kontrol eder ve shielded adres verirseniz açıkça reddeder.

---

# ADIM 1 — Alıcı adresi (R) üretin

Projeye bunun için bağımlılıksız bir araç ekledim:

```sh
npm run testnet:address
```

Çıktı:

```
  Address (public — put this in .env):
    tmLHowGMYS8D3n3ddVX1VSjBuGsESpEbYbV

  Private key, WIF (SECRET — store offline, never commit):
    cVJt9...
```

- **Adres** → `.env` içine gider (public, sorun yok)
- **Private key** → offline saklayın. ZITY'nin buna **hiç ihtiyacı yok** —
  doğrulama sadece public zinciri okur, asla harcama yapmaz. Key yalnızca
  fonları geri çıkarmak isterseniz gerekir.

> Cüzdanınız varsa kendi saydam testnet adresinizi de kullanabilirsiniz.
> Tek şart: `tm…` veya `t2…` ile başlamalı ve **taze** olmalı.
> Ölçtüm: geçmişi boş adres **0.69 s**, 171.000 işlemli adres **~16 s**
> (zaman aşımına yol açar).

---

# ADIM 2 — Ödeyen cüzdanı (P) hazırlayın

Burada dürüst olmam gerek: **testnet cüzdanı kurmak işin en zahmetli kısmı.**
Doğruladığım güncel durum:

| Cüzdan | Durum (Ağustos 2026) |
|---|---|
| **YWallet** | ⚠️ Artık güncellenmiyor, ayrı testnet build'i yok. Önermiyorum. |
| **zkool2** | YWallet'ın halefi, aynı geliştirici. Testnet desteğini doğrulayamadım. |
| **Zingo CLI** (`zingolib`) | ✅ `--chain testnet` ile çalışır. Rust/cargo gerekir. |
| **Zashi** | Testnet için kaynaktan build gerekir. |

Cüzdan testnet'e bağlanırken bir **lightwalletd sunucusu** ister. Eskiden
yaygın olan `testnet.lightwalletd.com` ve
`lightwalletd.testnet.electriccoin.co` **kapanmış** (ikisini de test ettim).

Çalışan güncel sunucu:

```
https://testnet.zec.rocks:443
```

(Geçerli TLS sertifikası + gRPC/h2 ile doğruladım.)

Cüzdanınızda "lightwalletd server" / "custom server" alanına bunu girin.

---

# ADIM 3 — Faucet'ten testnet ZEC (TAZ) alın

👉 **https://zcashfaucet.jinolabs.xyz/**

Doğruladığım detaylar:

- Kabul ettiği adresler: `utest1…` / `ztestsapling…` / **`tm…`**
- Her istekte **0.1 TAZ**
- Cooldown: **adres başına 24 saatte 1**
- Gönderim shielded (z-to-z); saydam adrese gönderirse "bu drip publiktir"
  uyarısı gösteriyor

Adımlar:

1. Siteyi açın
2. Ödeyen cüzdanınızın adresini yapıştırın
3. İsteği gönderin
4. Genelde ~1 dakikada gelir (testnet blok süresi ~2.5 dk)

Yedek faucet: **https://fauzec.com/**
(`faucet.zecpages.com` ölü — test ettim, yanıt vermiyor.)

> 0.1 TAZ, varsayılan `0.001` ödeme tutarıyla ~100 test için yeter.

---

# ADIM 4 — `.env` doldurun

```sh
openssl rand -hex 32     # challenge secret üretin
```

`.env` içinde:

```dotenv
VITE_NETWORK_MODE=testnet
ZITY_NETWORK_MODE=testnet
ZITY_ZCASH_NETWORK=testnet
ZITY_TESTNET_PROVIDER=explorer

ZITY_TESTNET_RECEIVER_ADDRESS=tm...        # ADIM 1'deki adres
ZITY_TESTNET_CHALLENGE_SECRET=...          # yukarıdaki openssl çıktısı

ZITY_TESTNET_EXPLORER_URL=https://api.testnet.cipherscan.app
ZITY_TESTNET_PAYMENT_AMOUNT=0.001
ZITY_TESTNET_MIN_CONFIRMATIONS=1
ZITY_TESTNET_UNLOCK_POLICY=confirmed
```

---

# ADIM 5 — Yerelde çalıştırın

```sh
npm install
npm run dev
```

`npm run dev` artık `/api/testnet/*` rotalarını da servis ediyor — **`vercel dev`
veya Vercel hesabı gerekmez.** Dev sunucusu deployment'ın çalıştırdığı
**aynı** handler'ları çalıştırır.

Bağlantıyı doğrulayın:

```sh
curl -s http://localhost:5173/api/testnet/health
```

Beklenen:

```json
{"network":"testnet","providerMode":"real","connected":true,"synced":true,
 "blockHeight":4279488,"walletAvailable":true,"indexerAvailable":true}
```

`providerMode` **`real`** değilse UI ödeme akışını tamamen gizler — kasıtlı.

Açılacak adresler:

| URL | Ne yapar |
|---|---|
| `/demo` | Cüzdansız oynanır (sunum/inceleme için) |
| `/present` | Her zaman gerçek testnet |
| `/demo?network=testnet` | Demo akışı + gerçek testnet ödemesi |

---

# ADIM 6 — Oyun içi ödeme

1. Metro checkpoint'ine kadar ilerleyin
2. Ekranda **ZIP-321 QR** çıkar: `zcash:tm...?amount=0.00104109`
3. Cüzdanla okutun ve **tutarı aynen** ödeyin

   > Son haneler rastgele değil. Cüzdanımız olmadığı için her challenge'a
   > taze adres türetemiyoruz; onun yerine her challenge'ı **benzersiz tutar**
   > tanımlıyor. Yuvarlarsanız eşleşme olmaz.

4. Durum otomatik ilerler: `WAITING → CONFIRMING → VERIFIED → PROVE ACCESS`
5. `PROVE ACCESS` entitlement'ı **tüketir**; ikinci kullanım reddedilir

Onay süresi: testnet blok ~2.5 dk.

---

# ADIM 7 — Vercel'e canlı alma (ekip review'u için)

## 7.1 — GitHub'a push

```sh
git add -A
git commit -m "Add public-explorer testnet provider"
git push origin main
```

`.env` gitignore'da olduğu için sırlar **push edilmez**. Taradım: takipli
dosyalarda gerçek sır yok.

## 7.2 — Vercel'de projeyi import edin

1. **https://vercel.com/new** adresine gidin
2. GitHub hesabınızı bağlayın, **`fatmanur38/zity`** reposunu seçin
3. **Project Name** alanına **`zity`** yazın → URL `zity.vercel.app` olur

   > `zity` global olarak alınmışsa Vercel kabul etmez; o zaman
   > `zity-privacy` gibi bir ad seçip URL'i ona göre paylaşın.

4. Framework otomatik **Vite** algılanır — build ayarlarına dokunmayın
5. **Deploy** demeden önce 7.3'teki değişkenleri girin

## 7.3 — Environment Variables

Vercel'de **Settings → Environment Variables**. `VITE_` öneki olmayanlar
tarayıcıya **sızmaz**:

| Key | Value |
|---|---|
| `VITE_NETWORK_MODE` | `demo` |
| `ZITY_NETWORK_MODE` | `testnet` |
| `ZITY_ZCASH_NETWORK` | `testnet` |
| `ZITY_TESTNET_PROVIDER` | `explorer` |
| `ZITY_TESTNET_RECEIVER_ADDRESS` | ADIM 1'deki `tm…` adresi |
| `ZITY_TESTNET_CHALLENGE_SECRET` | `openssl rand -hex 32` çıktısı |
| `ZITY_TESTNET_EXPLORER_URL` | `https://api.testnet.cipherscan.app` |
| `ZITY_TESTNET_PAYMENT_AMOUNT` | `0.001` |
| `ZITY_TESTNET_MIN_CONFIRMATIONS` | `1` |
| `ZITY_TESTNET_UNLOCK_POLICY` | `confirmed` |
| `ZITY_TESTNET_EXPLORER_TIMEOUT_MS` | `15000` |

> `VITE_NETWORK_MODE=demo` + `ZITY_NETWORK_MODE=testnet` kombinasyonu bilinçli:
> siteye gelen herkes `/demo`'da cüzdansız oynayabilir, incelemek isteyen
> `/present`'ta gerçek testnet'i doğrulayabilir. Tek deployment, iki izleyici.

## 7.4 — Deploy sonrası kontrol

```sh
curl -s https://zity.vercel.app/api/testnet/health
```

`providerMode: "real"` ve gerçek `blockHeight` görmelisiniz.

## 7.5 — Ekibe paylaşacağınız linkler

| Link | Kime |
|---|---|
| `https://zity.vercel.app/demo` | Herkes — cüzdan gerekmez |
| `https://zity.vercel.app/present` | Zcash entegrasyonunu doğrulayacaklar |
| `https://zity.vercel.app/architecture` | Mimariyi inceleyecekler |

> ⚠️ Review edenler `/present`'ta metro checkpoint'ini geçmek için **kendi
> testnet ZEC'lerine** ihtiyaç duyar (ADIM 3). Bunu paylaşırken belirtin,
> yoksa akışın ortasında tıkanırlar. Cüzdansız tam oynanış için `/demo`.

## 7.6 — Rate limit (public açılmadan önce)

`POST /api/testnet/payment-challenge` public erişime açılacaksa Vercel WAF'ta
**IP başına 5 istek/dakika → 429** kuralı kurun. Explorer'ın kendi limiti de
100 istek/dakika/IP.

---

# Sorun giderme

| Belirti | Neden | Çözüm |
|---|---|---|
| `RECEIVER_NOT_CONFIGURED` | Adres boş | ADIM 1'i yapın, `.env`'e yazın |
| `RECEIVER_NOT_TRANSPARENT_TESTNET` | Shielded adres girilmiş | `tm…`/`t2…` kullanın |
| `CHALLENGE_SECRET_REQUIRED` | Sır yok/kısa | `openssl rand -hex 32` |
| `EXPLORER_TIMEOUT` | Alıcı adresin geçmişi çok kalabalık | Taze adres kullanın |
| `providerMode: "mock"` | `ZITY_NETWORK_MODE` testnet değil | Env'i düzeltin, redeploy |
| Ödeme `WAITING`'de kaldı | Tutar tam değil | QR'daki **tam** tutarı ödeyin |
| Dev'de env okunmuyor | Sunucu eski config'i yükledi | Dev sunucusunu yeniden başlatın |

---

# Bilinen sınırlar (dürüst liste)

1. **Saydam adres**, shielded değil. Ödeme rayı bu modda görünür. Oyunun
   mahremiyet dersi minimum-disclosure mekaniğinde; ödeme rayında değil.
   Shielded isterseniz `gateway` modu hazır (`gateway/README.md`).
2. **Txid yeniden kullanımı sunucuda engellenmiyor.** Explorer modu stateless;
   benzersiz tutar pratikte çakışmayı önlüyor ama production için kalıcı
   ledger gerekir.
3. **Public explorer bağımlılığı.** Düşerse akış fail-closed olur (mock'a düşmez).
4. **Tarayıcıdaki entitlement imzasız ve yerel** — production yetki sınırı değil.

---

# Doğrulanmış durum

Gerçek Zcash testnet'ine karşı çalıştırıldı:

- `/api/testnet/health` → canlı blok `4279488`
- Challenge → `zcash:tm...?amount=0.00104109` (metadata'sız ZIP-321)
- Status → `waiting`, 0.47 s
- **Gerçek zincirde gerçek işlem tespit edildi:** txid `54fb7c33…c77e26c6`,
  blok `4279484`, 1 onay
- 76/76 test, typecheck, production build temiz

Henüz yapılmayan: oyun içinden uçtan uca bir **oyuncu ödemesi** (ADIM 2-3
gerekiyor).
