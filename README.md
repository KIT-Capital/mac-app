# Mechanical Art Capital

A recreation of the Mechanical Art Capital collector app: register a watch collection, request confidential appraisals, and estimate sale-and-repurchase financing against selected high-end timepieces.

The original mobile source was lost. This web app reconstructs the product from Vladimir’s November 2022 screens, the March 2021 Android screenshots, and the latest New Equity Investor presentation.

## What you can do

- Sign in (any email works) or create an account
- Browse a seeded collection: Richard Mille RM 011, Patek Philippe Nautilus, Audemars Piguet Royal Oak, Romain Gauthier Logical One
- Add a timepiece, save it, or send it for appraisal
- Open a financing estimate (minimum $10,000, 65% LTV, 18% starting rate)
- Review and e-sign a repurchase agreement
- Export a collection appraisal certificate
- Subscribe to $4.99/month membership for monthly reappraisals

No backend or credentials are required. State lives in the browser.

## Run locally

```bash
npm install
npm run dev -- --port 43173
```

Open [http://localhost:43173](http://localhost:43173). On desktop the app sits in a phone frame; on a phone it is full width.

Use **Sign in** with the prefilled collector account, or **Get started** to create a new one. Collection and agreements stay in the browser after logout. **Restore demo collection** on the Account screen reloads the sample watches.

## Product notes

Mechanical Art Capital offers overnight repo financing to dealers and collectors on a limited set of brands and models, typically above $40,000, stored in Manhattan. The app is the client desk: collection, appraisal, insurance documentation, and contract generation.
