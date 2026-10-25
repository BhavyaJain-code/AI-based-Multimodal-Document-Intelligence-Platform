const { GoogleGenerativeAI } = require('@google/generative-ai');
const { extractOfflineSchema } = require('./schemaExtractor');

class AIService {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || null;
    this.modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    this.genAI = this.apiKey ? new GoogleGenerativeAI(this.apiKey) : null;
  }

  setApiKey(key) {
    this.apiKey = key ? key.trim() : null;
    if (this.apiKey) {
      this.genAI = new GoogleGenerativeAI(this.apiKey);
    } else {
      this.genAI = null;
    }
  }

  setModel(model) {
    if (model) {
      this.modelName = model;
    }
  }

  isOnline() {
    return !!this.apiKey;
  }

  /**
   * Helper to invoke Gemini with multimodal inline data if present
   */
  async callGemini(prompt, multimodalDoc = null, jsonMode = false) {
    if (!this.genAI) {
      throw new Error('Gemini API key is not configured.');
    }

    const modelOptions = {
      model: this.modelName
    };

    if (jsonMode) {
      modelOptions.generationConfig = { responseMimeType: 'application/json' };
    }

    const model = this.genAI.getGenerativeModel(modelOptions);
    const parts = [];

    if (multimodalDoc && multimodalDoc.metadata && multimodalDoc.metadata.base64Data) {
      parts.push({
        inlineData: {
          data: multimodalDoc.metadata.base64Data,
          mimeType: multimodalDoc.metadata.mimeType || 'application/pdf'
        }
      });
    }

    parts.push(prompt);

    const result = await model.generateContent(parts);
    const response = await result.response;
    return response.text();
  }

  /**
   * Comprehensive Document Analysis
   */
  async analyzeDocument(doc) {
    if (this.genAI) {
      try {
        const prompt = `You are a high-performance Multimodal Document Intelligence Platform.
Analyze the following document with extreme precision.

Return a JSON object strictly matching this format:
{
  "documentClassification": "Contract / Invoice / Financial Report / Technical Paper / etc.",
  "confidenceScore": 0.95,
  "executiveSummary": "Concise 3-4 sentence high-level summary of the document contents and purpose.",
  "keyEntities": {
    "organizations": ["List of companies, vendors, organizations mentioned"],
    "people": ["List of names or roles found"],
    "dates": ["Key dates, deadlines, or historical milestones"],
    "monetaryValues": ["All amounts, currencies, prices, or budgets found"],
    "keyMetrics": ["Numerical metrics, percentages, KPIs, or counts"]
  },
  "actionItems": [
    "List of actionable next steps, deliverables, or follow-ups mentioned in or derived from the document"
  ],
  "potentialRisksOrFlags": [
    "Legal liabilities, ambiguities, tight deadlines, missing information, or notable discrepancies"
  ],
  "sentimentAndTone": "Formal / Legal / Commercial / Analytical / Urgent"
}

Document Text preview:
${doc.extractedText.slice(0, 15000)}`;

        const raw = await this.callGemini(prompt, doc.metadata.isMultimodal ? doc : null, true);
        const parsed = JSON.parse(raw);
        return {
          ...parsed,
          provider: `Gemini AI (${this.modelName})`
        };
      } catch (err) {
        console.warn('[AIService] Gemini analysis failed, using fallback engine:', err.message);
      }
    }

    // Heuristic Fallback Engine
    return this.fallbackAnalyzeDocument(doc);
  }

  /**
   * Question & Answering (RAG with citations)
   */
  async answerQuestion(question, doc, relevantChunks = []) {
    if (this.genAI) {
      try {
        const contextText = relevantChunks.length > 0
          ? relevantChunks.map((c, i) => `[Source ${i + 1} (${c.docName || 'Doc'}, score: ${c.score})]:\n${c.text}`).join('\n\n')
          : doc ? doc.extractedText.slice(0, 10000) : '';

        const prompt = `You are a Document Intelligence Assistant answering questions strictly grounded in the provided document context.

Question: ${question}

Retrieved Grounding Context:
${contextText}

Instructions:
1. Provide a direct, authoritative, and clear answer.
2. Cite the specific evidence, quotes, or sections where the answer was found.
3. If the context does not contain sufficient information to answer definitively, state what is known and clarify what is missing.`;

        const answerText = await this.callGemini(prompt, (doc && doc.metadata && doc.metadata.isMultimodal) ? doc : null, false);
        return {
          answer: answerText,
          sources: relevantChunks.map(c => ({
            chunkId: c.chunkId,
            score: c.score,
            textSnippet: c.text.slice(0, 200) + '...'
          })),
          provider: `Gemini AI (${this.modelName})`
        };
      } catch (err) {
        console.warn('[AIService] Gemini Q&A failed, using fallback engine:', err.message);
      }
    }

    // Fallback Q&A
    return this.fallbackAnswerQuestion(question, doc, relevantChunks);
  }

  /**
   * Structured Schema Extraction
   */
  async extractSchema(doc, schemaType, customSchemaDef = null) {
    if (this.genAI) {
      try {
        let prompt = '';
        if (schemaType === 'custom' && customSchemaDef) {
          prompt = `Extract information from this document conforming strictly to this user-defined schema:
${JSON.stringify(customSchemaDef, null, 2)}

Return a valid JSON object matching the requested schema. Document text:
${doc.extractedText.slice(0, 15000)}`;
        } else {
          prompt = `Extract all details conforming to the "${schemaType}" schema.
Return a structured JSON object containing all relevant extracted fields.
Document text:
${doc.extractedText.slice(0, 15000)}`;
        }

        const raw = await this.callGemini(prompt, doc.metadata.isMultimodal ? doc : null, true);
        const parsed = JSON.parse(raw);
        return {
          schema: schemaType,
          extractedData: parsed,
          confidence: 0.96,
          provider: `Gemini AI (${this.modelName})`
        };
      } catch (err) {
        console.warn('[AIService] Gemini Schema extraction failed, using fallback engine:', err.message);
      }
    }

    // Fallback schema extraction
    return extractOfflineSchema(doc.extractedText, schemaType);
  }

  /**
   * Compare two documents
   */
  async compareDocuments(doc1, doc2, lexicalComparison) {
    if (this.genAI) {
      try {
        const prompt = `Compare the following two documents in detail.
Document 1: "${doc1.fileName}"
Content: ${doc1.extractedText.slice(0, 8000)}

Document 2: "${doc2.fileName}"
Content: ${doc2.extractedText.slice(0, 8000)}

Return a JSON object:
{
  "executiveComparison": "Summary of how these two documents relate, differ, or complement each other.",
  "keySimilarities": ["List of core points both documents agree on or share"],
  "keyDifferences": ["Key discrepancies, conflicting clauses, numerical variations, or divergent scopes"],
  "recommendations": ["Actionable insights or next steps based on comparing both documents"]
}`;

        const raw = await this.callGemini(prompt, null, true);
        const parsed = JSON.parse(raw);
        return {
          ...parsed,
          lexical: lexicalComparison,
          provider: `Gemini AI (${this.modelName})`
        };
      } catch (err) {
        console.warn('[AIService] Gemini comparison failed, using fallback:', err.message);
      }
    }

    // Fallback comparison
    return {
      executiveComparison: `Comparative analysis between "${doc1.fileName}" (${doc1.metadata.wordCount} words) and "${doc2.fileName}" (${doc2.metadata.wordCount} words). The lexical similarity index is estimated at ${lexicalComparison.comparison.similarityPercentage}%.`,
      keySimilarities: lexicalComparison.comparison.sharedKeyTerms.length > 0
        ? lexicalComparison.comparison.sharedKeyTerms.map(t => `Shared contextual terminology: "${t}"`)
        : ['Common technical terminology and documentation conventions.'],
      keyDifferences: [
        `Word volume difference: Document 1 has ${doc1.metadata.wordCount} words vs Document 2 with ${doc2.metadata.wordCount} words (Ratio: ${lexicalComparison.comparison.sizeRatio}).`,
        `Unique terms in "${doc1.fileName}": ${lexicalComparison.doc1.uniqueKeyTerms.slice(0, 6).join(', ')}.`,
        `Unique terms in "${doc2.fileName}": ${lexicalComparison.doc2.uniqueKeyTerms.slice(0, 6).join(', ')}.`
      ],
      recommendations: [
        'Review unique clauses identified in each document prior to contract or report finalization.',
        'Cross-reference referenced metrics and terminology across both artifacts.'
      ],
      lexical: lexicalComparison,
      provider: 'Offline Heuristic Engine'
    };
  }

  // --- Fallback implementations ---

  fallbackAnalyzeDocument(doc) {
    const text = doc.extractedText || '';
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    // Classification heuristics
    let classification = 'General Text Document';
    const lower = text.toLowerCase();
    if (lower.includes('invoice') || lower.includes('bill to') || lower.includes('amount due')) {
      classification = 'Commercial Invoice / Billing';
    } else if (lower.includes('agreement') || lower.includes('contract') || lower.includes('confidentiality')) {
      classification = 'Legal Agreement / Contract';
    } else if (lower.includes('resume') || lower.includes('curriculum vitae') || lower.includes('education') && lower.includes('experience')) {
      classification = 'Resume / Professional CV';
    } else if (lower.includes('abstract') || lower.includes('methodology') || lower.includes('references')) {
      classification = 'Academic / Technical Research';
    } else if (doc.docType === 'csv') {
      classification = 'Tabular Dataset';
    }

    // Entity extraction heuristics
    const orgMatches = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Inc|LLC|Corp|Corporation|Ltd|Company|Group|University|Technologies|Labs))\b/g) || [];
    const dateMatches = text.match(/\b(?:\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})\b/gi) || [];
    const moneyMatches = text.match(/(?:\$|USD|EUR|GBP|₹|INR)\s*[\d,]+(?:\.\d{2})?/gi) || [];
    const metricMatches = text.match(/\b\d+(?:\.\d+)?(?:\s*%(?:age)?|\s*(?:MB|GB|TB|kg|km|miles|hours|days|users|requests|ms))\b/gi) || [];

    // Summary lines
    const summaryLines = lines.slice(0, 4).join(' ');

    return {
      documentClassification: classification,
      confidenceScore: 0.88,
      executiveSummary: summaryLines.length > 30 
        ? summaryLines.slice(0, 350) + '...'
        : `This document contains ${doc.metadata.wordCount} words and ${doc.chunks.length} semantic sections. It provides operational details regarding ${doc.fileName}.`,
      keyEntities: {
        organizations: Array.from(new Set(orgMatches)).slice(0, 8),
        people: ['Identified based on document signatures & references'],
        dates: Array.from(new Set(dateMatches)).slice(0, 8),
        monetaryValues: Array.from(new Set(moneyMatches)).slice(0, 8),
        keyMetrics: Array.from(new Set(metricMatches)).slice(0, 8)
      },
      actionItems: [
        'Review key entity details and numerical terms for compliance verification.',
        'Validate cited timelines against project schedules.',
        'Store document index for interactive querying and automated schema extraction.'
      ],
      potentialRisksOrFlags: [
        'Deterministic offline scan performed; connect Gemini API key in settings for deeper reasoning.',
        'Review any missing sign-off dates or unverified counter-parties.'
      ],
      sentimentAndTone: 'Formal / Analytical',
      provider: 'Offline Heuristic Engine'
    };
  }

  fallbackAnswerQuestion(question, doc, relevantChunks) {
    if (relevantChunks.length === 0) {
      return {
        answer: `I could not locate explicit passages addressing "${question}" with high statistical confidence in the indexed document. You can inspect the full text directly or configure a Gemini API key for deep semantic reasoning.`,
        sources: [],
        provider: 'Offline Heuristic Engine'
      };
    }

    const topChunk = relevantChunks[0];
    const cleanAnswer = topChunk.text.slice(0, 400).trim();

    return {
      answer: `Based on the most relevant excerpt identified in "${topChunk.docName}":\n\n"${cleanAnswer}..."`,
      sources: relevantChunks.slice(0, 3).map(c => ({
        chunkId: c.chunkId,
        score: c.score,
        textSnippet: c.text.slice(0, 200) + '...'
      })),
      provider: 'Offline Heuristic Engine'
    };
  }
}

module.exports = new AIService();
