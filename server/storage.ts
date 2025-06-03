import {
  companies, documents, annotations, documentChunks,
  type Company, type Document, type Annotation, type InsertCompany, type InsertDocument, type InsertAnnotation, type InsertDocumentChunk, type DocumentChunk
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, like, or, sql, and } from "drizzle-orm";

const DEFAULT_CHUNK_SIZE = 1 * 1024 * 1024; // 1MB in characters

export interface IStorage {
  // Company methods
  getCompanyByCik(cik: string): Promise<Company | undefined>;
  createCompany(company: InsertCompany): Promise<Company>;
  searchCompanies(query: string): Promise<Company[]>;

  // Document methods
  getDocument(id: number): Promise<Document | undefined>;
  getDocumentByAccession(accessionNumber: string): Promise<Document | undefined>;
  createDocument(document: InsertDocument): Promise<Document>;
  updateDocumentContent(id: number, content: string, totalPagesInput?: number): Promise<void>; // totalPagesInput will be ignored
  updateDocumentLastAccessed(id: number): Promise<void>;
  getRecentDocuments(limit: number): Promise<(Document & { companyName: string })[]>;
  getDocumentChunk(documentId: number, pageNumber: number): Promise<DocumentChunk | undefined>;
  getCompanyDocuments(companyId: number): Promise<Document[]>;

  // Annotation methods
  getDocumentAnnotations(documentId: number): Promise<Annotation[]>;
  createAnnotation(annotation: InsertAnnotation): Promise<Annotation>;
  updateAnnotation(id: number, updates: Partial<InsertAnnotation>): Promise<Annotation>;
  deleteAnnotation(id: number): Promise<void>;
  searchAnnotations(query: string): Promise<(Annotation & { documentTitle: string; companyName: string })[]>;
}

export class DatabaseStorage implements IStorage {
  async getCompanyByCik(cik: string): Promise<Company | undefined> {
    const [company] = await db.select().from(companies).where(eq(companies.cik, cik));
    return company || undefined;
  }

  async createCompany(insertCompany: InsertCompany): Promise<Company> {
    const [company] = await db
      .insert(companies)
      .values(insertCompany)
      .returning();
    return company;
  }

  async searchCompanies(query: string): Promise<Company[]> {
    return await db
      .select()
      .from(companies)
      .where(
        or(
          like(companies.name, `%${query}%`),
          like(companies.ticker, `%${query}%`),
          like(companies.cik, `%${query}%`)
        )
      )
      .limit(10);
  }

  async getDocument(id: number): Promise<Document | undefined> {
    const [document] = await db.select().from(documents).where(eq(documents.id, id));
    return document || undefined;
  }

  async getDocumentByAccession(accessionNumber: string): Promise<Document | undefined> {
    const [document] = await db
      .select()
      .from(documents)
      .where(eq(documents.accessionNumber, accessionNumber));
    return document || undefined;
  }

  async createDocument(insertDocument: InsertDocument): Promise<Document> {
    const [document] = await db
      .insert(documents)
      .values(insertDocument)
      .returning();
    return document;
  }

  async updateDocumentContent(id: number, content: string, totalPagesInput?: number): Promise<void> {
    // totalPagesInput is ignored, it will be calculated based on chunks.
    console.log(`[Storage updateDocumentContent] Updating document ID ${id}. Received content length: ${content?.length}. Original totalPages (ignored): ${totalPagesInput}`);

    // Clear existing chunks for this document
    await db.delete(documentChunks).where(eq(documentChunks.documentId, id));
    console.log(`[Storage updateDocumentContent] Cleared existing chunks for document ID ${id}`);

    const numChunks = Math.ceil(content.length / DEFAULT_CHUNK_SIZE);
    const newChunks: InsertDocumentChunk[] = [];
    for (let i = 0; i < numChunks; i++) {
      newChunks.push({
        documentId: id,
        pageNumber: i + 1, // 1-based page number
        content: content.substring(i * DEFAULT_CHUNK_SIZE, (i + 1) * DEFAULT_CHUNK_SIZE),
        // createdAt will be set by default by the database
      });
    }

    if (newChunks.length > 0) {
      await db.insert(documentChunks).values(newChunks);
      console.log(`[Storage updateDocumentContent] Inserted ${newChunks.length} new chunks for document ID ${id}`);
    } else {
      console.log(`[Storage updateDocumentContent] No new chunks to insert for document ID ${id} (content might be empty).`);
    }

    // Update the main document entry
    await db
      .update(documents)
      .set({
        totalPages: numChunks > 0 ? numChunks : 1, // Ensure totalPages is at least 1
        content: null, // Clear the main content field, or use a preview: newChunks[0]?.content.substring(0, 500)
        lastAccessedAt: sql`now()` // Keep updating lastAccessedAt
      })
      .where(eq(documents.id, id));
    console.log(`[Storage updateDocumentContent] Updated main document entry for ID ${id}. Set totalPages to ${numChunks > 0 ? numChunks : 1} and cleared content.`);
  }

