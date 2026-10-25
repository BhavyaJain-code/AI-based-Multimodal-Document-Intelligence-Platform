const fs = require('fs');
const path = require('path');

// Safe dynamic require for pdf-parse
let pdfParse = null;
try {
  pdfParse = require('pdf-parse');
} catch (e) {
  console.warn('[Parser] pdf-parse not loaded yet, will use fallback parser if needed.');
}

/**
 * Clean and normalize text
 */
function normalizeText(text) {
  if (!text) return '';
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, '    ')
    .trim();
}

/**
 * Split text into semantic chunks for RAG and search
 */
function chunkText(text, maxChunkSize = 800, overlap = 150) {
  const paragraphs = text.split(/\n\s*\n/);
  const chunks = [];
  let currentChunk = '';
  let chunkIndex = 0;
  let charStart = 0;

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    if ((currentChunk + '\n\n' + trimmed).length <= maxChunkSize) {
      currentChunk = currentChunk ? currentChunk + '\n\n' + trimmed : trimmed;
    } else {
      if (currentChunk) {
        chunks.push({
          id: `chunk_${chunkIndex++}`,
          text: currentChunk,
          charStart: charStart,
          charEnd: charStart + currentChunk.length,
          wordCount: currentChunk.split(/\s+/).filter(Boolean).length
        });
        charStart += Math.max(0, currentChunk.length - overlap);
        // keep overlap portion
        const overlapSlice = currentChunk.slice(-overlap);
        currentChunk = overlapSlice + '\n\n' + trimmed;
      } else {
        // If single paragraph is larger than maxChunkSize, split by sentence or slice
        let start = 0;
        while (start < trimmed.length) {
          const slice = trimmed.slice(start, start + maxChunkSize);
          chunks.push({
            id: `chunk_${chunkIndex++}`,
            text: slice,
            charStart: charStart + start,
            charEnd: charStart + start + slice.length,
            wordCount: slice.split(/\s+/).filter(Boolean).length
          });
          start += (maxChunkSize - overlap);
        }
        currentChunk = '';
      }
    }
  }

  if (currentChunk.trim()) {
    chunks.push({
      id: `chunk_${chunkIndex++}`,
      text: currentChunk.trim(),
      charStart: charStart,
      charEnd: charStart + currentChunk.length,
      wordCount: currentChunk.split(/\s+/).filter(Boolean).length
    });
  }

  return chunks;
}

/**
 * Parse CSV into headers, rows, and formatted markdown table
 */
function parseCsv(rawContent) {
  const lines = rawContent.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [], markdownTable: '' };

  const parseRow = (line) => {
    const values = [];
    let insideQuotes = false;
    let currentValue = '';

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        insideQuotes = !insideQuotes;
      } else if (char === ',' && !insideQuotes) {
        values.push(currentValue.trim());
        currentValue = '';
      } else {
        currentValue += char;
      }
    }
    values.push(currentValue.trim());
    return values;
  };

  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).map(parseRow);

  // Markdown table representation
  let markdownTable = '| ' + headers.join(' | ') + ' |\n';
  markdownTable += '| ' + headers.map(() => '---').join(' | ') + ' |\n';
  rows.slice(0, 50).forEach(row => {
    markdownTable += '| ' + headers.map((_, i) => (row[i] || '')).join(' | ') + ' |\n';
  });

  return { headers, rows, markdownTable };
}

/**
 * Basic PDF text stream fallback extractor if pdf-parse encounters issue
 */
function fallbackPdfTextExtraction(buffer) {
  try {
    const raw = buffer.toString('binary');
    const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
    let extracted = [];
    let match;
    while ((match = streamRegex.exec(raw)) !== null) {
      const str = match[1];
      // Search for text in parentheses (text) Tj or [(text)] TJ
      const textMatches = str.match(/\(([^()]+)\)\s*Tj/g);
      if (textMatches) {
        textMatches.forEach(tm => {
          const m = tm.match(/\(([^()]+)\)/);
          if (m && m[1]) extracted.push(m[1]);
        });
      }
    }
    return extracted.join(' ').replace(/\\([()\\])/g, '$1') || 'Extracted PDF text representation';
  } catch (err) {
    return 'Binary PDF content';
  }
}

