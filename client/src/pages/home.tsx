import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"; // Added useQueryClient
import type { Annotation } from "@shared/schema"; // Added Annotation type
import CompanySearch from "@/components/company-search";
import RecentDocuments from "@/components/recent-documents";
import AnnotationSearch from "@/components/annotation-search";
import DocumentViewer from "@/components/document-viewer";
import AnnotationPanel from "@/components/annotation-panel";
import AnnotationModal from "@/components/annotation-modal";
import TopToolbar from "@/components/top-toolbar";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function Home() {
  const params = useParams();
  const { toast } = useToast();
  const queryClient = useQueryClient(); // Added queryClient
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [currentDocumentId, setCurrentDocumentId] = useState<number | null>(
    params.id ? parseInt(params.id) : null
  );
  const [annotationModalOpen, setAnnotationModalOpen] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [selectionRange, setSelectionRange] = useState<{
    startOffset: number;
    endOffset: number;
  } | null>(null);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [editingAnnotation, setEditingAnnotation] = useState<Annotation | null>(null); // Added editingAnnotation state

  // Check if we have any documents and load Apple 10-K by default
  const { data: recentDocuments = [] } = useQuery({
    queryKey: ["/api/documents/recent"],
    queryFn: async () => {
      const response = await fetch("/api/documents/recent?limit=1");
      if (!response.ok) throw new Error("Failed to fetch recent documents");
      return response.json();
    },
  });

  const createAppleDocumentMutation = useMutation({
    mutationFn: async () => {
      // First create Apple company
      let appleCompany;
      try {
        appleCompany = await apiRequest("POST", "/api/companies", {
          cik: "0000320193",
          name: "Apple Inc.",
          ticker: "AAPL",
        });
      } catch (error) {
        // Company might already exist, fetch it
        const response = await fetch(`/api/companies/0000320193`);
        if (response.ok) {
          appleCompany = await response.json();
        } else {
          throw new Error("Failed to create or fetch Apple");
        }
      }

      // Fetch Apple's latest 10-K filing
      const filingsResponse = await fetch(`/api/sec/company/0000320193/filings`);
      if (!filingsResponse.ok) throw new Error("Failed to fetch Apple filings");
      const filingsData = await filingsResponse.json();

      // Find the most recent 10-K
      const { recent } = filingsData.filings;
      let latest10K = null;
      
      for (let i = 0; i < recent.form.length; i++) {
        if (recent.form[i] === '10-K') {
          latest10K = {
            accessionNumber: recent.accessionNumber[i],
            form: recent.form[i],
            filingDate: recent.filingDate[i],
            reportDate: recent.reportDate[i],
            primaryDocument: recent.primaryDocument[i],
          };
          break;
        }
      }

      if (!latest10K) throw new Error("No 10-K found for Apple");

      // Fetch document content
      const documentUrl = `https://www.sec.gov/Archives/edgar/data/0000320193/${latest10K.accessionNumber.replace(/-/g, '')}/${latest10K.primaryDocument}`;
      const contentResponse = await fetch(`/api/sec/document?url=${encodeURIComponent(documentUrl)}`);
      let contentHtml = "<p>(Content retrieval failed or was empty)</p>"; // Default HTML placeholder
      
      if (contentResponse.ok) {
        try {
          const contentData = await contentResponse.json();
          // Ensure contentData.content is a non-empty string, otherwise use the placeholder
          if (contentData && typeof contentData.content === 'string' && contentData.content.trim() !== '') {
            contentHtml = contentData.content;
          }
        } catch (e) {
          // Error parsing JSON, or other issue, stick with default placeholder
          console.error("Error processing contentResponse JSON:", e);
        }
      }

      // Create document
      const documentData = {
        companyId: appleCompany.id,
        accessionNumber: latest10K.accessionNumber,
        formType: latest10K.form,
        filingDate: latest10K.filingDate,
        reportDate: latest10K.reportDate || latest10K.filingDate,
        documentUrl: documentUrl,
        title: `Apple Inc. ${latest10K.form} - ${latest10K.filingDate}`,
        content: contentHtml, // Use the new variable
        totalPages: null, // Changed to null
      };

      return await apiRequest("POST", "/api/documents", documentData);
    },
    onSuccess: (newDocument: any) => {
      setCurrentDocumentId(newDocument.id);
      window.history.pushState({}, "", `/document/${newDocument.id}`);
      toast({
        title: "Demo document loaded",
        description: "Apple's latest 10-K has been loaded for demonstration.",
      });
    },
    onError: (error) => {
      console.error("Failed to load demo document:", error);
    },
  });

  useEffect(() => {
    if (params.id) {
      setCurrentDocumentId(parseInt(params.id));
    }
  }, [params.id]);

  // Auto-load Apple 10-K if no documents exist and not already initialized
  useEffect(() => {
    if (false && !hasInitialized && recentDocuments.length === 0 && !currentDocumentId && !params.id) { // Added 'false &&'
      setHasInitialized(true);
      createAppleDocumentMutation.mutate();
    }
  }, [recentDocuments, hasInitialized, currentDocumentId, params.id]);

  // --- Annotation Modal Logic ---
  const handleOpenAnnotationModal = (annotation?: Annotation) => {
    if (annotation) {
      setEditingAnnotation(annotation);
      setSelectedText(annotation.selectedText);
    } else {
      setEditingAnnotation(null);
      // For new annotations via text selection, selectedText is already set.
      // If opening for a "blank" new annotation (e.g. from a toolbar button without prior selection),
      // ensure selectedText and selectionRange are appropriately cleared or handled.
      // setSelectedText(""); // This might be needed if TopToolbar can open for a truly new one without text selection
      // setSelectionRange(null);
    }
    setAnnotationModalOpen(true);
  };

  const saveAnnotationMutation = useMutation({
    mutationFn: async ({ data, idToUpdate }: { data: Partial<Annotation>, idToUpdate?: number }) => {
      if (idToUpdate) {
        return apiRequest("PATCH", `/api/annotations/${idToUpdate}`, data);
      } else {
        // Ensure all required fields for new annotation are present in data
        if (!data.documentId || !data.selectedText || data.startOffset === undefined || data.endOffset === undefined) {
          throw new Error("Missing required fields for new annotation.");
        }
        return apiRequest("POST", "/api/annotations", data);
      }
    },
    onSuccess: (_result: any, { idToUpdate }: { data: Partial<Annotation>, idToUpdate?: number }) => {
      toast({
        title: idToUpdate ? "Annotation Updated" : "Annotation Saved",
        description: idToUpdate ? "Your changes have been saved." : "The annotation has been added to the document.",
      });
      if (currentDocumentId) {
        queryClient.invalidateQueries({ queryKey: ["/api/documents", currentDocumentId, "annotations"] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/annotations/search"] }); // For annotation search component
    },
    onError: (error: Error, { idToUpdate }: { data: Partial<Annotation>, idToUpdate?: number }) => {
      toast({
        title: "Error",
        description: `Failed to ${idToUpdate ? 'update' : 'save'} annotation. ${error.message || ''}`,
        variant: "destructive",
      });
    },
  });

  const handleSaveAnnotation = (data: Partial<Annotation>, idToUpdate?: number) => {
    // If creating new, ensure documentId, selectedText, and offsets are included from the current state
    // as the modal might only send back note, type, color.
    if (!idToUpdate) {
      data = {
        ...data,
        documentId: currentDocumentId,
        selectedText: selectedText, // This is from onTextSelection
        startOffset: selectionRange?.startOffset,
        endOffset: selectionRange?.endOffset,
        pageNumber: 1, // Still TODO: pageNumber determination
      };
    }
    saveAnnotationMutation.mutate({ data, idToUpdate });
  };

  const handleTextSelection = (text: string, startOffset: number, endOffset: number) => {
    setSelectedText(text);
    setSelectionRange({ startOffset, endOffset });
    setEditingAnnotation(null);
    handleOpenAnnotationModal();
  };

  const handleDocumentSelect = (documentId: number) => {
    setCurrentDocumentId(documentId);
    window.history.pushState({}, "", `/document/${documentId}`);
  };

  const handleAnnotationSelect = (documentId: number, startOffset?: number) => {
    setCurrentDocumentId(documentId);
    window.history.pushState({}, "", `/document/${documentId}`);
    
    // If we have a startOffset, jump to that annotation after a short delay
    if (startOffset !== undefined) {
      setTimeout(() => {
        handleJumpToAnnotation(startOffset);
      }, 100);
    }
  };

  const handleJumpToAnnotation = (startOffset: number) => {
    // Send message to document viewer to scroll to annotation
    const event = new CustomEvent('jumpToAnnotation', { detail: { startOffset } });
    window.dispatchEvent(event);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <div
        className={`${
          sidebarCollapsed ? "w-16" : "w-80"
        } bg-surface border-r border-border flex flex-col transition-all duration-300 ease-in-out`}
      >
        {!sidebarCollapsed && (
          <>
            {/* Header */}
            <div className="p-6 border-b border-border">
              <h1 className="text-xl font-semibold text-primary flex items-center">
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" />
                </svg>
                SEC EDGAR Analyzer
              </h1>
            </div>

            {/* Company Search */}
            <div className="p-4 border-b border-border">
              <CompanySearch onDocumentSelect={handleDocumentSelect} />
            </div>

            {/* Recent Documents */}
            <div className="p-4 border-b border-border">
              <RecentDocuments onDocumentSelect={handleDocumentSelect} />
            </div>

            {/* Annotation Search */}
            <div className="p-4 flex-1 overflow-hidden flex flex-col">
              <AnnotationSearch onAnnotationSelect={handleAnnotationSelect} />
            </div>
          </>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Toolbar */}
        <TopToolbar
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
          currentDocumentId={currentDocumentId}
          onOpenAnnotationModal={() => handleOpenAnnotationModal()} // For new, context-less annotation from toolbar
        />

        {/* Document Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Document Viewer */}
          <DocumentViewer
            documentId={currentDocumentId}
            onTextSelection={handleTextSelection}
          />

          {/* Annotation Panel */}
          {currentDocumentId && (
            <AnnotationPanel
              documentId={currentDocumentId}
              onOpenAnnotationModal={handleOpenAnnotationModal} // Updated prop
              onJumpToAnnotation={handleJumpToAnnotation}
            />
          )}
        </div>
      </div>

      {/* Annotation Modal */}
      <AnnotationModal
        open={annotationModalOpen}
        onOpenChange={setAnnotationModalOpen}
        selectedText={selectedText} // Still needed for new annotations from text selection
        documentId={currentDocumentId}
        selectionRange={selectionRange}
        annotationToEdit={editingAnnotation} // Pass the editing annotation
        onSave={handleSaveAnnotation} // Pass the save handler
      />
    </div>
  );
}
