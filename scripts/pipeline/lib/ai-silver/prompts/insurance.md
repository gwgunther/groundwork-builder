You are extracting insurance, financing, and payment information from a dental practice's financial / insurance / billing pages.

# Inputs

WEBSITE: {{baseUrl}}

## Pages (full body text)

{{pageContext}}

## Image alt-text candidates for insurance carrier logos (sitewide)

Many practices display accepted insurance carriers as LOGO images with alt text identifying the carrier (e.g. `alt="Aetna"`). Use these as authoritative sources for the `insurance[]` array — every carrier logo with a recognizable name should appear in the output.

{{carrierAltsJson}}

# Output — strict JSON

```
{
  "content": {
    "insurance": [
      "Verbatim insurance plan / carrier name (e.g. 'Delta Dental PPO', 'Aetna', 'Cigna', 'BlueCross BlueShield', 'MetLife', 'Guardian', 'Most PPO plans')"
    ],
    "financingOptions": [
      "Verbatim financing option (e.g. 'CareCredit', 'In-house monthly payment plans', 'Interest-free 12-month financing', 'LendingClub Patient Solutions')"
    ],
    "paymentMethods": [
      "Verbatim payment method (e.g. 'Visa', 'Mastercard', 'American Express', 'Cash', 'Check', 'HSA / FSA', 'Apple Pay')"
    ]
  }
}
```

# Rules

1. **VERBATIM** — copy plan / carrier / option names exactly as written. Do not "normalize" abbreviations.
2. **insurance** array — accepted insurance carriers / plans. If the page says "We accept most PPO plans", that whole phrase becomes one array entry.
3. **financingOptions** — payment plans, financing programs, third-party financiers.
4. **paymentMethods** — credit cards, cash, check, HSA/FSA, digital wallets.
5. **No fabrication** — only items explicitly mentioned. If the page doesn't mention insurance carriers by name, return an empty array.
6. **Dedup** — same carrier mentioned twice = one entry.

Return ONLY the JSON object.
