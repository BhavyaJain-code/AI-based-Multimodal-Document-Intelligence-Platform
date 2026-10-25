require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { parseDocument } = require('./services/documentParser');
const ragEngine = require('./services/ragEngine');
const aiService = require('./services/aiService');
const { SCHEMAS } = require('./services/schemaExtractor');

const app = express();
const PORT = process.env.PORT || 3000;

// Setup upload directory
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer memory storage (fast, reliable, no file locks)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50 MB limit
}).any();

// Middleware
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// In-memory analysis cache
const analysisCache = new Map();

// --- API Routes ---

/**
 * Platform status and settings
 */
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    documentCount: ragEngine.getAllDocuments().length,
    indexedChunks: ragEngine.totalChunks,
    isOnlineAi: aiService.isOnline(),
    activeModel: aiService.modelName,
    availableSchemas: Object.values(SCHEMAS)
  });
});

/**
 * Configure API Key or Model
 */
app.post('/api/settings', (req, res) => {
  const { apiKey, model } = req.body;
  if (apiKey !== undefined) {
    aiService.setApiKey(apiKey);
  }
  if (model) {
    aiService.setModel(model);
  }
  res.json({
    success: true,
    isOnlineAi: aiService.isOnline(),
    activeModel: aiService.modelName
  });
});

/**
 * Upload single or multiple documents
 */
app.post('/api/upload', (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      console.error('Upload middleware error:', err);
      return res.status(400).json({ error: err.message || 'File upload error.' });
    }

    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files were uploaded.' });
      }

      const processed = [];
      for (const file of req.files) {
        try {
          const doc = await parseDocument(file);
          ragEngine.addDocument(doc);
          processed.push({
            id: doc.id,
            fileName: doc.fileName,
            docType: doc.docType,
            metadata: {
              wordCount: doc.metadata.wordCount,
              charCount: doc.metadata.charCount,
              pages: doc.metadata.pages,
              detectedType: doc.metadata.detectedType,
              isMultimodal: doc.metadata.isMultimodal
            },
            chunksCount: doc.chunks.length,
            createdAt: doc.createdAt
          });
        } catch (docErr) {
          console.error(`Error parsing ${file.originalname}:`, docErr);
        }
      }

      return res.json({
        success: true,
        count: processed.length,
        documents: processed
      });
    } catch (err) {
      console.error('Upload processing error:', err);
      return res.status(500).json({ error: 'Failed to process document upload: ' + err.message });
    }
  });
});

/**
 * List all documents
 */
app.get('/api/documents', (req, res) => {
  const docs = ragEngine.getAllDocuments().map(d => ({
    id: d.id,
    fileName: d.fileName,
    docType: d.docType,
    metadata: {
      wordCount: d.metadata.wordCount,
      charCount: d.metadata.charCount,
      pages: d.metadata.pages,
      detectedType: d.metadata.detectedType,
      isMultimodal: d.metadata.isMultimodal
    },
    chunksCount: d.chunks.length,
    createdAt: d.createdAt,
    hasAnalysis: analysisCache.has(d.id)
  }));
  res.json({ documents: docs });
});

/**
 * Get specific document details & text preview
 */
app.get('/api/documents/:id', (req, res) => {
  const doc = ragEngine.getDocument(req.params.id);
  if (!doc) {
    return res.status(404).json({ error: 'Document not found.' });
  }

  res.json({
    id: doc.id,
    fileName: doc.fileName,
    docType: doc.docType,
    metadata: doc.metadata,
    extractedText: doc.extractedText,
    chunks: doc.chunks,
    analysis: analysisCache.get(doc.id) || null
  });
});

/**
 * Delete a document
 */
app.delete('/api/documents/:id', (req, res) => {
  const docId = req.params.id;
  ragEngine.removeDocument(docId);
  analysisCache.delete(docId);
  res.json({ success: true, message: 'Document removed.' });
});

/**
 * Run Comprehensive Document Intelligence Analysis
 */
