import { useQuery } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Highlighter } from "lucide-react";
import { setupTextSelection } from "@/lib/text-selection";

interface DocumentViewerProps {
  documentId: number | null;
  onTextSelection: (text: string, startOffset: number, endOffset: number) => void;
}

export default function DocumentViewer({ documentId, onTextSelection }: DocumentViewerProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    selectedText: string;
    startOffset: number;
    endOffset: number;
  } | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const { data: document, isLoading } = useQuery({
    queryKey: ["/api/documents", documentId],
    queryFn: async () => {
      if (!documentId) return null;
      const response = await fetch(`/api/documents/${documentId}`);
      if (!response.ok) throw new Error("Failed to fetch document");
      return response.json();
    },
    enabled: !!documentId,
  });

  const { data: annotations = [] } = useQuery({
    queryKey: ["/api/documents", documentId, "annotations"],
    queryFn: async () => {
      if (!documentId) return [];
      const response = await fetch(`/api/documents/${documentId}/annotations`);
      if (!response.ok) throw new Error("Failed to fetch annotations");
      return response.json();
    },
    enabled: !!documentId,
  });

  useEffect(() => {
    if (contentRef.current) {
      const cleanup = setupTextSelection(contentRef.current, (text: string, startOffset: number, endOffset: number, event: MouseEvent) => {
        // Show context menu instead of immediately calling onTextSelection
        setContextMenu({
          x: event.clientX,
          y: event.clientY,
          selectedText: text,
          startOffset,
          endOffset
        });
      });
      return cleanup;
    }
  }, [document]);

  // Close context menu when clicking elsewhere
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenu) {
        setContextMenu(null);
      }
    };

    if (contextMenu && typeof window !== 'undefined' && typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('click', handleClickOutside);
      return () => {
        if (contextMenu && typeof window !== 'undefined' && typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
          document.removeEventListener('click', handleClickOutside);
        }
      };
    }
  }, [contextMenu]);

  useEffect(() => {
    const handleJumpToAnnotation = (event: CustomEvent) => {
      const { startOffset } = event.detail;
      if (contentRef.current) {
        // Find the annotation span element by data attribute
        const annotationElement = contentRef.current.querySelector(`[data-annotation-start="${startOffset}"]`);
        
        if (annotationElement) {
          // Get the scrollable container
          const scrollContainer = contentRef.current.closest('.overflow-y-auto');
          if (scrollContainer) {
            const containerRect = scrollContainer.getBoundingClientRect();
            const elementRect = annotationElement.getBoundingClientRect();
            const scrollTop = elementRect.top - containerRect.top + scrollContainer.scrollTop - 20;
            
            scrollContainer.scrollTo({
              top: scrollTop,
              behavior: 'smooth'
            });
          } else {
            // Fallback to scrollIntoView
            annotationElement.scrollIntoView({ 
              behavior: 'smooth', 
              block: 'start'
            });
          }
        } else {
          // Fallback: scroll to rough position based on offset percentage
          const textContent = contentRef.current.textContent || "";
          const percentage = startOffset / textContent.length;
          const scrollTop = contentRef.current.scrollHeight * percentage;
          
          const scrollContainer = contentRef.current.closest('.overflow-y-auto') || contentRef.current.parentElement;
          if (scrollContainer) {
            scrollContainer.scrollTo({
              top: Math.max(0, scrollTop - 150),
              behavior: 'smooth'
            });
          }
        }
      }
    };

    window.addEventListener('jumpToAnnotation', handleJumpToAnnotation as EventListener);
    return () => {
      window.removeEventListener('jumpToAnnotation', handleJumpToAnnotation as EventListener);
    };
  }, []);

  if (!documentId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface">
        <div className="text-center">
          <h2 className="text-lg font-medium text-muted-foreground mb-2">
            No Document Selected
          </h2>
          <p className="text-sm text-muted-foreground">
            Search for a company to view their SEC filings
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-sm text-muted-foreground">Loading document...</p>
        </div>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface">
        <div className="text-center">
          <h2 className="text-lg font-medium text-destructive mb-2">
            Document Not Found
          </h2>
          <p className="text-sm text-muted-foreground">
            The requested document could not be loaded
          </p>
        </div>
      </div>
    );
  }

  const getHighlightBackgroundColorClass = (color: string): string => {
    switch (color) {
      case 'orange':
        return 'highlight-bg-orange';
      case 'green':
        return 'highlight-bg-green';
      case 'pink':
        return 'highlight-bg-pink';
      case 'blue':
        return 'highlight-bg-blue';
      default:
        return 'highlight-bg-default'; // Default to orange-like highlight
    }
  };

  const highlightText = (content: string) => {
    if (
      typeof document === 'undefined' ||
      typeof document.createElement === 'undefined' ||
      typeof document.createTreeWalker === 'undefined' ||
      typeof document.createRange === 'undefined'
    ) {
      return content; // Return original content if not in a browser environment or document is missing methods
    }

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;

    // Sort annotations by start offset in descending order
    const sortedAnnotations = [...annotations].sort((a, b) => b.startOffset - a.startOffset);

    for (const annotation of sortedAnnotations) {
      const walker = document.createTreeWalker(
        tempDiv,
        NodeFilter.SHOW_TEXT,
        null
      );

      let currentOffset = 0;
      let startNode: Text | null = null;
      let endNode: Text | null = null;
      let startNodeOffset = 0;
      let endNodeOffset = 0;

      let currentNode;
      while (currentNode = walker.nextNode()) {
        const nodeText = currentNode.textContent || "";
        const nodeLength = nodeText.length;

        if (startNode === null && currentOffset + nodeLength > annotation.startOffset) {
          startNode = currentNode as Text;
          startNodeOffset = annotation.startOffset - currentOffset;
        }

        if (endNode === null && currentOffset + nodeLength >= annotation.endOffset) {
          endNode = currentNode as Text;
          endNodeOffset = annotation.endOffset - currentOffset;
          break;
        }
        currentOffset += nodeLength;
      }

      if (startNode && endNode) {
        const range = document.createRange();
        try {
          range.setStart(startNode, startNodeOffset);
          range.setEnd(endNode, endNodeOffset);

          const spanElement = document.createElement('span');
          spanElement.className = "annotation-highlight";
          if (annotation.type === 'highlight') {
            const bgColorClass = getHighlightBackgroundColorClass(annotation.color);
            spanElement.classList.add(bgColorClass);
          }
          spanElement.setAttribute('data-annotation-id', annotation.id.toString());
          spanElement.setAttribute('data-annotation-start', annotation.startOffset.toString());
          if (annotation.note) {
            spanElement.setAttribute('title', annotation.note);
          }

          // Ensure spanElement does not contain the marker text before surroundContents.
          range.surroundContents(spanElement); // Moves the original document content into the span.

          // Add marker text AFTER the span if it's a 'note' type annotation
          // and the spanElement has been successfully added to the DOM (i.e., spanElement.parentNode exists).
          const annotationMarkerText = annotation.type === 'note' ? ' 📝' : '';
          if (annotationMarkerText && spanElement.parentNode) {
            const markerNode = document.createTextNode(annotationMarkerText);
            // Insert the marker text node immediately after the spanElement.
            // If spanElement.nextSibling is null, it will be appended at the end of parentNode's children, which is fine.
            spanElement.parentNode.insertBefore(markerNode, spanElement.nextSibling);
          }

        } catch (e) {
          console.error("Error surrounding contents for annotation:", annotation.id, e);
          // Fallback or error handling if needed
        }
      } else {
        console.warn("Could not find nodes for annotation:", annotation.id, "Start:", annotation.startOffset, "End:", annotation.endOffset);
      }
    }
    return tempDiv.innerHTML;
  };

  return (
    <div className="flex-1 overflow-y-auto bg-surface">
      <div className="max-w-4xl mx-auto px-8 py-6">
        {/* Document Header */}
        <div className="mb-6 p-4 bg-muted rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h2 className="text-lg font-semibold text-foreground">
                {document.title}
              </h2>
              <span className="text-sm text-muted-foreground">
                Filed: {document.filingDate}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setZoom(Math.min(200, zoom + 10))}
              >
                <ZoomIn className="h-4 w-4 mr-1" />
                Zoom In
              </Button>
              <span className="text-sm text-muted-foreground">{zoom}%</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setZoom(Math.max(50, zoom - 10))}
              >
                <ZoomOut className="h-4 w-4 mr-1" />
                Zoom Out
              </Button>
            </div>
          </div>
        </div>

        {/* Document Content */}
        <div
          ref={contentRef}
          className="bg-white border border-border rounded-lg shadow-sm p-8 leading-relaxed text-sm min-h-96 relative"
          style={{ fontSize: `${zoom}%` }}
        >
          {document.content ? (
            <div 
              dangerouslySetInnerHTML={{
                __html: highlightText(document.content)
              }}
              className="whitespace-pre-wrap"
            />
          ) : (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                <p className="text-sm text-muted-foreground">Loading document content...</p>
              </div>
            </div>
          )}
        </div>

        {/* Context Menu */}
        {contextMenu && (
          <div
            className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-2 min-w-48"
            style={{
              left: `${contextMenu.x}px`,
              top: `${contextMenu.y}px`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center space-x-2"
              onClick={() => {
                onTextSelection(contextMenu.selectedText, contextMenu.startOffset, contextMenu.endOffset);
                setContextMenu(null);
              }}
            >
              <Highlighter className="h-4 w-4" />
              <span>Annotate</span>
            </button>
            <button
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center space-x-2"
              onClick={() => setContextMenu(null)}
            >
              <span>Cancel</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
