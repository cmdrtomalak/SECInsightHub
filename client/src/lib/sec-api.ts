import type { DocumentChunk } from "@shared/schema";

// SEC EDGAR API utilities
export interface SECCompany {
  cik: string;
  name: string;
  ticker?: string;
}

export interface SECFiling {
  accessionNumber: string;
  filingDate: string;
  reportDate?: string;
  acceptanceDateTime: string;
  form: string;
  fileNumber?: string;
  filmNumber?: string;
  items?: string;
  size: number;
  isXBRL: boolean;
  isInlineXBRL: boolean;
  primaryDocument: string;
  primaryDocDescription: string;
}

export interface SECSubmission {
  cik: string;
  name: string;
  ticker?: string;
  sic: string;
  sicDescription: string;
  filings: {
    recent: {
      accessionNumber: string[];
      filingDate: string[];
      reportDate: string[];
      acceptanceDateTime: string[];
      form: string[];
      fileNumber: string[];
      filmNumber: string[];
      items: string[];
      size: number[];
      isXBRL: number[];
      isInlineXBRL: number[];
      primaryDocument: string[];
      primaryDocDescription: string[];
    };
  };
}

export async function searchSECCompanies(query: string): Promise<SECCompany[]> {
  try {
    // This would typically use the SEC company tickers API
    // For now, we'll use a simplified approach
    const response = await fetch(`${import.meta.env.BASE_URL}api/companies/search?q=${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error("Failed to search SEC companies");
    return response.json();
  } catch (error) {
    console.error("Error searching SEC companies:", error);
    return [];
  }
}

export async function getSECCompanyFilings(cik: string): Promise<SECSubmission | null> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}api/sec/company/${cik}/filings`);
    if (!response.ok) throw new Error("Failed to fetch SEC filings");
    return response.json();
  } catch (error) {
    console.error("Error fetching SEC filings:", error);
    return null;
  }
}

export async function getSECDocumentFullContent(documentId: number): Promise<string | null> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}api/documents/${documentId}/full-content`);
    if (response.ok) {
      const data = await response.json();
      return data.content; // Assuming the server sends { content: "..." }
    } else if (response.status === 404) {
      console.warn(`Full content not found for document ID ${documentId}`);
      return null;
    } else {
      console.error(`Error fetching full content for document ${documentId}. Status: ${response.status}`);
      return null;
    }
  } catch (error) {
    console.error(`Network or other error fetching full content for document ${documentId}:`, error);
    return null;
  }
}

export async function getSECDocument(url: string): Promise<string | null> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}api/sec/document?url=${encodeURIComponent(url)}`);
    if (!response.ok) throw new Error("Failed to fetch SEC document");
    const data = await response.json();
    return data.content;
  } catch (error) {
    console.error("Error fetching SEC document:", error);
    return null;
  }
}

export function buildSECDocumentUrl(accessionNumber: string, primaryDocument: string): string {
  // Remove dashes from accession number for URL
  const cleanAccessionNumber = accessionNumber.replace(/-/g, "");
  return `https://www.sec.gov/Archives/edgar/data/${cleanAccessionNumber}/${accessionNumber}/${primaryDocument}`;
}

export function parseSECFilings(submission: SECSubmission): SECFiling[] {
  const { recent } = submission.filings;
  const filings: SECFiling[] = [];

  for (let i = 0; i < recent.accessionNumber.length; i++) {
    filings.push({
      accessionNumber: recent.accessionNumber[i],
      filingDate: recent.filingDate[i],
      reportDate: recent.reportDate[i],
      acceptanceDateTime: recent.acceptanceDateTime[i],
      form: recent.form[i],
      fileNumber: recent.fileNumber[i],
      filmNumber: recent.filmNumber[i],
      items: recent.items[i],
      size: recent.size[i],
      isXBRL: Boolean(recent.isXBRL[i]),
      isInlineXBRL: Boolean(recent.isInlineXBRL[i]),
      primaryDocument: recent.primaryDocument[i],
      primaryDocDescription: recent.primaryDocDescription[i],
    });
  }

  return filings;
}

export function filterFilings(filings: SECFiling[], formTypes: string[] = ["10-K", "10-Q"]): SECFiling[] {
  return filings.filter(filing => formTypes.includes(filing.form));
}

export async function getSECDocumentPage(documentId: number, pageNumber: number): Promise<DocumentChunk | null> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}api/documents/${documentId}/page/${pageNumber}`);
    if (!response.ok) {
      if (response.status === 404) {
        console.warn(`Document page not found: docId=${documentId}, page=${pageNumber}`);
        return null;
      }
      throw new Error(`Failed to fetch document page ${pageNumber} for document ${documentId}. Status: ${response.status}`);
    }
    const data: DocumentChunk = await response.json();
    return data;
  } catch (error) {
    console.error(`Error fetching document page ${pageNumber} for document ${documentId}:`, error);
    return null;
  }
}
