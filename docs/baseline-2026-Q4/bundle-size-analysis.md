# Bundle Size Baseline Analysis (2026-Q4)
**Measurement Window:** Week 4 (Mon 19 Oct – Fri 23 Oct 2026)  
**Target Environment:** Production Webpack Build (`pharmacy_front` production build output)  
**Tooling:** `webpack-bundle-analyzer` and `@next/bundle-analyzer`  
**Lead:** Tresor (Frontend Lead)

---

## 1. Asset Payload Breakdown

| Asset Type | File Name / Chunk | Uncompressed Size | Gzipped Size | Brotli Size | Recommended Target (Gzip) | Status |
|---|---|---|---|---|---|---|
| **Vendor JS** | `vendors-chunk.js` | **1,842 KB** | **482 KB** | **410 KB** | **< 200 KB** | Exceeds Budget |
| **Main App JS** | `main-app.js` | **612 KB** | **158 KB** | **132 KB** | **< 100 KB** | Near Budget |
| **POS Module Chunk** | `pos-counter.chunk.js`| **384 KB** | **94 KB** | **78 KB** | **< 60 KB** | High |
| **Icons & Font Chunk** | `icons-fonts.chunk.js`| **310 KB** | **82 KB** | **68 KB** | **< 40 KB** | High |
| **Global Stylesheet** | `main.css` | **220 KB** | **44 KB** | **36 KB** | **< 30 KB** | Acceptable |
| **Total Initial JS** | *(Initial Entry)* | **2,454 KB** | **640 KB** | **542 KB** | **< 300 KB** | **Action Required** |

---

## 2. Bloat Culprits & Remediation Targets

1. **Full Lodash / Date-Fns Imports:**  
   Codebase imports entire libraries (`import { format } from 'date-fns'`) instead of cherry-picked path imports, pulling in 180 KB of unused utility methods.
2. **Heavy Charting Library on Entry Bundle:**  
   Chart.js is bundled into the primary vendor chunk rather than being dynamically imported (`React.lazy`) on the reporting dashboard route.
3. **Unused Lucide Icon Sets:**  
   Whole icon packages are imported across components without tree-shaking optimization.

