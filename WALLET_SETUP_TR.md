# ZITY — Zcash Testnet Cüzdan Bağlantı Rehberi (Adım Adım)

Bu rehber, projeyi **gerçek Zcash testnet** ile çalıştırmak için gereken
cüzdan bağlantısını anlatır.

## Önce şunu anlayın: iki farklı "cüzdan" var

Bu mimaride cüzdan **tarayıcıya bağlanmaz**. Bu kasıtlı bir güvenlik kararıdır.

| | Kim çalıştırır | Ne yapar | Nerede durur |
|---|---|---|---|
| **Alıcı (receiver) cüzdan** | **Siz** (sunucu operatörü) | Ödemeyi kabul eder, doğrular | Gateway'in yanında, private ağda |
| **Ödeyen (payer) cüzdan** | **Oyuncu** | ZIP-321 QR'ı okuyup ödeme yapar | Oyuncunun telefonu/masaüstü |

Yani "cüzdan bağlama" işi = **kendi alıcı cüzdanınızı (Zallet) kurup
gateway'e tanıtmak**. Oyuncu tarafında hiçbir entegrasyon, hiçbir
browser extension, hiçbir WalletConnect yok — sadece bir QR kod.

```
Oyuncunun cüzdanı  ──ödeme──►  Zcash testnet
                                     │
Tarayıcı ──► /api/testnet ──► Gateway ──► Zallet + Zebra ──┘
             (same-origin)   (Bearer)    (private RPC)
```

---

# BÖLÜM A — Alıcı cüzdanı kurma (sunucu tarafı)

> ⚠️ Bu bölüm **bu bilgisayarda yapılamaz**: Docker daemon çalışmıyor ve
> diskte sadece ~9 GB boş alan var. Zebra testnet senkronu ~30 GB ister.
> Ayrı bir VPS/sunucu kullanın (2+ CPU, 8 GB RAM, 50 GB SSD).

## A1. Z3 stack'ini indirin

`zcashd` KULLANMAYIN — resmi olarak end-of-life ve NU6.3 desteklemiyor.
Güncel stack: **Zebra** (zincir) + **Zallet** (cüzdan).

```sh
git clone https://github.com/ZcashFoundation/z3.git
cd z3
./scripts/setup-network.sh testnet
```

## A2. Gateway için özel RPC kullanıcısı oluşturun

Stock Z3, cookie tabanlı kimlik doğrulama kullanır ama gateway Basic auth
ister. Cookie'yi paylaşmak yerine **ayrı bir RPC kimliği** yaratın:

```sh
docker compose --env-file .env.testnet run --rm --no-deps \
  --entrypoint /usr/local/bin/zallet-zaino \
  zallet add-rpc-user zity-gateway
```

Gizli parola sorulacak — password manager'dan güçlü bir parola girin.
Komutun ürettiği stanza'yı `config/testnet/zallet.toml` içine yapıştırın:

```toml
[[rpc.auth]]
user = "zity-gateway"
pwhash = "<komutun ürettiği pwhash>"
```

> **pwhash** Zallet'in config'inde kalır. **Düz parola** ise sadece
> gateway'in secret'ında durur. İkisini asla yer değiştirmeyin.

## A3. Zebra'yı önce başlatın, senkronu bekleyin

```sh
docker compose --env-file .env.testnet up -d zebra
./scripts/check-zebra-readiness.sh 18080
```

Bu adım **2-12 saat** sürebilir. Zebra hazır olmadan devamını başlatmayın —
Zallet restart döngüsüne girer.

```sh
docker compose --env-file .env.testnet up -d
```

## A4. Hesap oluşturun ve UUID'yi alın

Zallet senkron olduktan sonra:

```sh
# Cüzdan durumu — fully synced olmalı
docker compose exec zallet zallet-zaino rpc getwalletstatus

# Hesap oluşturun (yoksa)
docker compose exec zallet zallet-zaino rpc z_getnewaccount
```

Dönen **UUID**'yi kaydedin → `ZALLET_ACCOUNT_UUID`.

> 🔐 **Seed phrase'i yedekleyin ve ASLA sohbete/repoya yapıştırmayın.**

## A5. Testnet ZEC alın (faucet)

Alıcı adresinizi üretin:

```sh
docker compose exec zallet zallet-zaino rpc \
  z_getaddressforaccount '["<UUID>", ["sapling"]]'
```

Dönen `utest1...` adresine faucet'ten testnet ZEC isteyin. Güncel faucet
listesi: https://zcash.readthedocs.io/en/latest/rtd_pages/testnet_guide.html

