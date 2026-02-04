# CLAUDE.md - AI Assistant Guide for geoujungdong (사진대지)

## Project Overview

**geoujungdong (사진대지)** is a Korean-language Next.js application for automated photo documentation. It helps construction site managers upload Excel expense item lists, map inbound/installation photos to each item, and export formatted Excel/PDF documentation.

### Core User Flow
1. Upload Excel file with expense items (항목별 사용내역서)
2. Select items from the parsed list
3. Upload photos: 1 inbound photo + up to 4 installation photos per item
4. Export formatted documentation with embedded photos

## Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 16.1.4 | App Router, React Server Components |
| React | 19.2.3 | UI with React Compiler enabled |
| TypeScript | ^5 | Strict mode enabled |
| Tailwind CSS | v4 | Styling via `@tailwindcss/postcss` |
| Supabase | ^2.91.1 | Database + Storage backend |
| xlsx (SheetJS) | ^0.18.5 | Client-side Excel parsing |
| ExcelJS | ^4.4.0 | Server-side Excel generation |
| Framer Motion | ^11.15.0 | Animations |

## Project Structure

```
src/
├── app/                      # Next.js App Router
│   ├── layout.tsx            # Root layout (Geist fonts)
│   ├── page.tsx              # Homepage with FAQ accordion
│   ├── globals.css           # Tailwind imports + CSS variables
│   ├── intro/                # Intro page with video background
│   ├── workspace/            # Main workspace for document editing
│   │   └── page.tsx          # Document/item selection + photo slots
│   ├── expense/              # Expense management
│   │   ├── page.tsx          # Document/item CRUD with Supabase
│   │   └── export/route.ts   # Excel export with photos
│   └── api/
│       ├── upload-excel/route.ts   # Excel parsing to Supabase
│       └── photos/
│           ├── upload/route.ts     # Photo upload to Storage
│           └── list/route.ts       # Photo listing with signed URLs
├── components/
│   ├── PhotoSection.tsx      # Photo slot UI component
│   └── PhotoUploader.tsx     # Simple file upload component
└── lib/
    ├── supabaseClient.ts     # Browser client (anon key)
    ├── supabaseServer.ts     # Server client (service role)
    ├── supabaseAdmin.ts      # Admin client (service role)
    └── excel/
        └── parseItemUsageSheet.ts  # Excel parsing utility
```

## Development Commands

```bash
npm run dev      # Start development server
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint
```

## Key Conventions

### 1. Supabase Client Usage

- **Browser (Client Components)**: Use `supabaseClient.ts` with `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Server (API Routes)**: Use `supabaseAdmin.ts` with `SUPABASE_SERVICE_ROLE_KEY`
- **Never expose** `SUPABASE_SERVICE_ROLE_KEY` to the browser

```typescript
// Client component
import { supabase } from "@/lib/supabaseClient";

// Server API route
import { supabaseAdmin } from "@/lib/supabaseAdmin";
```

### 2. Path Aliases

Use `@/*` for imports from `src/`:
```typescript
import { supabase } from "@/lib/supabaseClient";
import PhotoSection from "@/components/PhotoSection";
```

### 3. Component Patterns

- **Client Components**: Add `"use client"` directive at top
- **CSS Modules**: Use `ComponentName.module.css` alongside `.tsx` files
- **Korean comments**: Codebase uses Korean for comments and UI strings

### 4. Photo Slot System

Photos are organized by type and slot:
- `inbound` (반입): 1 slot (slot=0)
- `issue_install` (지급/설치): 4 slots (slot=0-3)

Storage path pattern: `expense_items/{itemId}/{kind}/{slot}.{ext}`

### 5. Excel Parsing

The Excel parser expects specific Korean headers:
- `항목` (Category)
- `사용일자` (Usage Date)
- `사용내역` (Description)
- `수량` (Quantity)
- `단가` (Unit Price)
- `금액` (Amount)
- `증빙번호` (Evidence Number)

### 6. Date Handling

Multiple date formats are supported:
- `YY.MM.DD` (e.g., `25.12.22`)
- `YYYY-MM-DD` (e.g., `2025-12-22`)
- Excel serial numbers
- All converted to ISO format `YYYY-MM-DD` for database storage

## Environment Variables

Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_URL=https://your-project.supabase.co  # For server routes
```

## Database Schema (Supabase)

### expense_docs
- `id` (uuid, PK)
- `site_name` (text)
- `month_key` (text, e.g., "2026-01")
- `created_at` (timestamp)

### expense_items
- `id` (uuid, PK)
- `doc_id` (uuid, FK to expense_docs)
- `evidence_no` (integer, unique per doc)
- `item_name` (text)
- `qty` (integer)
- `unit_price` (numeric, nullable)
- `amount` (numeric, nullable)
- `used_at` (date, nullable)
- `category_no` (integer, nullable)

### expense_item_photos
- `id` (uuid, PK)
- `expense_item_id` (uuid, FK to expense_items)
- `kind` (text: 'inbound' | 'issue_install')
- `slot` (integer: 0-3)
- `storage_path` (text)
- `original_name` (text)
- `mime_type` (text)
- `size_bytes` (integer)

## Storage Bucket

Bucket name: `expense-evidence` (private)
- Photos accessed via signed URLs (10-minute expiry)

## Styling Guidelines

From `.cursor/rules/responsive-app-feel.mdc`:

### Breakpoints
- 1280px, 1100px, 980px, 768px, 600px, 480px

### Principles
1. Design responsive layouts from the start
2. Use CSS variables: `--surface`, `--border`, `--radius-*`
3. Use `grid-template-columns`, `flex-wrap` for adaptive layouts
4. Minimum touch targets for buttons/cards
5. Use `overflow: auto` to prevent content clipping
6. Prefer `minmax()`, `fr`, `%`, `vw` over fixed pixels

## API Response Format

All API routes return consistent JSON:
```typescript
// Success
{ ok: true, data: ... }

// Error
{ ok: false, error: "Error message" }
```

## Important Notes

1. **React Compiler**: Enabled in `next.config.ts` (`reactCompiler: true`)
2. **Strict TypeScript**: `strict: true` in `tsconfig.json`
3. **Korean UI**: All user-facing text is in Korean
4. **Image formats**: JPG, PNG, WEBP supported
5. **Excel formats**: .xlsx, .xls supported

## Common Tasks

### Adding a new API route
1. Create `src/app/api/{route}/route.ts`
2. Use `supabaseAdmin` for database/storage operations
3. Return `NextResponse.json({ ok: true/false, ... })`

### Adding a new page
1. Create `src/app/{page}/page.tsx`
2. Add `"use client"` if using hooks/interactivity
3. Create `{PageName}.module.css` for styles

### Modifying Excel parsing
- Client-side: `src/app/workspace/page.tsx` (`parseItemsFromSheet`)
- Server-side: `src/lib/excel/parseItemUsageSheet.ts`
- API route: `src/app/api/upload-excel/route.ts`

## Git Workflow

- Main development happens on feature branches
- Commit messages can be in English or Korean
- Run `npm run lint` before committing
