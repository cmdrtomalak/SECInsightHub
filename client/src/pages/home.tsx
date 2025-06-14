import { useState, useEffect } from "react";
import { useParams, useLocation, Link } from "wouter"; // Added useLocation and Link
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Annotation } from "@shared/schema";
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
  const [, navigate] = useLocation(); // Added navigate from wouter
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const initialDocIdFromParams = params.id ? Number(params.id) : null;
  console.log("[Home Page] Initial document ID from URL params:", params.id, "Type:", typeof params.id, "Parsed:", initialDocIdFromParams);
  const [currentDocumentId, setCurrentDocumentId] = useState<number | null>(
    initialDocIdFromParams !== null && !isNaN(initialDocIdFromParams) ? initialDocIdFromParams : null
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

      // Construct the direct SEC document URL
      const documentUrl = `https://www.sec.gov/Archives/edgar/data/${appleCompany.cik.replace(/^0+/, '')}/${latest10K.accessionNumber.replace(/-/g, '')}/${latest10K.primaryDocument}`;
      console.log("[Home Page] createAppleDocumentMutation: Constructed SEC document URL:", documentUrl);
      
      // Prepare metadata payload for the server. Content will be fetched by the server.
      const documentMetadataPayload = {
        companyId: appleCompany.id,
        accessionNumber: latest10K.accessionNumber,
        formType: latest10K.form,
        filingDate: latest10K.filingDate,
        reportDate: latest10K.reportDate || latest10K.filingDate, // Ensure reportDate has a fallback
        documentUrl: documentUrl, // Server will use this to fetch content
        title: `Apple Inc. ${latest10K.form} - ${latest10K.filingDate}`,
        // No 'content' or 'totalPages' field sent from client
      };

      console.log("[Home Page] createAppleDocumentMutation: Sending metadata payload to POST /api/documents:", documentMetadataPayload);
      return await apiRequest("POST", "/api/documents", documentMetadataPayload);
    },
    onSuccess: (newDocument: any) => {
      console.log("[Home Page] createAppleDocumentMutation.onSuccess: newDocument.id:", newDocument.id, "Type:", typeof newDocument.id);
      let numericId = null;
      if (newDocument && typeof newDocument.id === 'number' && !isNaN(newDocument.id)) {
        numericId = newDocument.id;
      } else if (newDocument && newDocument.id !== undefined && newDocument.id !== null) {
        const parsedId = Number(newDocument.id);
        if (!isNaN(parsedId)) {
          numericId = parsedId;
        } else {
          console.warn("[Home Page] createAppleDocumentMutation.onSuccess: Failed to parse newDocument.id:", newDocument.id);
        }
      } else {
          console.warn("[Home Page] createAppleDocumentMutation.onSuccess: newDocument.id is missing or invalid:", newDocument);
      }
      setCurrentDocumentId(numericId);

      if (numericId !== null) {
        navigate(`/document/${numericId}`);
        toast({
          title: "Demo Document Loaded",
          description: newDocument?.title ? `${newDocument.title} has been loaded.` : "The document has been loaded.",
        });
        queryClient.invalidateQueries({ queryKey: ['/api/documents/recent'] });
        // Optionally, invalidate company-specific documents if appleCompany.id is available and known here
        // For example, if appleCompany was accessible: queryClient.invalidateQueries({ queryKey: ['/api/companies', appleCompany.id, 'documents'] });
      } else {
        // Actions if numericId is null (e.g., newDocument.id was invalid):
        console.warn("[Home Page] createAppleDocumentMutation.onSuccess: newDocument.id was invalid, not navigating to document page.");
        navigate("/"); // Navigate to a neutral state
        toast({
          title: "Error Importing Document",
          description: "Could not obtain a valid ID for the imported document.",
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      console.error("Failed to load demo document:", error);
      toast({ // Add a toast message for the onError case as well
        title: "Error Loading Demo Document",
        description: error.message || "An unexpected error occurred.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    console.log("[Home Page] useEffect for params.id: Current params.id:", params.id, "Type:", typeof params.id);
    let numericId = null;
    if (params.id) {
      const parsedId = Number(params.id);
      if (!isNaN(parsedId)) {
        numericId = parsedId;
      } else {
        console.warn("[Home Page] useEffect params.id: Failed to parse ID from URL params:", params.id, "Setting documentId to null.");
      }
    } else if (params.id === null || params.id === undefined) {
        console.log("[Home Page] useEffect for params.id: params.id is null or undefined, setting currentDocumentId to null.");
    }
    // Only update if the new numericId is different from currentDocumentId to avoid potential loops if params.id is derived from currentDocumentId
    // However, wouter's params should be independent.
    setCurrentDocumentId(numericId);
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

  const handleDocumentSelect = (id: number | string) => {
    console.log("[Home Page] handleDocumentSelect: Received id:", id, "Type:", typeof id);
    let numericId = null;
    if (id !== undefined && id !== null) {
      const parsedId = Number(id);
      if (!isNaN(parsedId)) {
        numericId = parsedId;
      } else {
        console.warn("[Home Page] handleDocumentSelect: Failed to parse id:", id);
      }
    }
    setCurrentDocumentId(numericId);
    if (numericId !== null) {
      navigate(`/document/${numericId}`);
    } else {
      // Optionally navigate to a neutral page or show an error if selection should always yield a valid ID
      // navigate("/");
    }
  };

  const handleAnnotationSelect = (docId: number | string, startOffset?: number) => {
    console.log("[Home Page] handleAnnotationSelect: Received document id:", docId, "Type:", typeof docId);
    let numericDocId = null;
    if (docId !== undefined && docId !== null) {
      const parsedId = Number(docId);
      if (!isNaN(parsedId)) {
        numericDocId = parsedId;
      } else {
        console.warn("[Home Page] handleAnnotationSelect: Failed to parse item.documentId:", docId);
      }
    }
    setCurrentDocumentId(numericDocId);

    if (numericDocId !== null) {
      navigate(`/document/${numericDocId}`);
      // If we have a startOffset, jump to that annotation after a short delay
      if (startOffset !== undefined) {
        setTimeout(() => {
          handleJumpToAnnotationEventDispatch(startOffset); // Changed this line
        }, 100);
      }
    } else {
      // Optionally navigate to a neutral page or show an error
      // navigate("/");
    }
  };

  // Renamed this function to avoid confusion with DocumentViewer's internal handler
  const handleJumpToAnnotationEventDispatch = (startOffset: number) => {
    console.log(`[Home Page] Relaying jumpToAnnotation custom event for global offset: ${startOffset}`);
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

            {/* All Documents Link */}
            <div className="p-4 border-b border-border">
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">Browse</h3>
              <Link href="/all-documents">
                <Button variant="link" className="p-0 h-auto text-primary hover:underline">
                  All Documents
                </Button>
              </Link>
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
          // onOpenAnnotationModal prop removed
        />

        {/* Document Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Document Viewer */}
        { (() => {
            console.log("[Home Page] Rendering DocumentViewer with documentId:", currentDocumentId, "Type:", typeof currentDocumentId);
            return (
              <DocumentViewer
                documentId={currentDocumentId}
                onTextSelection={handleTextSelection}
              />
            );
          })() }

          {/* Annotation Panel */}
          {currentDocumentId && (
            <AnnotationPanel
              documentId={currentDocumentId}
              onOpenAnnotationModal={handleOpenAnnotationModal} // Updated prop
              onJumpToAnnotation={handleJumpToAnnotationEventDispatch}
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
