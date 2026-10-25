/**
 * In-memory RAG Indexer and Vector / TF-IDF Retrieval Engine
 */

const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren\'t',
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'can',
  'cannot', 'could', 'couldn\'t', 'did', 'didn\'t', 'do', 'does', 'doesn\'t', 'doing', 'don\'t', 'down',
  'during', 'each', 'few', 'for', 'from', 'further', 'had', 'hadn\'t', 'has', 'hasn\'t', 'have', 'haven\'t',
  'having', 'he', 'he\'d', 'he\'ll', 'he\'s', 'her', 'here', 'here\'s', 'hers', 'herself', 'him', 'himself',
  'his', 'how', 'how\'s', 'i', 'i\'d', 'i\'ll', 'i\'m', 'i\'ve', 'if', 'in', 'into', 'is', 'isn\'t', 'it',
  'it\'s', 'its', 'itself', 'let\'s', 'me', 'more', 'most', 'mustn\'t', 'my', 'myself', 'no', 'nor', 'not',
  'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
  'same', 'shan\'t', 'she', 'she\'d', 'she\'ll', 'she\'s', 'should', 'shouldn\'t', 'so', 'some', 'such',
  'than', 'that', 'that\'s', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'there\'s',
  'these', 'they', 'they\'d', 'they\'ll', 'they\'re', 'they\'ve', 'this', 'those', 'through', 'to', 'too',
  'under', 'until', 'up', 'very', 'was', 'wasn\'t', 'we', 'we\'d', 'we\'ll', 'we\'re', 'we\'ve', 'were',
  'weren\'t', 'what', 'what\'s', 'when', 'when\'s', 'where', 'where\'s', 'which', 'while', 'who', 'who\'s',
  'whom', 'why', 'why\'s', 'with', 'won\'t', 'would', 'wouldn\'t', 'you', 'you\'d', 'you\'ll', 'you\'re',
  'you\'ve', 'your', 'yours', 'yourself', 'yourselves'
]);

class RagEngine {
  constructor() {
    this.documents = new Map(); // docId -> Document
    this.chunks = []; // All chunks across all docs
    this.docFrequency = new Map(); // term -> count of chunks containing term
    this.totalChunks = 0;
  }

  tokenize(text) {
    if (!text) return [];
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2 && !STOP_WORDS.has(t));
  }

  computeTermFrequency(tokens) {
    const tf = new Map();
    for (const token of tokens) {
      tf.set(token, (tf.get(token) || 0) + 1);
    }
    const len = tokens.length || 1;
    const normalized = new Map();
    for (const [k, v] of tf.entries()) {
      normalized.set(k, v / len);
    }
    return normalized;
  }

  addDocument(doc) {
    this.documents.set(doc.id, doc);
    this.rebuildIndex();
  }

  removeDocument(docId) {
    this.documents.delete(docId);
    this.rebuildIndex();
  }

  getDocument(docId) {
    return this.documents.get(docId);
  }

  getAllDocuments() {
    return Array.from(this.documents.values());
  }

  rebuildIndex() {
    this.chunks = [];
    this.docFrequency = new Map();

    for (const doc of this.documents.values()) {
      for (const chunk of doc.chunks) {
        const tokens = this.tokenize(chunk.text);
        const tf = this.computeTermFrequency(tokens);
        const indexedChunk = {
          chunkId: chunk.id,
          docId: doc.id,
          docName: doc.fileName,
          text: chunk.text,
          tokens,
          tf,
          charStart: chunk.charStart,
          charEnd: chunk.charEnd
        };
        this.chunks.push(indexedChunk);

        // Update document frequency
        const uniqueTokens = new Set(tokens);
        for (const token of uniqueTokens) {
          this.docFrequency.set(token, (this.docFrequency.get(token) || 0) + 1);
        }
      }
    }
    this.totalChunks = this.chunks.length;
  }

  search(query, options = {}) {
    const { docId = null, topK = 5 } = options;
    const queryTokens = this.tokenize(query);
    if (queryTokens.length === 0 || this.totalChunks === 0) {
      return [];
    }

    const queryTf = this.computeTermFrequency(queryTokens);
    const scoredChunks = [];

    const candidates = docId 
      ? this.chunks.filter(c => c.docId === docId)
      : this.chunks;

    for (const chunk of candidates) {
      let score = 0;
      let matches = 0;

      for (const [qTerm, qTermFreq] of queryTf.entries()) {
        const df = this.docFrequency.get(qTerm) || 1;
        const idf = Math.log((this.totalChunks + 1) / df) + 1;
        const chunkTfVal = chunk.tf.get(qTerm) || 0;

        if (chunkTfVal > 0) {
          score += (qTermFreq * idf) * (chunkTfVal * idf);
          matches++;
        }
      }

      // Exact substring booster
      const lowerQuery = query.toLowerCase().trim();
      if (lowerQuery.length > 4 && chunk.text.toLowerCase().includes(lowerQuery)) {
        score += 2.0;
      }

      if (score > 0) {
        scoredChunks.push({
          score: parseFloat(score.toFixed(4)),
          matches,
          docId: chunk.docId,
          docName: chunk.docName,
          chunkId: chunk.chunkId,
          text: chunk.text,
          charStart: chunk.charStart,
          charEnd: chunk.charEnd
        });
      }
    }

    scoredChunks.sort((a, b) => b.score - a.score);
    return scoredChunks.slice(0, topK);
  }

  compareDocuments(docId1, docId2) {
    const doc1 = this.documents.get(docId1);
    const doc2 = this.documents.get(docId2);

    if (!doc1 || !doc2) {
      throw new Error('One or both documents not found for comparison');
    }

    const tokens1 = new Set(this.tokenize(doc1.extractedText));
    const tokens2 = new Set(this.tokenize(doc2.extractedText));

    const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
    const unique1 = new Set([...tokens1].filter(x => !tokens2.has(x)));
    const unique2 = new Set([...tokens2].filter(x => !tokens1.has(x)));

    const unionSize = tokens1.size + tokens2.size - intersection.size;
    const jaccardSimilarity = unionSize > 0 ? (intersection.size / unionSize) : 0;

    return {
      doc1: {
        id: doc1.id,
        name: doc1.fileName,
        type: doc1.metadata.detectedType,
        wordCount: doc1.metadata.wordCount,
        charCount: doc1.metadata.charCount,
        estimatedTokens: doc1.metadata.estimatedTokens,
        uniqueKeyTerms: Array.from(unique1).slice(0, 15)
      },
      doc2: {
        id: doc2.id,
        name: doc2.fileName,
        type: doc2.metadata.detectedType,
        wordCount: doc2.metadata.wordCount,
        charCount: doc2.metadata.charCount,
        estimatedTokens: doc2.metadata.estimatedTokens,
        uniqueKeyTerms: Array.from(unique2).slice(0, 15)
      },
      comparison: {
        similarityPercentage: Math.round(jaccardSimilarity * 100),
        sharedKeyTerms: Array.from(intersection).slice(0, 20),
        sizeRatio: (doc1.metadata.wordCount / (doc2.metadata.wordCount || 1)).toFixed(2),
        commonTopics: Array.from(intersection).filter(t => t.length > 5).slice(0, 10)
      }
    };
  }
}

module.exports = new RagEngine();
