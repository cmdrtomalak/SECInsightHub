import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Menu,
  Highlighter,
  StickyNote,
  Bookmark,
  Search,
  Download,
  Printer,
} from "lucide-react";

interface TopToolbarProps {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  currentDocumentId: number | null;
  onOpenAnnotationModal: () => void;
}

export default function TopToolbar({
  sidebarCollapsed,
  onToggleSidebar,
  currentDocumentId,
  onOpenAnnotationModal,
}: TopToolbarProps) {
  const { data: document } = useQuery({
    queryKey: ["/api/documents", currentDocumentId],
    queryFn: async () => {
      if (!currentDocumentId) return null;
      const response = await fetch(`/api/documents/${currentDocumentId}`);
      if (!response.ok) throw new Error("Failed to fetch document");
      return response.json();
    },
    enabled: !!currentDocumentId,
  });

  const handleExport = () => {
    // TODO: Implement export functionality
    console.log("Export annotations");
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="bg-surface border-b border-border px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleSidebar}
            className="text-muted-foreground hover:text-primary"
          >
            <Menu className="h-4 w-4" />
          </Button>
          
          <div>
            {document ? (
              <>
                <h2 className="font-semibold text-lg">{document.title}</h2>
                <p className="text-sm text-muted-foreground">
                  Filed: {document.filingDate} • {document.totalPages || 1} pages
                </p>
              </>
            ) : (
              <>
                <h2 className="font-semibold text-lg">SEC EDGAR Document Analyzer</h2>
                <p className="text-sm text-muted-foreground">
                  Search for companies and view their SEC filings
                </p>
              </>
            )}
          </div>
        </div>

        {/* Annotation Tools */}
        {currentDocumentId && (
          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-1 bg-muted rounded-lg p-1">
              <Button
                variant="ghost"
                size="sm"
                className="hover:bg-orange-500 hover:text-white transition-colors"
                title="Highlight"
                onClick={onOpenAnnotationModal}
              >
                <Highlighter className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="hover:bg-pink-500 hover:text-white transition-colors"
                title="Add Note"
                onClick={onOpenAnnotationModal}
              >
                <StickyNote className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="hover:bg-green-500 hover:text-white transition-colors"
                title="Bookmark"
                onClick={onOpenAnnotationModal}
              >
                <Bookmark className="h-4 w-4" />
              </Button>
            </div>

            <div className="border-l border-border pl-2 ml-2 flex items-center space-x-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-primary hover:bg-muted"
                title="Search in Document"
              >
                <Search className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-primary hover:bg-muted"
                title="Export Annotations"
                onClick={handleExport}
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-primary hover:bg-muted"
                title="Print"
                onClick={handlePrint}
              >
                <Printer className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
