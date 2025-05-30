import { companies, documents, annotations, type Company, type Document, type Annotation, type InsertCompany, type InsertDocument, type InsertAnnotation } from "@shared/schema";
import { db } from "./db";
import { eq, desc, like, or, sql } from "drizzle-orm";

export interface IStorage {
  // Company methods
  getCompanyByCik(cik: string): Promise<Company | undefined>;
  createCompany(company: InsertCompany): Promise<Company>;
  searchCompanies(query: string): Promise<Company[]>;

  // Document methods
  getDocument(id: number): Promise<Document | undefined>;
  getDocumentByAccession(accessionNumber: string): Promise<Document | undefined>;
  createDocument(document: InsertDocument): Promise<Document>;
  updateDocumentContent(id: number, content: string, totalPages?: number): Promise<void>;
  updateDocumentLastAccessed(id: number): Promise<void>;
  getRecentDocuments(limit: number): Promise<(Document & { companyName: string })[]>;
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

  async updateDocumentContent(id: number, content: string, totalPages?: number): Promise<void> {
    const updates: any = { content };
    if (totalPages) {
      updates.totalPages = totalPages;
    }
    await db
      .update(documents)
      .set(updates)
      .where(eq(documents.id, id));
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