> Not: Alıcı cüzdanın fon almasına aslında gerek yok (o parayı **alacak**).
> Fon gereken taraf **ödeyen** cüzdandır — Bölüm B.

## A6. Zorunlu canlı doğrulama

Gateway varsayılan olarak `ZITY_LIVE_RECEIVER_MATCH_VALIDATED=false` ile gelir
ve bu haldeyken **challenge üretmeyi reddeder**. Bu kasıtlıdır: Zallet beta
ve `z_listtransactions` deneysel olduğu için, kendi sürümünüzde adres
eşleştirmenin doğru çalıştığını kanıtlamalısınız.

`gateway/README.md` içindeki 7 adımlı "Mandatory live validation"
prosedürünü uygulayın. Özetle:

1. Zebra `chain === "test"` mi?
2. `z_getaddressforaccount` yeni bir UA veriyor mu?
3. `z_listunifiedreceivers` **sadece sapling** mi döndürüyor (transparent/orchard YOK)?
4. O adrese tam tutarı gönderin (memo olmadan).
5. `z_listtransactions` doğru UUID + `is_change: false` + tam zatoshi gösteriyor mu?
6. `z_viewtransaction` aynı kanıtı `outgoing: false` ile tekrarlıyor mu?
7. Hepsi geçtiyse → `ZITY_LIVE_RECEIVER_MATCH_VALIDATED=true`

> Her Zallet yükseltmesinden sonra bu testi **tekrarlayın**.

## A7. Gateway'i çalıştırın

`gateway/.env` dosyasını doldurun:

```dotenv
GATEWAY_BEARER_TOKEN=<openssl rand -hex 32 çıktısı>
ZITY_GATEWAY_NETWORK=testnet
ZITY_PAYMENT_AMOUNT=0.001
ZITY_MIN_CONFIRMATIONS=1
ZITY_CHALLENGE_TTL_SECONDS=600
ZITY_UNLOCK_POLICY=confirmed

ZALLET_RPC_URL=http://zallet:28232/
ZALLET_RPC_USER=zity-gateway
ZALLET_RPC_PASSWORD=<A2'deki düz parola>
ZALLET_ACCOUNT_UUID=<A4'teki UUID>

ZEBRA_RPC_URL=http://zebra:18232/
ZEBRA_RPC_COOKIE_FILE=/run/zebra-cookie/.cookie

RPC_ALLOW_INSECURE_HTTP=true
ZITY_LIVE_RECEIVER_MATCH_VALIDATED=true
```

Çalıştırın:

```sh
docker build -t zity-zcash-testnet-gateway ./gateway
docker run -d \
  --env-file ./gateway/.env \
  --network z3-testnet \
  --mount type=volume,src=z3-testnet-cookie,dst=/run/zebra-cookie,readonly \
  -p 8787:8787 \
  zity-zcash-testnet-gateway
```

Sağlık kontrolü — **dördü de `true` olmalı**:

```sh
curl -H "Authorization: Bearer $GATEWAY_BEARER_TOKEN" \
     -H "x-zity-network: testnet" \
     https://<gateway-host>/v1/health
```

`connected`, `synced`, `walletAvailable`, `indexerAvailable` → hepsi `true`.

> Gateway'i mutlaka **HTTPS ingress** arkasına koyun. Zallet/Zebra RPC
> portlarını asla public açmayın.

---

# BÖLÜM B — Ödeyen cüzdan (oyuncu tarafı)

Oyuncunun yapması gereken tek şey: **testnet destekli bir cüzdan** kurmak
ve içine testnet ZEC almak.

## B1. Testnet cüzdan seçenekleri

| Cüzdan | Platform | Testnet notu |
|---|---|---|
| **Zashi** | iOS / Android | Testnet için ayrı build gerekir |
| **YWallet** | iOS / Android / Masaüstü | Ayarlardan testnet'e geçilebilir — en pratik seçenek |
| **Zallet CLI** | Masaüstü | Kendi node'unuzla, tam kontrol |

Demo/sunum için **YWallet** en kolayı: uygulama içinden ağ olarak
testnet seçilebiliyor.

## B2. Testnet ZEC alın

Faucet'ten ödeyen cüzdanın adresine testnet ZEC isteyin. Gereken miktar
`ZITY_PAYMENT_AMOUNT` (varsayılan **0.001 ZEC**) + işlem ücreti.

## B3. Ödeme yapın

Oyunda metro checkpoint'ine gelince ekranda bir **ZIP-321 QR kodu** çıkar.
Format tam olarak şudur:

