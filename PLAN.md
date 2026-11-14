# Pallet Pack-Out: Project Plan

## 1. Goal

A web app, usable from any computer, that takes a product's **length × width × height** (plus weight and constraints), works out the best pallet pack-out with real math, and produces a printable **specification sheet**. It covers the core of CAPE Pack and TOPS Pro.

---

## 2. What already exists

| Tool | Model | What it does well | What we take from it |
|---|---|---|---|
| **Esko CAPE Pack** | Cloud subscription | Case sizing, pallet patterns, compares several pallet setups side by side, compression strength and board grade, truck/container loading, carbon reporting | Side-by-side comparison of candidate patterns; compression check; truck utilization |
| **TOPS Pro** (TOPS Software) | Desktop license | Single-SKU case and pallet design, live 3D view, "what-if" changes (overhang, layer limits, intermediate packs), stacking analysis | What-if editing with instant recalculation; 3D view; overhang and layer limits |
| **Quick Pallet Maker / CubeDesigner** | Low cost | Pallet patterns, reverse-engineers a case size from primary pack plus count | Case-design mode later |
| **Free web calculators** (Fulfill.com, 3PL Center, Premier Tech) | Free | Fast block, split and pinwheel search; shows rotated cases; constraint panel | Simple, fast input-to-answer interface; mark rotated cases on the diagram |

**Where we beat them:** the free tools only try simple block and two-block patterns, so they often miss the true maximum. CAPE and TOPS run on a better engine but are expensive and heavy. Our target is CAPE/TOPS-grade math in a free-tool-style interface, with a spec sheet built for how *your* team works.

---

## 3. The math (core engine)

This part decides whether the tool is "accurate and mathematically based." The problem is a well-studied one in operations research: the **Manufacturer's Pallet Loading Problem (MPLP)**.

### 3.1 Orientation (which side faces up)
- A case can stand on any of 3 faces: L×W, L×H or W×H footprint.
- The user can lock "This Side Up," which allows only the H-vertical orientation.
- The engine solves each allowed orientation and compares the results.

### 3.2 Layer pattern (2D, the hard part)
Fit as many `l × w` rectangles as possible onto the usable pallet area `L × W`, where usable area = pallet plus allowed overhang, or minus required underhang.

We use several algorithms, run all of them, and keep the best:
1. **Block (column) pattern:** all cases in one orientation. `floor(L/l) × floor(W/w)`, tried both ways.
2. **Two-block / split pattern:** one block of cases in one orientation plus a strip of rotated cases. Every split point is tried.
3. **Recursive partitioning, published "5-block" / G4 heuristics** (Lins, Lins & Morabito; Scheithauer & Terno; Birgin et al.). These split the pallet into rectangles recursively, cover pinwheel and interlock patterns, and are proven optimal or near-optimal on standard benchmark sets.
4. **Upper bound check:**
   - Area bound: `floor(LW / lw)`.
   - Barnes bound.
   - When our best result equals the upper bound, the sheet says **"Proven optimal."** When it doesn't, the sheet shows the gap. Commercial tools don't show this.

All dimensions are normalized to their usable integer combinations (raster points) so that the search runs exactly, without floating-point error.

### 3.3 Stacking (3D)
- `layers = floor((max load height − pallet deck height) / case height)`
- Capped by: max gross weight, max layers set by the user, and compression limit (3.4).
- **Stacking style:** a dropdown on every pack-out, for both cases and die-cut sheet stacks.
  - **Column (all layers the same):** every layer is identical and stacked directly on top of the one below. This gives the strongest compression and the simplest build.
  - **Patterned (interlock):** alternate layers use a different arrangement so stacks or cases bridge the seams below, which ties the load together. The engine generates the alternate layer by:
    - rotating the layer 180° or mirroring it, which helps when the pattern is lopsided, as two-block patterns are;
    - swapping the block and strip positions;
    - using a different pattern with the same count;
    - rotating 90° when the pallet is square.

    It keeps the option with the **most seam overlap**, and the count per layer must not drop.
  - **Auto:** works out both styles and shows them side by side, so you choose. When interlocking needs fewer per layer, the comparison says so.
  - For **die-cut sheets**, "patterned" means alternating the stack layout every **lift**: a set height or sheet count, entered by you. This is how loose-stacked blanks are usually cross-tied.