app.post('/api/documents/:id/analyze', async (req, res) => {
  try {
    const doc = ragEngine.getDocument(req.params.id);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    const analysis = await aiService.analyzeDocument(doc);
    analysisCache.set(doc.id, analysis);

    res.json({
      success: true,
      docId: doc.id,
      analysis
    });
  } catch (err) {
    console.error('Analysis error:', err);
    res.status(500).json({ error: 'Document analysis failed: ' + err.message });
  }
});

/**
 * RAG Document Q&A Query
 */
app.post('/api/query', async (req, res) => {
  try {
    const { question, docId } = req.body;
    if (!question || !question.trim()) {
      return res.status(400).json({ error: 'Question is required.' });
    }

    const doc = docId ? ragEngine.getDocument(docId) : null;
    const relevantChunks = ragEngine.search(question, { docId: docId || null, topK: 4 });

    const result = await aiService.answerQuestion(question, doc, relevantChunks);

    res.json({
      success: true,
      question,
      answer: result.answer,
      sources: result.sources,
      provider: result.provider
    });
  } catch (err) {
    console.error('Query error:', err);
    res.status(500).json({ error: 'Query processing failed: ' + err.message });
  }
});

/**
 * Structured Schema Extraction
 */
app.post('/api/schema/extract', async (req, res) => {
  try {
    const { docId, schemaType, customSchema } = req.body;
    const doc = ragEngine.getDocument(docId);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    const result = await aiService.extractSchema(doc, schemaType, customSchema);
    res.json({
      success: true,
      docId,
      result
    });
  } catch (err) {
    console.error('Schema extraction error:', err);
    res.status(500).json({ error: 'Schema extraction failed: ' + err.message });
  }
});

/**
 * Cross-document comparison
 */
app.post('/api/compare', async (req, res) => {
  try {
    const { docId1, docId2 } = req.body;
    if (!docId1 || !docId2) {
      return res.status(400).json({ error: 'Two document IDs are required for comparison.' });
    }

    const doc1 = ragEngine.getDocument(docId1);
    const doc2 = ragEngine.getDocument(docId2);

    if (!doc1 || !doc2) {
      return res.status(404).json({ error: 'One or both documents not found.' });
    }

    const lexicalComparison = ragEngine.compareDocuments(docId1, docId2);
    const synthesis = await aiService.compareDocuments(doc1, doc2, lexicalComparison);

    res.json({
      success: true,
      synthesis
    });
  } catch (err) {
    console.error('Comparison error:', err);
    res.status(500).json({ error: 'Comparison failed: ' + err.message });
  }
});

/**
 * Seed Sample Multimodal Documents for Instant Evaluation
 */
