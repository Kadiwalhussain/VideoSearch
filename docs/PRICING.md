# VideoSearch AI — subscription model

Search runs **in the browser**. That is why the cost stays low. You charge for the vault (Chrome + Studio + phone) and for **your** AI key, not for captions.

Do not paywall Mark, Shot, or spoken search. That loop costs you ~$0 and is why people install.

---

## Three plans (not four)

A paid “Basic” between Free and Plus splits conversion and does not match cost. Two paid seats is enough later (Plus for people, Pro for heavy AI / classrooms).

| | **Free** | **Plus** | **Pro** |
|---|---|---|---|
| Price | $0 | **$7 / mo** or **$59 / yr** | **$14 / mo** or **$119 / yr** |
| Who | Every install | Students who keep lectures | Teachers, coaches, heavy Ask |
| Search / topics | Unlimited, on-device | Same | Same |
| Marks + shots on this browser | Unlimited | Unlimited | Unlimited |
| Cloud vault (Studio + phone) | 25 saved videos · 100 shots | Unlimited for personal use | Unlimited |
| Devices signed in | 1 | 3 (Chrome, phone, laptop) | 6 |
| Share cards | — | Yes | Yes |
| Ask / Chat on **your** Mistral key | 10 / month or BYOK | 200 / month | 1 000 / month |
| BYOK (their Groq / Mistral / xAI) | Yes | Yes (does not count against quota) | Yes |
| Playlists | 3 | Unlimited | Unlimited |
| Early testers who already paid | — | **Founding Plus** (see below) | — |

Annual is ~30% off. Chrome-extension buyers convert better on yearly.

**Founding Plus (early testers):** 24 months of Plus included, then $59/yr. Do not give lifetime unless you want zero future revenue from them. They already paid — treat it as prepaid Plus, not a third SKU.

---

## Why your cost is low

| What the user does | Where it runs | Your cost |
|--------------------|---------------|-----------|
| Search “gradient descent” | MiniLM in Chrome | **$0** |
| Topics from captions | Browser | **$0** |
| Mark / Shot | `chrome.storage` + IndexedDB | **$0** |
| Guest, no account | Browser | **$0** |
| Login + JWT | Your vault | ~$0 |
| Save / Watch later / playlist | Mongo row | fractions of a cent |
| JPEG in R2 / disk (not base64 in Mongo) | ~80 KB each | ~$0.015 / GB-month |
| Ask / Chat (Mistral Small) | Your API key | ~**$0.001 per question** |

Mistral Small is about **$0.15 / million input tokens** and **$0.60 / million output**. One Ask that sends a few caption chunks is under **$0.001**. Two hundred Plus Asks ≈ **$0.16** in model spend. Stripe will take more than the model.

Keep shot **files** in R2 / disk. Do not store full `dataUrl` in Mongo for production — that is the only way vault size blows up.

---

## Your bill vs their price (honest)

Fixed (you, production):

| Item | Typical |
|------|---------|
| Small VPS or Fly for vault | $5–12 / mo |
| Mongo Atlas (or the VPS disk) | $0–15 / mo until ~1k active vault users |
| Domain + Netlify site | ~$0–2 / mo |
| Clerk (optional) | Free to ~10k MAU |
| Cloudflare R2 | Pennies until tens of GB |

Per paying user at Plus $7:

| | Amount |
|--|--------|
| Stripe (~2.9% + $0.30) | ~$0.50 |
| Vault + Mongo share | ~$0.05–0.20 |
| 200 included Asks | ~$0.16 worst case |
| **You keep** | **~$6.10–6.30 (~87–90%)** |

Free users cost almost nothing if shots stay local until they Save.

100 Free + 8 Plus ≈ **$56 / mo** revenue, **&lt; $15** infra.  
1 000 Free + 40 Plus (4% convert) ≈ **$280 / mo**.  
10 000 Free + 300 Plus ≈ **$2 100 / mo**.

Chrome-store conversion of 2–4% of **weekly actives** (not raw installs) is realistic.

---

## What Free must still be

Free has to be a real product or installs bounce:

- Spoken search on YouTube with no key  
- Mark and Shot on this computer  
- Optional account so they are not scared  
- A small vault so they feel sync once  

Hit the Plus wall on the **second device** and on **Save #26**, not on the first search. People upgrade when they already have notes they do not want to lose.

Do **not** limit searches. That is the $0 feature and the review driver.

---

## What Plus is selling

One sentence: **the same library on Chrome, Studio, and phone, without losing the lecture.**

Not “AI”. Search is already free. Plus is:

1. Vault that survives a new laptop  
2. Studio + iOS/Android player  
3. Enough hosted Ask that they never need their own key  

---

## What Pro is selling (add when Plus is live)

- Higher Ask quota (you still only pay cents)  
- Classroom: one teacher, shared playlist links  
- Longer share-card life  
- Priority vault  

Skip Pro at launch if you want a simpler store listing: **Free + Plus** only. Add Pro when someone asks for a class.

---

## Guardrails so cost stays low

1. Hosted Ask only when signed in; rate-limit `/api/ai/chat` per plan.  
2. BYOK never hits your Mistral bill.  
3. Shots: object storage + `/api/vault/shot/…`, not 200 KB base64 in every Mongo row.  
4. Free vault caps (25 videos / 100 shots) are the only soft paywall.  
5. Do not run embeddings on the server. Ever.

---

## How to charge (when you wire it)

1. **Stripe Checkout** or **Clerk Billing** (you already have Clerk).  
2. Chrome Web Store can deep-link to Stripe; CWS native payments are extra friction.  
3. Entitlement on the JWT (`plan: free | plus | pro`, `askLeft`, `vaultCap`). Vault enforces. Extension only displays.  
4. Webhook → `User.plan` in Mongo. No client-side “I am Plus” flag.

Not built yet. This file is the model, not the code.

---

## Store listing copy (short)

**Free** — Search what was said. Mark the second. Capture the slide. On this device. No key.

**Plus · $7/mo** — Same notes on Studio and your phone. Saved lectures stay in your account. Ask included.

**Yearly · $59** — Two months free.

---

## Decision summary

| Question | Answer |
|----------|--------|
| Is Free real? | Yes. Search + marks + shots local, forever. |
| Do we need paid Basic? | No. It only steals Plus conversions. |
| What is Plus? | Sync + Studio + phone + included Ask. |
| Why not $15/mo? | Chrome users treat extensions as cheap. $7 converts; $15 is SaaS-in-a-tab. |
| Why not $3/mo? | Stripe’s $0.30 eats the margin; support is the same. |
| Can we afford included AI? | Yes, at Small-class models. Cap the quota anyway. |
| Early testers | Founding Plus, 24 months, then yearly. |