/**
 * Main parseDocument function
 */
async function parseDocument(file) {
  const originalName = file.originalname || 'document_' + Date.now();
  const mimeType = file.mimetype || 'application/octet-stream';
  const ext = path.extname(originalName).toLowerCase();
  
  let buffer;
  let fileSize = 0;
  if (file.buffer) {
    buffer = file.buffer;
    fileSize = file.size || buffer.length;
  } else if (file.path && fs.existsSync(file.path)) {
    fileSize = fs.statSync(file.path).size;
    buffer = fs.readFileSync(file.path);
  } else {
    buffer = Buffer.from('');
    fileSize = 0;
  }

  let docType = 'text';
  let extractedText = '';
  let metadata = {
    fileName: originalName,
    fileSize: fileSize,
    mimeType: mimeType,
    pages: 1,
    detectedType: 'General Document',
    isMultimodal: false,
    base64Data: null,
    tableData: null
  };

  if (ext === '.pdf' || mimeType === 'application/pdf') {
    docType = 'pdf';
    metadata.isMultimodal = true;
    metadata.detectedType = 'PDF Document';
    metadata.base64Data = buffer.toString('base64');

    if (pdfParse) {
      try {
        const data = await pdfParse(buffer);
        extractedText = normalizeText(data.text);
        metadata.pages = data.numpages || 1;
        if (data.info) {
          metadata.pdfTitle = data.info.Title || null;
          metadata.pdfAuthor = data.info.Author || null;
        }
      } catch (err) {
        console.warn('[Parser] pdf-parse failed, falling back:', err.message);
        extractedText = fallbackPdfTextExtraction(buffer);
      }
    } else {
      extractedText = fallbackPdfTextExtraction(buffer);
    }
  } else if (['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tiff'].includes(ext) || mimeType.startsWith('image/')) {
    docType = 'image';
    metadata.isMultimodal = true;
    metadata.detectedType = 'Visual/Image Document';
    metadata.base64Data = buffer.toString('base64');
    
    // Offline placeholder description for image until Multimodal AI inspects it
    extractedText = `[Visual Document: ${originalName}]\nFormat: ${ext.replace('.', '').toUpperCase()} image (${Math.round(stats.size / 1024)} KB).\nNative multimodal visual processing enabled for Gemini AI.\nInspecting image contents, visual layout, typography, charts, and diagrams.`;
  } else if (ext === '.csv') {
    docType = 'csv';
    metadata.detectedType = 'Tabular Spreadsheet (CSV)';
    const raw = buffer.toString('utf-8');
    const { headers, rows, markdownTable } = parseCsv(raw);
    metadata.tableData = { headers, rowCount: rows.length };
    extractedText = `Table Headers: ${headers.join(', ')}\nTotal Rows: ${rows.length}\n\nData Preview:\n${markdownTable}\n\nRaw Content:\n${raw}`;
  } else if (ext === '.json') {
    docType = 'json';
    metadata.detectedType = 'Structured JSON Document';
    try {
      const parsed = JSON.parse(buffer.toString('utf-8'));
      extractedText = JSON.stringify(parsed, null, 2);
    } catch {
      extractedText = buffer.toString('utf-8');
    }
  } else {
    // Plain text, markdown, code, config files
    docType = 'text';
    metadata.detectedType = ext === '.md' ? 'Markdown Document' : 'Plain Text Document';
    extractedText = normalizeText(buffer.toString('utf-8'));
  }

  // Calculate statistics
  const wordCount = extractedText.split(/\s+/).filter(Boolean).length;
  const charCount = extractedText.length;
  const estimatedTokens = Math.ceil(wordCount * 1.33);

  metadata.wordCount = wordCount;
  metadata.charCount = charCount;
  metadata.estimatedTokens = estimatedTokens;

  // Split into chunks for retrieval
  const chunks = chunkText(extractedText);

  return {
    id: 'doc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    fileName: originalName,
    docType,
    metadata,
    extractedText,
    chunks,
    createdAt: new Date().toISOString()
  };
}

module.exports = {
  parseDocument,
  chunkText,
  normalizeText
};
