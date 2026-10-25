# Multimodal Document Intelligence Platform

An enterprise-grade, high-precision AI document intelligence platform capable of extracting, parsing, summarizing, querying, and comparing multimodal files (PDFs, plain text, tabular CSVs, structured JSON, and image scans).

---

## Strict Frontend Aesthetic Requirements Implemented

- **Typography:** Strictly **Times New Roman** (`'Times New Roman', Times, Georgia, serif !important;`) applied universally across all UI elements, inputs, buttons, tables, and dialogs.
- **Visual Assets:** **Zero logos and zero images** in accordance with specification (`dont use and log or images`). Clean typographical layout with structured card borders and tables.
- **Custom Color Palette Tokens:**
  ```css
  :root {
    --header: #2c3e50;
    --navigation: #4a5f7a;
    --background: #ecf0f3;
    --body: #dfe4e8;
    --footer: #1a2634;
    --text: #0f1419;
    --accent: #5d7a99;
    --border: #8fa3b8;
  }
  ```

---

## Core Capabilities & Architecture

1. **Multimodal Document Ingestion & Chunking (`services/documentParser.js`)**
   - Supports **PDF** documents (stream & text extraction).
   - Supports **Plain Text & Markdown** (.txt, .md).
   - Supports **Tabular Data** (.csv with automated table parsing).
   - Supports **Structured JSON** (.json).
   - Supports **Visual / Scans** (.png, .jpg, .webp) formatted as multimodal base64 parts for vision models.
   - Text chunking with sliding window overlap for semantic indexing.

2. **Semantic RAG & Retrieval Engine (`services/ragEngine.js`)**
   - In-memory TF-IDF + BM25 term weighting vector search.
   - Exact substring & keyword boosting.
   - Grounded citations with character offsets and confidence scores.

3. **Multimodal Intelligence & AI Engine (`services/aiService.js`)**
   - **Google Gemini Integration:** Native multimodal support using `@google/generative-ai` (`gemini-1.5-flash`, `gemini-2.0-flash`, `gemini-1.5-pro`).
   - **Dual-Engine Architecture:** Seamless offline fallback mode. If no API key is provided, deterministic rule-based NLP extraction executes locally with zero configuration required.
   - **Entity Extraction:** Identifies Organizations, People, Key Dates/Deadlines, Monetary Values, and Metrics/KPIs.
   - **Action Items & Compliance Risks:** Extracts follow-ups, legal liabilities, and missing information.

4. **Structured Schema Extractor (`services/schemaExtractor.js`)**
   - Standardized extraction for:
     - Commercial Invoices & Receipts
     - Legal Contracts & Service Agreements
     - Professional Resumes & CVs
     - Research Papers & Technical Reports
     - Custom User-Defined JSON Schemas
   - Export and copy structured JSON with one click.

5. **Cross-Document Comparison & Synthesis**
   - Compares any two indexed documents side-by-side.
   - Calculates lexical similarity overlap %, vocabulary divergence, size ratios, shared key concepts, and conflicting clauses.

---

## Quick Start Guide

### 1. Start the Server
```bash
npm start
```
The application will launch at `http://localhost:3000`.

### 2. Immediate Testing
- Open `http://localhost:3000` in your web browser.
- Click **"Load Sample Test Suite"** to instantly ingest a sample Master Services Agreement, Commercial Invoice, and Research Paper.
- Navigate to:
  - **Document Intelligence** to run executive summaries and entity scans.
  - **Multimodal Q&A (RAG)** to ask questions with citations.
  - **Schema Extractor** to extract structured invoices or contracts.
  - **Document Comparison** to run side-by-side analysis.
  - **Settings** to optionally add a Gemini API key.