- The spec sheet labels the style:
  - Column: one layer diagram.
  - Patterned: an **odd-layer diagram and an even-layer diagram** side by side, with the overlap % shown.
- Interlock trades roughly 40–50% of box compression strength for stability. The compression check in Phase 4 applies that penalty automatically.

### 3.4 Compression check (phase 3)
- **McKee formula**: `BCT = 5.87 × ECT × √(caliper × perimeter)`.
- Derated by environment factors: humidity, storage time, overhang, interlock, pallet deck gaps.
- Load on the bottom case = `(layers − 1) × case weight` (plus any double-stacked pallet).
- Result: pass or fail, the safety factor, and the minimum ECT needed.

### 3.5 Metrics reported
Cases per layer, layers, total cases, total units, load height, gross weight, **area utilization %**, **cube utilization %**, overhang and underhang, and center of gravity.

### 3.6 Truck / container (phase 3)
Pallets per 53' trailer, 40' and 20' container. Covers floor-loaded vs. double-stacked, and the weight limit vs. cube limit.

---

## 4. Inputs

- **Product type (dropdown):**
  - **Case:** L × W × H, weight, units per case, orientation locks, name and SKU.
  - **Die-cut sheet (corrugated blank):** L × W plus a **flute dropdown** in place of height. The selected flute sets the sheet thickness, and sheets always lie flat. Optional manual thickness override.
- **Flute table (editable database, like pallets).** These are typical nominal calipers; real values vary by mill, so each can be edited:

  | Flute | Wall | Nominal caliper |
  |---|---|---|
  | F | Single | 1/32" (0.8 mm) |
  | E | Single | 1/16" (1.6 mm) |
  | B | Single | 1/8" (3.2 mm) |
  | C | Single | 5/32" (4.0 mm) |
  | A | Single | 3/16"–1/4" (4.8 mm) |
  | EB | Double | ~3/16" (4.8 mm) |
  | BC | Double | ~1/4" (6.4 mm) |
  | AAA / triple wall | Triple | ~1/2"+ (13 mm) |

  Each flute row also stores a **weight per sq ft**, so sheet weight is calculated automatically as L × W × weight/ft². It can be overridden with a weighed value.
- **Stacking sheets.** The engine treats a stack (or bundle) of sheets as the "case":
  - Layer pattern = how many stacks fit side by side on the pallet. Large blanks are often 1 per layer; small blanks fit several.
  - Sheet count per stack = floor(usable height ÷ caliper).
  - The spec sheet reports **sheets per stack, stacks per pallet and total sheets**.
  - **Decided:**
    - Sheets go in **loose stacks**, straight up to the max height, with no bundles.
    - Heights use **nominal caliper only**: sheets × caliper, with no crush factor.
    - **Strapping** is an optional checkbox. It adds the strap count and direction to the spec sheet; there is no height or weight change unless entered.
- **Pallet:** preset library and custom sizes.
  - 48×40 GMA
  - 42×42
  - 48×48
  - EUR 1200×800
  - 1200×1000
- **Constraints:** max load height, max gross weight, overhang or underhang per side, max layers, column vs. interlock.
- **Units:** inches/lb or mm/kg, with a toggle. Internally everything is stored in mm and g, as integers, for exactness.

---

## 5. Outputs

1. **Results comparison screen:** the top candidates side by side, CAPE-style, for example "Block 40 cs vs. Pinwheel 44 cs."
2. **Interactive views:**
   - 2D top-down layer diagram, with rotated cases shaded and cases numbered.
   - 3D rotatable pallet view.
3. **Specification sheet (PDF, letter or A4):**
   - Header: company logo, product name, SKU, date, revision, prepared by.
   - Case data: dimensions, weight, units per case, orientation.
   - Pallet data: type, dimensions, deck height.
   - Pack-out summary: cases per layer × layers = total cases, total units, load dimensions, gross weight.
   - Layer pattern diagram(s), plus odd/even layers when interlocked.
   - 3D isometric image of the full load.
   - Side elevation with dimensions.
   - Efficiency: area %, cube %, "proven optimal" flag or optimality gap.
   - Compression result and trailer count (once phase 3 is done).
   - Notes and approval signature block.