  async getDocumentChunk(documentId: number, pageNumber: number): Promise<DocumentChunk | undefined> {
    const [chunk] = await db
      .select()
      .from(documentChunks)
      .where(
        and(
          eq(documentChunks.documentId, documentId),
          eq(documentChunks.pageNumber, pageNumber)
        )
      )
      .limit(1);
    if (chunk) {
      console.log(`[Storage getDocumentChunk] Retrieved chunk for document ID ${documentId}, page ${pageNumber}. Chunk content length: ${chunk.content.length}`);
    } else {
      console.log(`[Storage getDocumentChunk] No chunk found for document ID ${documentId}, page ${pageNumber}.`);
    }
    return chunk || undefined;
  }

  async updateDocumentLastAccessed(id: number): Promise<void> {
    await db
      .update(documents)
      .set({ lastAccessedAt: sql`now()` })
      .where(eq(documents.id, id));
  }

  async getRecentDocuments(limit: number): Promise<(Document & { companyName: string })[]> {
    return await db
      .select({
        id: documents.id,
        companyId: documents.companyId,
        accessionNumber: documents.accessionNumber,
        formType: documents.formType,
        filingDate: documents.filingDate,
        reportDate: documents.reportDate,
        documentUrl: documents.documentUrl,
        title: documents.title,
        content: documents.content,
        totalPages: documents.totalPages,
        lastAccessedAt: documents.lastAccessedAt,
        createdAt: documents.createdAt,
        companyName: companies.name,
      })
      .from(documents)
      .innerJoin(companies, eq(documents.companyId, companies.id))
      .orderBy(desc(documents.lastAccessedAt))
      .limit(limit);
  }

  async getCompanyDocuments(companyId: number): Promise<Document[]> {
    return await db
      .select()
      .from(documents)
      .where(eq(documents.companyId, companyId))
      .orderBy(desc(documents.filingDate));
  }

  async getDocumentAnnotations(documentId: number): Promise<Annotation[]> {
    return await db
      .select()
      .from(annotations)
      .where(eq(annotations.documentId, documentId))
      .orderBy(desc(annotations.createdAt));
  }

  async createAnnotation(insertAnnotation: InsertAnnotation): Promise<Annotation> {
    const [annotation] = await db
      .insert(annotations)
      .values(insertAnnotation)
      .returning();
    return annotation;
  }

  async updateAnnotation(id: number, updates: Partial<InsertAnnotation>): Promise<Annotation> {
    const [annotation] = await db
      .update(annotations)
      .set({ ...updates, updatedAt: sql`now()` })
      .where(eq(annotations.id, id))
      .returning();
    return annotation;
  }

  async deleteAnnotation(id: number): Promise<void> {
    await db.delete(annotations).where(eq(annotations.id, id));
  }

  async searchAnnotations(query: string): Promise<(Annotation & { documentTitle: string; companyName: string })[]> {
    return await db
      .select({
        id: annotations.id,
        documentId: annotations.documentId,
        type: annotations.type,
        selectedText: annotations.selectedText,
        note: annotations.note,
        color: annotations.color,
        pageNumber: annotations.pageNumber,
        startOffset: annotations.startOffset,
        endOffset: annotations.endOffset,
        createdAt: annotations.createdAt,
        updatedAt: annotations.updatedAt,
        documentTitle: documents.title,
        companyName: companies.name,
      })
      .from(annotations)
      .innerJoin(documents, eq(annotations.documentId, documents.id))
      .innerJoin(companies, eq(documents.companyId, companies.id))
      .where(
        or(
          like(annotations.selectedText, `%${query}%`),
          like(annotations.note, `%${query}%`)
        )
      )
      .orderBy(desc(annotations.createdAt))
      .limit(50);
  }
}

export const storage = new DatabaseStorage();