app.post('/api/seed-samples', async (req, res) => {
  try {
    const samples = [
      {
        fileName: 'Master_Services_Agreement_2025.txt',
        content: `MASTER SERVICES AGREEMENT
This Master Services Agreement ("Agreement") is entered into as of January 15, 2025 ("Effective Date"), by and between Apex Global Solutions Inc. ("Provider"), located at 500 Enterprise Way, San Francisco, CA, and Meridian Financial Corp ("Client"), located at 120 Wall Street, New York, NY.

1. SCOPE OF SERVICES
Provider shall deliver artificial intelligence consulting, multimodal document extraction pipelines, and cloud database optimization services as set forth in individual Statements of Work ("SOW").

2. FEES AND PAYMENT
Client agrees to pay Provider a monthly retainer of $45,000.00 USD, payable within thirty (30) days from invoice date (Net 30). Late payments incur interest at 1.5% per month. Total estimated annual contract value is $540,000.00 USD.

3. INTELLECTUAL PROPERTY & CONFIDENTIALITY
All custom source code developed specifically for Client shall be owned by Client. Provider retains proprietary ownership of its core underlying algorithms and framework models. Each party agrees to maintain strict confidentiality of proprietary data for a duration of five (5) years.

4. LIMITATION OF LIABILITY
Neither party shall be liable for indirect, incidental, or consequential damages. Maximum aggregate liability of either party under this Agreement shall not exceed the total fees paid by Client during the preceding twelve (12) months.

5. GOVERNING LAW & DISPUTE RESOLUTION
This Agreement shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to conflict of laws principles. Any arbitration shall take place in New York, NY.

IN WITNESS WHEREOF, authorized representatives have executed this Agreement.
Signed: David Vance (CEO, Apex Global Solutions Inc.)
Signed: Sarah Jenkins (COO, Meridian Financial Corp)`
      },
      {
        fileName: 'Invoice_INV-849201.txt',
        content: `COMMERCIAL INVOICE
Invoice Number: INV-849201
Date of Issue: October 14, 2025
Payment Due Date: November 13, 2025
Billing Terms: Net 30

ISSUED BY:
Apex Global Solutions Inc.
500 Enterprise Way, Suite 400
San Francisco, CA 94105
Tax ID: 94-8219401

BILLED TO:
Meridian Financial Corp
Accounts Payable Department
120 Wall Street, 18th Floor
New York, NY 10005

DESCRIPTION OF SERVICES:
1. Enterprise Multimodal Document Intelligence Platform License (Q4 2025): $32,000.00
2. Custom OCR & RAG Semantic Pipeline Deployment: $18,500.00
3. Dedicated SLA Support & Model Fine-Tuning: $4,500.00

Subtotal: $55,000.00
Sales Tax (8.25%): $4,537.50
Total Amount Due: $59,537.50 USD

PAYMENT INSTRUCTIONS:
Wire Transfer to Silicon Valley Bank
Routing: 121000358
Account: 9482019481
Reference: INV-849201`
      },
      {
        fileName: 'Research_Multimodal_RAG_Benchmark.txt',
        content: `RESEARCH SYNTHESIS & BENCHMARK REPORT
Title: Comparative Evaluation of Multimodal Vision-Language Models for Enterprise Document Retrieval
Authors: Dr. Elena Rostova, Marcus Thorne, Antigravity AI Labs
Date: August 2025

ABSTRACT:
Enterprise document intelligence demands simultaneous understanding of unstructured typography, dense tabular layouts, handwritten signatures, and high-dimensional technical diagrams. We present a systematic benchmark evaluating Gemini 1.5 Flash against hybrid TF-IDF/Dense embeddings across a corpus of 14,200 financial reports and legal contracts.

KEY FINDINGS:
1. Multimodal ingestion pipelines reduced layout parsing errors from 18.4% to 1.9% compared to traditional OCR pipelines.
2. Cross-document synthesis achieved a citation precision rate of 96.8% and retrieval latency under 120ms.
3. Structured JSON extraction fidelity scored 99.1% across multi-currency commercial invoices.

METRICS:
- Overall Retrieval F1-Score: 0.942
- Latency P95: 142 ms
- Zero-Shot Entity Recognition Accuracy: 93.7%

RECOMMENDATIONS:
Enterprises should adopt hybrid multimodal indexing architectures combining vector retrieval with deterministic lexical verification for mission-critical audit trails.`
      }
    ];

    const seeded = [];
    for (const s of samples) {
      const tempPath = path.join(UPLOADS_DIR, s.fileName);
      fs.writeFileSync(tempPath, s.content, 'utf-8');
      const doc = await parseDocument({
        path: tempPath,
        originalname: s.fileName,
        mimetype: 'text/plain'
      });
      ragEngine.addDocument(doc);
      seeded.push(doc.fileName);
    }

    res.json({
      success: true,
      message: `Seeded ${seeded.length} sample multimodal documents`,
      seeded
    });
  } catch (err) {
    console.error('Seed error:', err);
    res.status(500).json({ error: 'Failed to seed samples: ' + err.message });
  }
});

// Global JSON error handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(err.status || 500).json({
    error: err.message || 'An unexpected error occurred on the server.'
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`=====================================================`);
  console.log(`Multimodal Document Intelligence Platform is running!`);
  console.log(`Local URL: http://localhost:${PORT}`);
  console.log(`=====================================================`);
});
