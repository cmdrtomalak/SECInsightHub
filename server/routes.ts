import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertCompanySchema, insertDocumentSchema, insertAnnotationSchema, type InsertDocument } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Company routes
  app.get("/api/companies/search", async (req, res) => {
    try {
      const { q } = req.query;
      if (!q || typeof q !== 'string') {
        return res.status(400).json({ error: "Query parameter 'q' is required" });
      }
      
      // First search local database
      const localCompanies = await storage.searchCompanies(q);
      
      // If we have local results, return them
      if (localCompanies.length > 0) {
        return res.json(localCompanies);
      }
      
      // Otherwise, search SEC company tickers data
      try {
        const response = await fetch('https://www.sec.gov/files/company_tickers.json', {
          headers: {
            'User-Agent': 'SEC Document Analyzer contact@example.com',
          },
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch SEC company data');
        }
        
        const companyData = await response.json();
        const searchResults = [];
        
        // Search through the company tickers data
        for (const [key, company] of Object.entries(companyData)) {
          const companyInfo = company as any;
          const name = companyInfo.title?.toLowerCase() || '';
          const ticker = companyInfo.ticker?.toLowerCase() || '';
          const cik = companyInfo.cik_str?.toString() || '';
          const queryLower = q.toLowerCase();
          
          if (name.includes(queryLower) || ticker.includes(queryLower) || cik.includes(queryLower)) {
            searchResults.push({
              cik: cik.padStart(10, '0'),
              name: companyInfo.title,
              ticker: companyInfo.ticker
            });
            
            if (searchResults.length >= 10) break;
          }
        }
        
        res.json(searchResults);
      } catch (secError) {
        console.error("Error fetching SEC data:", secError);
        res.json([]); // Return empty array if SEC API fails
      }
    } catch (error) {
      console.error("Error searching companies:", error);
      res.status(500).json({ error: "Failed to search companies" });
    }
  });

  app.get("/api/companies/:cik", async (req, res) => {
    try {
      const { cik } = req.params;
      const company = await storage.getCompanyByCik(cik);
      
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }
      
      res.json(company);
    } catch (error) {
      console.error("Error fetching company:", error);
      res.status(500).json({ error: "Failed to fetch company" });
    }
  });

  app.post("/api/companies", async (req, res) => {
    try {
      const companyData = insertCompanySchema.parse(req.body);
      const company = await storage.createCompany(companyData);
      res.status(201).json(company);
    } catch (error) {
      console.error("Error creating company:", error);
      res.status(400).json({ error: "Invalid company data" });
    }
  });

  // Document routes

  // New endpoint to get the full content of a document
  app.get("/api/documents/:documentId/full-content", async (req, res) => {
    try {
      const documentId = parseInt(req.params.documentId);

      if (isNaN(documentId)) {
        return res.status(400).json({ error: "Invalid document ID." });
      }

      const fullContent = await storage.getFullDocumentContent(documentId);

      if (fullContent === null || fullContent === '') {
        return res.status(404).json({ error: "Full document content not found." });
      }

      // Return as JSON: { "content": "full document text..." }
      res.json({ content: fullContent });
    } catch (error) {
      const docIdParam = req.params.documentId || "unknown";
      console.error(`Error fetching full document content for docId=${docIdParam}:`, error);
      res.status(500).json({ error: "Failed to fetch full document content." });
    }
  });

  app.get("/api/documents/recent", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const documents = await storage.getRecentDocuments(limit);
      res.json(documents);
    } catch (error) {
      console.error("Error fetching recent documents:", error);
      res.status(500).json({ error: "Failed to fetch recent documents" });
    }
  });

  app.get("/api/documents/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const document = await storage.getDocument(id);
      
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      
      // Update last accessed time
      await storage.updateDocumentLastAccessed(id);
      
      res.json(document);
    } catch (error) {
      console.error("Error fetching document:", error);
      res.status(500).json({ error: "Failed to fetch document" });
    }
  });

  app.get("/api/companies/:cik/documents", async (req, res) => {
    try {
      const { cik } = req.params;
      const company = await storage.getCompanyByCik(cik);
      
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }
      
      const documents = await storage.getCompanyDocuments(company.id);
      res.json(documents);
    } catch (error) {
      console.error("Error fetching company documents:", error);
      res.status(500).json({ error: "Failed to fetch company documents" });
    }
  });

  app.post("/api/documents", async (req, res) => {
    try {
      const incomingData = req.body;

      // 1. Validate incoming metadata
      const importRequestSchema = insertDocumentSchema.pick({
        companyId: true,
        accessionNumber: true,
        formType: true,
        filingDate: true,
        documentUrl: true,
        title: true,
        reportDate: true
      });

      const validatedData = importRequestSchema.parse(incomingData);

      // 2. Fetch content from SEC using validatedData.documentUrl
      let fullContent: string;
      try {
        const secFetchResponse = await fetch(validatedData.documentUrl, {
          headers: { 'User-Agent': 'SEC Document Analyzer contact@example.com' },
        });
        if (!secFetchResponse.ok) {
          console.error(`[Server] POST /api/documents: Failed to fetch from SEC. Status: ${secFetchResponse.status}, URL: ${validatedData.documentUrl}`);
          return res.status(502).json({ error: "Failed to fetch document content from SEC.", sec_status: secFetchResponse.status });
        }
        fullContent = await secFetchResponse.text();
      } catch (fetchError) {
        console.error(`[Server] POST /api/documents: Network or other error fetching from SEC URL: ${validatedData.documentUrl}`, fetchError);
        return res.status(503).json({ error: "Service unavailable: Error fetching document from SEC." });
      }

      if (!fullContent || fullContent.trim() === '') {
        // This check is after fetching from SEC
        return res.status(400).json({ error: "Fetched document content from SEC is empty or invalid." });
      }

      // 3. Create initial document entry (metadata only)
      const documentToCreate: InsertDocument = {
        ...validatedData,
        content: null,
        totalPages: 0,
      };
      const newDocumentMetadata = await storage.createDocument(documentToCreate);

      // 4. Process content (chunking)
      await storage.updateDocumentContent(newDocumentMetadata.id, fullContent);

      const finalDocument = await storage.getDocument(newDocumentMetadata.id);
      if (!finalDocument) {
        console.error("[Server] POST /api/documents: Critical error - Failed to retrieve document immediately after creation/update for ID:", newDocumentMetadata.id);
        return res.status(500).json({ error: "Internal server error: Failed to retrieve document after import." });
      }
      res.status(201).json(finalDocument);

    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("[Server] POST /api/documents: Zod validation error for incoming metadata:", error.flatten().fieldErrors);
        return res.status(400).json({ error: "Invalid metadata provided for import.", details: error.flatten().fieldErrors });
      } else {
        console.error("[Server] POST /api/documents: General error during import:", error);
        return res.status(500).json({ error: "Failed to import document due to an unexpected internal server error." });
      }
    }
  });

  app.patch("/api/documents/:id/content", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { content, totalPages } = req.body; // totalPages from body will be ignored by storage.updateDocumentContent
      
      if (typeof content !== 'string') { // Ensure content is a string
        return res.status(400).json({ error: "Content is required and must be a string" });
      }
      
      await storage.updateDocumentContent(id, content); // Pass only id and content
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating document content:", error);
      res.status(500).json({ error: "Failed to update document content" });
    }
  });

  // New endpoint to get a specific page/chunk of a document
  app.get("/api/documents/:documentId/page/:pageNumber", async (req, res) => {
    try {
      const documentId = parseInt(req.params.documentId);
      const pageNumber = parseInt(req.params.pageNumber);

      if (isNaN(documentId) || isNaN(pageNumber)) {
        return res.status(400).json({ error: "Invalid document ID or page number." });
      }

      const chunk = await storage.getDocumentChunk(documentId, pageNumber);

      if (!chunk) {
        return res.status(404).json({ error: "Document page not found." });
      }

      res.json(chunk);
    } catch (error) {
      console.error(`Error fetching document page: docId=${req.params.documentId}, page=${req.params.pageNumber}`, error);
      res.status(500).json({ error: "Failed to fetch document page." });
    }
  });

  // Annotation routes
  app.get("/api/documents/:id/annotations", async (req, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const annotations = await storage.getDocumentAnnotations(documentId);
      res.json(annotations);
    } catch (error) {
      console.error("Error fetching annotations:", error);
      res.status(500).json({ error: "Failed to fetch annotations" });
    }
  });

  app.post("/api/annotations", async (req, res) => {
    try {
      const annotationData = insertAnnotationSchema.parse(req.body);
      const annotation = await storage.createAnnotation(annotationData);
      res.status(201).json(annotation);
    } catch (error) {
      console.error("Error creating annotation:", error);
      res.status(400).json({ error: "Invalid annotation data" });
    }
  });

  app.patch("/api/annotations/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      
      const annotation = await storage.updateAnnotation(id, updates);
      res.json(annotation);
    } catch (error) {
      console.error("Error updating annotation:", error);
      res.status(500).json({ error: "Failed to update annotation" });
    }
  });

  app.delete("/api/annotations/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteAnnotation(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting annotation:", error);
      res.status(500).json({ error: "Failed to delete annotation" });
    }
  });

  app.get("/api/annotations/search", async (req, res) => {
    try {
      const { q } = req.query;
      if (!q || typeof q !== 'string') {
        return res.status(400).json({ error: "Query parameter 'q' is required" });
      }
      
      const annotations = await storage.searchAnnotations(q);
      res.json(annotations);
    } catch (error) {
      console.error("Error searching annotations:", error);
      res.status(500).json({ error: "Failed to search annotations" });
    }
  });

  // SEC EDGAR API proxy routes
  app.get("/api/sec/company/:cik/filings", async (req, res) => {
    try {
      const { cik } = req.params;
      const response = await fetch(
        `https://data.sec.gov/submissions/CIK${cik.padStart(10, '0')}.json`,
        {
          headers: {
            'User-Agent': 'SEC Document Analyzer contact@example.com',
          },
        }
      );

      if (!response.ok) {
        return res.status(response.status).json({ error: "Failed to fetch SEC data" });
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("Error fetching SEC filings:", error);
      res.status(500).json({ error: "Failed to fetch SEC filings" });
    }
  });

  app.get("/api/sec/document", async (req, res) => {
    try {
      const { url } = req.query;
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: "URL parameter is required" });
      }

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'SEC Document Analyzer contact@example.com',
        },
      });

      if (!response.ok) {
        return res.status(response.status).json({ error: "Failed to fetch document" });
      }

      const content = await response.text();
      res.json({ content });
    } catch (error) {
      console.error("Error fetching SEC document:", error);
      res.status(500).json({ error: "Failed to fetch SEC document" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
