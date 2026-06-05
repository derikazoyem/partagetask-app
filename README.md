# 🤝 PartageTask

> SaaS platform for collaborative shared expense management

[![Netlify Status](https://api.netlify.com/api/v1/badges/648f6ce4-165e-4ca9-90b9-aca2eee4a5ef/deploy-status)](https://app.netlify.com/projects/partagetask/deploys)
![Firebase](https://img.shields.io/badge/Firebase-Blaze-orange?logo=firebase)
![Vite](https://img.shields.io/badge/Vite-8.0-646CFF?logo=vite)
![JavaScript](https://img.shields.io/badge/JavaScript-ES2020-F7DF1E?logo=javascript)
![i18n](https://img.shields.io/badge/i18n-5%20languages-blue)

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Installation](#installation)
- [Firebase Configuration](#firebase-configuration)
- [Deployment](#deployment)
- [Firestore Security Rules](#firestore-security-rules)
- [Cloud Functions](#cloud-functions)
- [Internationalization](#internationalization)

---

## Overview

PartageTask is a web application that allows groups of people to manage their shared expenses. Create a project, invite members, record expenses and revenues, and the app automatically calculates who owes what to whom.

**Use cases:**
- 🏖️ Trips with friends
- 🏠 Shared housing / roommates
- 💼 Professional projects
- 👨‍👩‍👧 Family budget management
- 📈 **Joint investment** — two partners who pool funds, track revenues and expenses, and consult an automatic balance sheet updated in real time based on generated income
- 📒 **Shared activity log** — every expense and revenue is tracked with its author, date, category and supporting documents (receipts/invoices), forming a complete and tamper-proof record of all project operations

---

## Features

### 🔐 Authentication
- Google Sign-In (OAuth2)
- Email / Password login
- Duplicate email detection (one account per email)
- Password reset via email link
- Password change with reauthentication
- Automatic logout after 30 minutes of inactivity

### 📊 Dashboard
- Real-time project list (Firestore `onSnapshot`)
- Create a project with name, description and currency
- ⋮ menu on each project: delete (admin) or leave (member)
- Join a project via invitation code or URL link

### 🏗️ Project Space

#### 📋 Expenses
- Add with description, quantity, unit price and **mandatory category**
- 10 predefined categories + custom category (emoji + name)
- Edit and delete (admin only)
- Color-coded category badges on each row
- **Up to 2 receipts** per expense (PDF or images, max 10 MB)
  - Upload with progress bar
  - 👁 View button to open the receipt
  - Automatic replacement of old receipt

#### 💰 Revenues
- Same structure as expenses with categories
- Equal split among all members (÷N)

#### 📜 Change History
- Dedicated tab in Expenses and Revenues
- Tracks all actions: ✅ Creation, ✏️ Edit, 🗑 Deletion
- Displays before/after values for edits
- Filters by action type + text search
- Real-time via Firestore listener

#### ⚖️ Balance Sheet
- **Disabled by default** — manually activated by the admin
- On activation, enter each member's initial budget
- Anti-double-activation check
- Formula: `Balance = Budget + (Revenue ÷ N) − (Expenses ÷ N)`
- Budget +/- movements (admin) with full history

#### 💸 Settlements
- Minimum rebalancing algorithm for N members
- Calculates exactly who owes what to whom
- Debt accumulates over time
- **Confirm receipt**: only the creditor can confirm
- Confirmed settlements are deducted from future debts
- History of completed settlements

#### 👥 Members
- Invitation code with 7-day expiry
- Clickable invitation link (clipboard copy)
- Mandatory admin validation (pendingMembers)
- Code regeneration (admin)
- 🔴 badge for pending requests

### 🔔 In-app Notifications
- Red badge with unread count
- Notifications for: new expense, new revenue, confirmed settlement
- Mark as read on click + "Mark all as read"
- Stored in `users/{uid}/notifications` (private per user)
- Real-time via Firestore listener

### 📁 Files & Receipts
- Upload to Firebase Storage
- Type validation (images + PDF) and size limit (max 10 MB)
- 2 slots per expense/revenue
- Old file deleted before replacement

### 📤 Exports
- **PDF**: full report (expenses, revenues, balance, budget history)
- **Excel**: 4 sheets (expenses, revenues, balance, budget history)
- Lazy-loaded libraries — only loaded when exporting

### 🌍 Internationalization
- 5 languages: Français, English, Español, العربية, Italiano
- Automatic browser language detection
- Dynamic loading via `fetch(/langs/{lang}.json)`
- RTL support (Arabic)
- Language selector in the header

### 🔒 Security
- All sensitive operations go through **Cloud Functions**
- Strict Firestore rules (read/write by member only)
- Invitation via server-side code (never client-side)
- Admin validation before project access

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Vite 8 + Vanilla JS (ES Modules) |
| Auth | Firebase Authentication |
| Database | Cloud Firestore |
| Storage | Firebase Storage |
| Functions | Firebase Cloud Functions (Node.js v2) |
| Hosting | Netlify |
| Build | Vite (bundle + optimization) |

**Supported currencies:** FCFA, EUR, USD, GBP, XOF, MAD, DZD, TND

---

## Architecture

```
partagetask-app/
├── index.html              # HTML entry point
├── vite.config.js          # Vite configuration
├── netlify.toml            # Netlify config (redirects + headers)
├── package.json
├── public/
│   ├── favicon.svg
│   └── langs/              # Translation files
│       ├── fr.json
│       ├── en.json
│       ├── es.json
│       ├── ar.json
│       └── it.json
└── src/
    ├── main.js             # JS entry point, event listeners, auth state
    ├── firebase.js         # Firebase init + Cloud Function callables
    ├── auth.js             # Login / Register / Logout / ForgotPw / ChangePw
    ├── dashboard.js        # Project list, create, join, delete, leave
    ├── project.js          # Expenses, revenues, balance, members, settlements
    ├── admin.js            # Member approval, budget movements
    ├── ui.js               # DOM cache ($), toast, modals, navigation, fmt()
    ├── inactivity.js       # Auto-logout after 30 min (debounce)
    ├── i18n.js             # Dynamic language loading + applyTranslations()
    ├── categories.js       # Expense/revenue categories
    ├── notifications.js    # Real-time in-app notifications
    ├── files.js            # Firebase Storage upload
    ├── export.js           # PDF (jsPDF) and Excel (SheetJS) lazy-loaded
    └── styles.css          # All CSS (dark theme)
```

### Cloud Functions (`partagetask-functions/`)

| Function | Description |
|----------|-------------|
| `createProject` | Creates project + invitation code (atomic) |
| `joinProject` | Validates code, creates pendingMembers request |
| `approveMember` | Admin approves → adds to members |
| `rejectMember` | Admin rejects → removes from pending |
| `regenerateInviteCode` | Generates new 7-day code |

---

## Installation

### Prerequisites
- Node.js v22.12+
- Firebase account (Blaze plan for Cloud Functions)
- Netlify account (free)

### 1. Clone the repository

```bash
git clone https://github.com/derikazoyem/partagetask.git
cd partagetask
```

### 2. Install frontend dependencies

```bash
cd partagetask-app
npm install
```

### 3. Install Cloud Functions dependencies

```bash
cd partagetask-functions
npm install
```

### 4. Run in development

```bash
cd partagetask-app
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## Firebase Configuration

### 1. Create a Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Create a new project
3. Enable **Authentication** → Email/Password + Google
4. Create a **Firestore** database (production mode)
5. Enable **Storage**
6. Upgrade to **Blaze** plan (required for Cloud Functions)

### 2. Set up credentials

Edit `src/firebase.js` with your Firebase credentials:

```javascript
const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT.firebasestorage.app',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID'
}
```

### 3. Deploy Cloud Functions

```bash
cd partagetask-functions
firebase login
firebase use YOUR_PROJECT_ID
firebase deploy --only functions
```

### 4. Authentication — Important settings

- **Account linking** → "Link accounts that use the same email address"
- **Authorized domains** → Add `localhost` and your Netlify domain

---

## Firestore Security Rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isProjectMember(projId) {
      return request.auth != null &&
        get(/databases/$(database)/documents/projects/$(projId)).data.members[request.auth.uid] != null;
    }
    function isProjectAdmin(projId) {
      return request.auth != null &&
        get(/databases/$(database)/documents/projects/$(projId)).data.adminUid == request.auth.uid;
    }

    match /users/{userId} {
      allow read, write: if request.auth.uid == userId;
      match /notifications/{notifId} {
        allow read, update, delete: if request.auth.uid == userId;
        allow create: if request.auth != null;
      }
    }

    match /inviteCodes/{code} {
      allow read: if request.auth != null;
      allow write: if false;
    }

    match /projects/{projectId} {
      allow read: if request.auth != null && resource.data.members[request.auth.uid] != null;
      allow create: if request.auth != null;
      allow update: if request.auth != null && (
        resource.data.adminUid == request.auth.uid ||
        resource.data.members[request.auth.uid] != null
      );
      allow delete: if request.auth != null && resource.data.adminUid == request.auth.uid;

      match /tasks/{docId} {
        allow read, create: if isProjectMember(projectId);
        allow update, delete: if isProjectAdmin(projectId);
      }
      match /recettes/{docId} {
        allow read, create: if isProjectMember(projectId);
        allow update, delete: if isProjectAdmin(projectId);
      }
      match /budgetMovements/{uid} {
        allow read: if isProjectMember(projectId);
        allow write: if isProjectAdmin(projectId);
        match /movements/{mvId} {
          allow read: if isProjectMember(projectId);
          allow write: if isProjectAdmin(projectId);
        }
      }
      match /pendingMembers/{uid} {
        allow read: if isProjectAdmin(projectId);
        allow create: if request.auth != null && request.auth.uid == uid;
        allow update, delete: if isProjectAdmin(projectId);
      }
      match /history/{docId} {
        allow read: if isProjectMember(projectId);
        allow create: if isProjectMember(projectId);
        allow update, delete: if false;
      }
      match /settlementsConfirmed/{docId} {
        allow read: if isProjectMember(projectId);
        allow create: if isProjectMember(projectId);
        allow update, delete: if false;
      }
    }
  }
}
```

---

## Deployment

### Production build

```bash
cd partagetask-app
npm run build
```

### Deploy to Netlify

**Option A — Drag and drop:**
Drag the `dist/` folder to [netlify.com](https://netlify.com)

**Option B — Netlify CLI:**
```bash
npm install -g netlify-cli
netlify deploy --prod --dir=dist
```

### netlify.toml

```toml
[build]
  command = "npm run build"
  publish = "dist"

[[headers]]
  for = "/*"
  [headers.values]
    Cross-Origin-Opener-Policy = "same-origin-allow-popups"
    Cross-Origin-Embedder-Policy = "unsafe-none"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

---

## Internationalization

Translation files are located in `public/langs/`.

To add a new language:

1. Create `public/langs/xx.json` by copying `fr.json`
2. Translate all values
3. Add the option in the language selector in `index.html`
4. Add the language to the supported list in `i18n.js`

---

## Expense Categories

Predefined categories in `src/categories.js`:

| Emoji | Category | Color |
|-------|----------|-------|
| 🍔 | Food | #f6ad55 |
| 🚗 | Transport | #63b3ed |
| 🏠 | Housing | #68d391 |
| 🎉 | Leisure | #b794f4 |
| 💊 | Health | #fc8181 |
| 📚 | Education | #4fd1c5 |
| 👔 | Clothing | #f687b3 |
| 💡 | Bills | #faf089 |
| 🛒 | Groceries | #9ae6b4 |
| 🔧 | Misc | #a0aec0 |

Users can create custom categories with their own emoji and name.

---

## License

© 2026 Derik Azoyem — All Rights Reserved
Unauthorized copying, modification, distribution or commercial use
of this software, via any medium, is strictly prohibited without
prior written permission from the author.
---

## Author

**Derik Azoyem**
- Email: dazoyem@gmail.com
- GitHub: [@derikazoyem](https://github.com/derikazoyem)

---

> Built with ❤️ to simplify shared expense management