4. **Export:** PDF, plus CSV/Excel of the numbers.

---

## 6. Technology

| Layer | Choice | Why |
|---|---|---|
| Front end | **Next.js (React) + TypeScript** | Runs in any browser; one codebase |
| Engine | **Pure TypeScript package**, run in a Web Worker | Instant what-if recalculation in the browser; the same code runs on the server for PDFs; unit-tested on its own |
| 3D view | **Three.js** (react-three-fiber) | Industry standard for browser 3D |
| 2D diagrams | **SVG** | Sharp in both the browser and the PDF |
| Spec sheet PDF | HTML template → PDF via headless Chromium (Playwright) | Pixel-exact match between the screen and the PDF; easy to brand |
| Database and auth | **Postgres (Supabase)** | Saved products and pallets, history and revisions, user logins |
| Hosting | Vercel (or the company's own server) | Accessible from anywhere; low cost |

---

## 7. Build phases

**Phase 1: Engine and proof of accuracy**
- Orientation handling.
- Block, two-block and recursive-partition algorithms.
- Upper bounds.
- Layer stacking with height and weight limits.
- Test suite against published benchmark instances (the Cover I/II pallet loading sets, with known optimal answers) **and against your real CAPE/TOPS outputs**. Target: match or beat them on every case.

**Phase 2: Web app MVP**
- Input form.
- Pallet presets.
- Results comparison.
- 2D and 3D views.
- **PDF spec sheet.**
- Units toggle.

**Phase 3: Saved data and teams**
- Logins.
- Product and pallet library.
- Saved pack-outs with revision history.
- Branded templates.

**Phase 4: Advanced analysis**
- Compression / BCT check.
- Interlock patterns.
- Truck and container loading.
- Overhang what-ifs.

**Phase 5 (optional): Case design**
- Primary product → best case count and case size → pallet. This is TOPS Pro's full chain.
- Mixed-SKU pallets.

---

## 8. Decisions made (2026-11-13)

| Topic | Decision | Effect on the plan |
|---|---|---|
| Input | **Case dimensions only** | Phase 5 (case design) is out of scope for now |
| Pallets | **Pallet database you can edit.** Default is the **48×40 2-way** pallet; you add custom sizes | Pallet table with L, W, deck height, tare weight, entry type (2-way/4-way), and max load. Pallet presets move from "built-in" to "seed data in the database" in Phase 2 instead of Phase 3 |
| Users | **Just you** | No logins in v1. One private deployment, so team features drop out of Phase 3 |
| Mixed SKU | **Single SKU per pallet** | No change to the engine scope |

**2-way pallet note:** on a 2-way pallet, forklifts enter only from the 40" ends, and the stringers run along the 48" length. The engine will record pallet orientation: the length direction is the stringer direction, and the 2D diagrams and spec sheet label the fork-entry sides. Underhang and overhang can be set separately on the fork-entry faces and on the side faces.

| Default limits | **Max height 52"**, **max gross weight 5,000 lb** | Both can be changed for each pack-out. The height is assumed to be overall, *including* the pallet deck, which is how CAPE and TOPS measure it |

## 9. Spec sheet layout (based on CAPE and TOPS reports)

**What the vendors' reports contain**
- *CAPE Pack* report templates use these fields:
  - solution reference, date and time, units, user text lines 1–6;
  - maximum height and weight;
  - layers, cases per layer, cases per load;
  - area and cube efficiency;
  - case outside and inside dimensions, net and gross weight, board caliper and material;
  - the x/y/z position and orientation of every case.
- *TOPS Pro* pallet reports show:
  - shipcase and unit load outside and inside dimensions;
  - net and gross weight;
  - loading pattern, cases per layer, layers per load;
  - area and cube efficiency, and a Walmart efficiency score.

  They can be saved as PDF, CSV or XML.
- No public sample PDF was found for either product, so this layout is built from the field lists in their user guides.

**Reference: a real TOPS Pro pallet report (from you)**

The sheet is a 2×2 grid with a notes box:
- Top left: 3D view of the full load, with dimensions.
- Top right: "exploded" 3D view with the top layer lifted, to show the pattern.
- Bottom left: 3D drawing of the case, with outside dimensions.
- Bottom right: data table.
- Cases are colored by orientation (yellow vs. red).

The data table has three columns, Shipper inside dims, Shipper outside dims, and Unit Load including the pallet, each giving Ln / Wd / Ht / Gross weight / Cube. Below that it shows:
- the orientation used ("Height Vert");
- shipper count;
- area and cubic efficiency;
- cases per layer, layers per load;
- the pattern (interlock);
- RSC area, the corrugated board per case and per load.

Every number on that sheet has been worked back out to check the math:

| TOPS value | How it is calculated | Check |
|---|---|---|
| 10 cases/layer, load 48.60 × 39.00 | Two-block pattern: 3×2 cases at 16.2 × 11.4, plus 4 rotated cases in a strip (4 × 11.4 = 45.6 ≤ 48.6; 2 × 11.4 + 16.2 = 39.0). Allows 0.30" overhang on each 40" end | ✔ |
| Height 49.50 | 5 layers × 9.1 + 4.0 pallet deck | ✔ |
| Gross 315 lb | 50 × 5.00 lb + **65 lb pallet** | ✔ |
| Area efficiency 96.19 % | Case footprint per layer ÷ **pallet** area (48 × 40), *not* the load footprint | ✔ exact |
| Cubic efficiency 89.32 % | Area efficiency × (stacked case height 45.5 ÷ usable height 49.0). The maximum load height in that file must have been 53" | ✔ exact |
| Inside vs. outside dims | Outside = inside + 2 × caliper (L, W) and + 4 × caliper (H, flaps). Caliper is about 0.156" (C-flute) | ✔ |

**This becomes Phase 1 test case #1:** the engine must reproduce 10 / 5 / 50 cases, 48.60 × 39.00 × 49.50, 96.19 % area and 89.32 % cubic efficiency.

**What we keep from TOPS:**
- 3D views of the full load and of the exploded layers;
- case drawing;
- inside / outside / unit-load table;
- color by orientation;
- notes box.

**What we do better:**
- **Pattern diagram that can actually be built from:** a flat top-down view of each layer with numbered cases, dimensions and fork-entry arrows. TOPS shows the pattern only in 3D, which is hard for a pallet builder to follow.
- **Big headline numbers:** cases/layer × layers = cases/pallet, plus total units, in large type at the top.
- **Limits panel:** height and weight used against the 52" and 5,000 lb limits, overhang per side, and what controlled the layer count.
- **Clear definitions:** efficiencies are labeled with exactly what they measure, plus the proven-optimal flag.
- **Inputs a pallet builder needs:** product name, SKU, spec #, revision, prepared and approved lines. TOPS shows only "Untitled."
- **Modern look:** clean type, a color-blind-safe two-tone case palette, vector drawings that print sharply, letter or A4.

**Our one-page spec sheet (letter, portrait)**

| Block | Contents |
|---|---|
| Header | Logo (optional), "Pallet Pack-Out Specification", product name, SKU / item #, spec #, revision, date, prepared by |
| Case data | Outside L × W × H, case weight, units per case, case orientation on the pallet (which face is down), "This Side Up" flag |
| Pallet data | Pallet name, L × W × deck height, empty pallet weight, entry type (2-way), fork-entry faces marked |
| Pack-out summary (large print) | **Ti × Hi = cases per pallet** (e.g. 10 × 6 = 60), total units, overall load L × W × H, net load weight, gross weight incl. pallet |
| Limits check | Height used / 52" max, weight used / 5,000 lb max, which limit decided the layer count, overhang and underhang per side |
| Efficiency | Area utilization %, cube utilization %, **proven-optimal flag or gap to the upper bound**, pattern type (block, two-block, pinwheel, etc.) |
| Diagrams | Top view of the layer pattern, with cases numbered, rotated cases shaded and fork entry marked. Odd and even layers if interlocked. Side elevations (length and width faces) with dimensions. 3D isometric of the full load |
| Stacking | Column or interlock; compression check (Phase 4) |
| Notes / approval | Free-text notes, plus Prepared / Approved signature and date lines |

**Exports:** PDF (the spec sheet) and CSV (every number above, plus each case's x/y/z position, like CAPE's data export).

## 10. Still open

1. A logo or company name for the header, or leave it blank for now?
2. Do you have any real CAPE or TOPS printouts to test against? They're not required; the engine will also be checked against published benchmark problems.