```
zcash:<utest1...>?amount=0.001
```

Cüzdanla QR'ı okutup gönderin. Dikkat:

- **Memo eklemeyin.** Protokol memo istemiyor; memo mahremiyeti azaltır.
- **Tutarı değiştirmeyin.** Yanlış tutar `invalid-payment` olur ve
  kilidi açmaz — kısmi ödeme kabul edilmez.
- Her challenge **yeni bir adres** alır; eski QR'ı tekrar kullanmayın.

## B4. Oyunun tepkisi

Ödeme sonrası UI otomatik olarak şu durumlardan geçer:

```
WAITING → DETECTED → CONFIRMING → VERIFIED → entitlement → PROVE ACCESS
```

`confirmed` politikasında metro **onay geldikten sonra** açılır.
`detected` politikasında 0-onayda açılır ama UI "onay bekleniyor" yazmaya
devam eder.

Entitlement **tek kullanımlıktır** — `PROVE ACCESS` onu tüketir, ikinci
kez kullanım reddedilir.

---

# BÖLÜM C — Vercel tarafı

Vercel'de **Environment Variables** bölümüne (VITE_ öneki olmadan):

```
ZITY_NETWORK_MODE=testnet
ZITY_ZCASH_NETWORK=testnet
ZITY_TESTNET_GATEWAY_URL=https://<gateway-host>
ZITY_TESTNET_GATEWAY_TOKEN=<A7'deki bearer token>
ZITY_TESTNET_PAYMENT_AMOUNT=0.001
ZITY_TESTNET_MIN_CONFIRMATIONS=1
ZITY_TESTNET_CHALLENGE_TTL_SECONDS=600
ZITY_TESTNET_UNLOCK_POLICY=confirmed
ZITY_TESTNET_GATEWAY_TIMEOUT_MS=8000
```

Bu dört değer gateway ile **birebir aynı** olmalı, yoksa gateway reddeder:
`PAYMENT_AMOUNT`, `MIN_CONFIRMATIONS`, `CHALLENGE_TTL_SECONDS`, `UNLOCK_POLICY`.

## Zorunlu rate limit

`POST /api/testnet/payment-challenge` public açılmadan önce Vercel WAF'ta
IP başına **5 istek/dakika → 429** kuralı kurun. Aksi halde adres havuzu
kasıtlı isteklerle şişirilebilir.

## Wallet/node Vercel'de ÇALIŞMAZ

Zebra ve Zallet kalıcı disk ve uzun ömürlü process ister; Vercel Functions
bunu sağlamaz. Gateway ayrı bir VPS'te olmak zorunda.

---

# Sorun giderme

| Belirti | Neden | Çözüm |
|---|---|---|
| UI'da QR hiç çıkmıyor | Backend `providerMode: "mock"` diyor | `ZITY_NETWORK_MODE=testnet` mi? Gateway URL/token doğru mu? |
| `indexerAvailable: false` | Canlı doğrulama yapılmamış | Bölüm A6'yı tamamlayıp flag'i `true` yapın |
| `synced: false` | Zebra/Zallet senkron değil | Senkronu bekleyin (ilk sefer 2-12 saat) |
| Ödeme gitti ama `WAITING`'de kaldı | Tutar veya adres eşleşmedi | Tam tutar mı? Doğru challenge'ın QR'ı mı? |
| `invalid-payment` | Yanlış tutar gönderildi | Tam `0.001` gönderin, kısmi ödeme kabul edilmiyor |
| Gateway başlamıyor | Config doğrulaması reddetti | Token ≥32 byte mı? `ZITY_GATEWAY_NETWORK=testnet` mi? |

---

# Güvenlik kuralları

1. **Seed phrase veya wallet parolasını asla** sohbete, repoya, Vercel'in
   `VITE_` değişkenlerine koymayın. Sadece sunucu secret store'una.
2. Tarayıcıya açılan tek değişken `VITE_NETWORK_MODE` — ve bu bile sadece
   bir UX varsayılanı, güvenlik sınırı değil.
3. Gerçek yetki her zaman sunucudaki `/api/testnet/health` yanıtından gelir.
   Backend `mock` derse UI ödeme akışını tamamen gizler.
4. Browser'daki entitlement **imzasız ve yereldir** — production yetki
   sınırı değildir, sadece oyun akışı içindir.
5. Gateway'in in-memory ledger'ı tek process içindir. Production'da
   kalıcı transactional store'a geçin; yatay ölçeklemeyin.
