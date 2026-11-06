# Frontend Lighthouse Audit (2026-Q4)
**Measurement Window:** Week 4 (Mon 12 Oct – Fri 16 Oct 2026)  
**Target Environment:** Production Client (`app.ubwenge.com`), Google Chrome Lighthouse v12  
**Throttle Configuration:** Simulated 4G (1.6 Mbps down / 750 Kbps up, 150ms RTT), Desktop and Mobile presets  
**Lead:** Tresor (Frontend Lead) & Synthesis by Adeline

---

## 1. Surface Performance Summary

| Surface | Device Preset | Lighthouse Performance (0–100) | First Contentful Paint (FCP) | Largest Contentful Paint (LCP) | Cumulative Layout Shift (CLS) | Total Blocking Time (TBT) | Q4 Target Score |
|---|---|---|---|---|---|---|---|
| **POS Sales Counter** | Desktop | **48 / 100** | 1.8s | **3.9s** | 0.08 | **840ms** | **> 85 / 100** |
| **Patient Portal (Mobile)** | Mobile (Moto G4) | **54 / 100** | 2.4s | **4.6s** | 0.14 | **720ms** | **> 80 / 100** |
| **Medication Search** | Mobile | **51 / 100** | 2.1s | **4.2s** | 0.05 | **690ms** | **> 85 / 100** |
| **Hospital Inpatient Ward** | Desktop | **58 / 100** | 1.6s | **3.4s** | 0.11 | **560ms** | **> 80 / 100** |
| **Pharmacy Admin Console**| Desktop | **62 / 100** | 1.5s | **3.1s** | 0.04 | **480ms** | **> 85 / 100** |
| **Super Admin Platform** | Desktop | **66 / 100** | 1.4s | **2.8s** | 0.02 | **390ms** | **> 80 / 100** |

---

## 2. Primary Bottlenecks Identified

1. **Massive Vendor Bundle Blocking Main Thread:**  
   The initial vendor JavaScript bundle parses for over 650ms on mobile devices before React hydration completes.
2. **Unoptimized Raster Images:**  
   Pharmacy logos and medication package images are loaded uncompressed in raw PNG format rather than optimized WebP/AVIF.
3. **Layout Shift on Dynamic Lists:**  
   Medication search results and cart rows inject without skeleton placeholders, causing high Cumulative Layout Shift (CLS).

