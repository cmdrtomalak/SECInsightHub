import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, FileText, Calendar } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Company } from "@shared/schema";

interface CompanySearchProps {
  onDocumentSelect: (documentId: number) => void;
}

export default function CompanySearch({ onDocumentSelect }: CompanySearchProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCompany, setSelectedCompany] = useState<any>(null);
  const [showFilings, setShowFilings] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["/api/companies/search", searchQuery],
    queryFn: async () => {
      if (!searchQuery.trim()) return [];
      const response = await fetch(`${import.meta.env.BASE_URL}api/companies/search?q=${encodeURIComponent(searchQuery)}`);
      if (!response.ok) throw new Error("Failed to search companies");
      return response.json();
    },
    enabled: searchQuery.length >= 2,
  });

  const { data: secFilings = null, isLoading: isLoadingFilings } = useQuery({
    queryKey: ["/api/sec/company", selectedCompany?.cik, "filings"],
    queryFn: async () => {
      if (!selectedCompany) return null;
      const response = await fetch(`${import.meta.env.BASE_URL}api/sec/company/${selectedCompany.cik}/filings`);
      if (!response.ok) throw new Error("Failed to fetch SEC filings");
      return response.json();
    },
    enabled: !!selectedCompany && showFilings,
  });

  const createCompanyMutation = useMutation({
    mutationFn: async (companyData: any) => {
      return await apiRequest("POST", "/api/companies", companyData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies/search"] });
    },
  });

  const createDocumentMutation = useMutation({
    mutationFn: async (documentData: any) => {
      return await apiRequest("POST", "/api/documents", documentData);
    },
    onSuccess: (newDocument: any) => {
      toast({
        title: "Document imported",
        description: "SEC document has been added to your library.",
      });
      // Invalidate the recent documents query to trigger a refetch
      queryClient.invalidateQueries({ queryKey: ["/api/documents/recent"] });
      onDocumentSelect(newDocument.id);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to import document. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleCompanySelect = async (company: any) => {
    setSelectedCompany(company);
    setShowFilings(true);
    
    // Save company to database if not already there
    try {
      await createCompanyMutation.mutateAsync({
        cik: company.cik,
        name: company.name,
        ticker: company.ticker || null,
      });
    } catch (error) {
      // Company might already exist, which is fine
    }
  };

  const handleDocumentImport = async (filing: any, company: any) => {
    try {
      // First ensure company exists in our database
      let companyData;
      try {
        // Try to get existing company first
        const existingResponse = await fetch(`${import.meta.env.BASE_URL}api/companies/${company.cik}`);
        if (existingResponse.ok) {
          companyData = await existingResponse.json();
        } else {
          // Create new company if doesn't exist
          companyData = await createCompanyMutation.mutateAsync({
            cik: company.cik,
            name: company.name,
            ticker: company.ticker || null,
          });
        }
      } catch (error) {
        throw new Error("Failed to create or fetch company");
      }

      // Check if document already exists
      const existingDocResponse = await fetch(`${import.meta.env.BASE_URL}api/documents/recent?limit=100`);
      if (existingDocResponse.ok) {
        const existingDocs = await existingDocResponse.json();
        const duplicateDoc = existingDocs.find((doc: any) => 
          doc.accessionNumber === filing.accessionNumber
        );
        
        if (duplicateDoc) {
          toast({
            title: "Document already imported",
            description: "This document is already in your library.",
          });
          onDocumentSelect(duplicateDoc.id);
          return;
        }
      }

      // Fetch the document content from SEC
      const documentUrl = `https://www.sec.gov/Archives/edgar/data/${company.cik}/${filing.accessionNumber.replace(/-/g, '')}/${filing.primaryDocument}`;
      
      toast({
        title: "Importing document",
        description: "Fetching SEC document content...",
      });

      const contentResponse = await fetch(`${import.meta.env.BASE_URL}api/sec/document?url=${encodeURIComponent(documentUrl)}`);
      let content = "Content not available - document may be too large or in unsupported format";
      
      if (contentResponse.ok) {
        const contentData = await contentResponse.json();
        content = contentData.content || content;
        
        // Truncate extremely large content to prevent issues
        if (content.length > 1000000) { // 1MB limit
          content = content.substring(0, 1000000) + "\n\n[Content truncated due to size...]";
        }
      }

      // Create document in our database
      const documentData = {
        companyId: companyData.id,
        accessionNumber: filing.accessionNumber,
        formType: filing.form,
        filingDate: filing.filingDate,
        reportDate: filing.reportDate || filing.filingDate,
        documentUrl: documentUrl,
        title: `${company.name} ${filing.form} - ${filing.filingDate}`,
        content: content,
        totalPages: 1,
      };

      await createDocumentMutation.mutateAsync(documentData);
    } catch (error) {
      console.error("Error importing document:", error);
      toast({
        title: "Import failed",
        description: "Could not import the SEC document. Please try again.",
        variant: "destructive",
      });
    }
  };

  const getRecentFilings = () => {
    if (!secFilings?.filings?.recent) return [];
    
    const { recent } = secFilings.filings;
    const filings = [];
    const cutoffDate = new Date();
    cutoffDate.setFullYear(cutoffDate.getFullYear() - 3); // 3 years ago
    
    for (let i = 0; i < recent.form.length; i++) {
      // Only show 10-K and 10-Q forms from last 3 years
      if (recent.form[i] === '10-K' || recent.form[i] === '10-Q') {
        const filingDate = new Date(recent.filingDate[i]);
        if (filingDate >= cutoffDate) {
          filings.push({
            accessionNumber: recent.accessionNumber[i],
            form: recent.form[i],
            filingDate: recent.filingDate[i],
            reportDate: recent.reportDate[i],
            primaryDocument: recent.primaryDocument[i],
            primaryDocDescription: recent.primaryDocDescription[i],
          });
        }
      }
    }
    
    // Sort by filing date, most recent first
    return filings.sort((a, b) => new Date(b.filingDate).getTime() - new Date(a.filingDate).getTime());
  };

  return (
    <div>
      <div className="relative mb-3">
        <Input
          type="text"
          placeholder="Search companies (e.g. Apple, AAPL)..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            // Clear previous company selection when typing
            if (showFilings) {
              setShowFilings(false);
              setSelectedCompany(null);
            }
          }}
          className="pl-10 border-2 border-gray-300 focus:border-blue-500 bg-white shadow-sm rounded-md"
        />
        <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
      </div>

      {/* Search Results */}
      {searchQuery.length >= 2 && !showFilings && (
        <div className="space-y-2 mb-4">
          {isLoading && (
            <div className="text-sm text-muted-foreground">Searching SEC database...</div>
          )}
          {companies.map((company: any, index: number) => (
            <div
              key={`${company.cik}-${index}`}
              className="p-3 bg-muted rounded-lg hover:bg-muted/80 cursor-pointer transition-colors"
              onClick={() => handleCompanySelect(company)}
            >
              <div className="font-medium text-sm">{company.name}</div>
              <div className="text-xs text-muted-foreground">
                {company.ticker && `${company.ticker} • `}CIK: {company.cik}
              </div>
            </div>
          ))}
          {!isLoading && companies.length === 0 && searchQuery.length >= 2 && (
            <div className="text-sm text-muted-foreground">No companies found in SEC database</div>
          )}
        </div>
      )}

      {/* Company SEC Filings */}
      {selectedCompany && showFilings && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-sm text-foreground">
              {selectedCompany.name} SEC Filings
            </h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowFilings(false);
                setSelectedCompany(null);
              }}
              className="text-xs h-6 px-2"
            >
              Back
            </Button>
          </div>
          
          {isLoadingFilings && (
            <div className="text-sm text-muted-foreground">Loading SEC filings...</div>
          )}
          
          {!isLoadingFilings && secFilings && (
            <div className="space-y-0">
              {getRecentFilings().map((filing: any, index: number) => (
                <div
                  key={`${filing.accessionNumber}-${index}`}
                  className="p-2 border-b border-gray-200 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-1">
                    <div className="flex-1">
                      <div className="font-medium text-sm flex items-center">
                        <FileText className="w-3 h-3 mr-1" />
                        {filing.form}
                      </div>
                      <div className="text-xs text-gray-500 flex items-center">
                        <Calendar className="w-3 h-3 mr-1" />
                        Filed: {filing.filingDate}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleDocumentImport(filing, selectedCompany)}
                      disabled={createDocumentMutation.isPending}
                      className="text-xs h-7 px-3 bg-blue-600 hover:bg-blue-700 text-white border-0 rounded-md font-medium"
                    >
                      {createDocumentMutation.isPending ? "Importing..." : "Import"}
                    </Button>
                  </div>
                  {filing.primaryDocDescription && (
                    <div className="text-xs text-gray-500 mt-1">
                      {filing.primaryDocDescription}
                    </div>
                  )}
                </div>
              ))}
              
              {getRecentFilings().length === 0 && (
                <div className="text-sm text-muted-foreground">
                  No recent 10-K or 10-Q filings found
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
