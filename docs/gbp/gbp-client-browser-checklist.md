# What the practice does on the setup call

**One video call** (~45–60 min) with your marketing partner. No coding or software install on your side.

**Full guide (for your partner):** [gbp-setup-walkthrough.md](./gbp-setup-walkthrough.md)  
**Removing partner access later:** [gbp-offboarding.md](./gbp-offboarding.md)

---

## Your role

| When | What you do |
|------|-------------|
| **First half (~35 min)** | **Share your screen.** Stay signed into Google as the account that manages your **Google Business Profile**. Click where your partner tells you in [Google Cloud](https://console.cloud.google.com) and [Business Profile](https://business.google.com). |
| **Second half (~15 min)** | **Watch their screen.** When Chrome opens on **their** computer, use **remote control** (Zoom/Meet) or tell them what to click. Sign in with your **practice** Google account and click **Allow**. You are not giving them your password. |

---

## First half — they guide you to

1. Create a Google Cloud project  
2. Turn on a few Google APIs (buttons in a library)  
3. Set up OAuth permissions (including your Gmail as a “test user” if Google shows “Testing”)  
4. Request Google’s approval to use the Business Profile API *(can take days — you may need a short second call)*  
5. Create a **Client ID** and **Client secret** — keep the window open or save in **Notes** on your computer (do not email passwords or secrets)  
6. Add your partner as **Editor** in Cloud Console  
7. Add your partner as **Manager** on your Business Profile  

---

## Second half — remote control on their screen

1. They share their screen and run a command you do not need to read  
2. Chrome opens on **their** laptop — you control the mouse (Zoom **Request remote control**) or they click at your direction  
3. Sign in with your **practice** Google account  
4. Approve 2FA on your phone if asked  
5. Click **Continue** on “app not verified” (normal)  
6. Click **Allow** for Business Profile  
7. Tell them your office name if they ask “option 1 or 2?”  

Done. They manage the technical tools afterward.

---

## You never need to

- Install Node.js or developer tools  
- Download a website repository  
- Share your Google password  

---

## If you stop working with this partner

Ask them to send you [gbp-offboarding.md](./gbp-offboarding.md) or follow your IT through: revoke app access, remove them from Cloud IAM and Profile managers.
