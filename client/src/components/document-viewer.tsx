import { useQuery } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
// import { Input } from "@/components/ui/input"; // No longer used directly it seems
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Highlighter, Loader2 } from "lucide-react";
import { setupTextSelection } from "@/lib/text-selection";
import { getSECDocumentPage } from "@/lib/sec-api"; // Added import

const DEFAULT_CHUNK_SIZE = 1 * 1024 * 1024; // 1MB in characters, should match server/storage.ts

interface DocumentViewerProps {
  documentId: number | null;
  onTextSelection: (text: string, startOffset: number, endOffset: number) => void;
}

export default function DocumentViewer({ documentId, onTextSelection }: DocumentViewerProps) {
  // Existing console log for documentId (from previous steps, will be captured by the one inside the component if it proceeds)
  // console.log("DocumentViewer: Rendering. documentId:", documentId); // This was the user's reference

  // NEW: Add guard for invalid documentId
  if (typeof documentId !== 'number' || isNaN(documentId)) {
    // The console.log just below this (inside the component) will capture the invalid ID as well.
    // This specific warning is for when the component decides to bail out.
    console.warn("DocumentViewer: Invalid documentId received:", documentId, ". Rendering 'No Document Selected' state.");
    return (
      <div className="flex-1 flex items-center justify-center bg-surface">
        <div className="text-center">
          <h2 className="text-lg font-medium text-muted-foreground mb-2">
            No Document Selected (Invalid ID)
          </h2>
          <p className="text-sm text-muted-foreground">
            The document ID provided is not valid.
          </p>
        </div>
      </div>
    );
  }

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
  const [currentPageContent, setCurrentPageContent] = useState<string | null>(null);
  const [isPageLoading, setIsPageLoading] = useState<boolean>(false);
  const [pendingScrollOffset, setPendingScrollOffset] = useState<number | null>(null);

  // Fetch document metadata (title, totalPages, etc.)
  const { data: documentMetadata, isLoading: isLoadingMetadata } = useQuery({
    queryKey: ["/api/documents", documentId, "metadata"],
    queryFn: async () => {
      if (!documentId) return null;
      const response = await fetch(`/api/documents/${documentId}`);
      console.log("DocumentViewer: Raw response for document METADATA, documentId:", documentId, response);
      if (!response.ok) throw new Error("Failed to fetch document metadata");
      const metadata = await response.json();
      console.log("DocumentViewer: Parsed document METADATA for documentId:", documentId, metadata);
      // Since content is now chunked, metadata.content might be null or a preview.
      // We rely on totalPages from metadata.
      return metadata;
    },
    enabled: !!documentId,
    staleTime: 5 * 60 * 1000, // Cache metadata for 5 mins
  });

  // Fetch annotations (remains the same)
  const { data: annotations = [] } = useQuery({
    queryKey: ["/api/documents", documentId, "annotations"], // This fetches ALL annotations for the document
    queryFn: async () => {
      if (!documentId) return [];
      const response = await fetch(`/api/documents/${documentId}/annotations`);
      console.log("DocumentViewer: Raw response for annotations, documentId:", documentId, response);
      if (!response.ok) throw new Error("Failed to fetch annotations");
      const annotationsData = await response.json();
      console.log("DocumentViewer: Parsed annotations for documentId:", documentId, annotationsData);
      return annotationsData;
    },
    enabled: !!documentId,
  });

  console.log(
    "DocumentViewer: Rendering. documentId:", documentId,
    "Annotations count:", annotations.length
    // "Document content snippet (first 100):", documentMetadata?.content?.substring(0,100) ?? "N/A" // Not relevant anymore for main content
  );

  // Effect to fetch current page content
  useEffect(() => {
    if (documentId && documentMetadata) { // Ensure metadata (and thus totalPages) is loaded
      setIsPageLoading(true);
      setCurrentPageContent(null); // Clear previous page content
      console.log(`DocumentViewer: Fetching page ${currentPage} for document ${documentId}`);
      getSECDocumentPage(documentId, currentPage)
        .then(chunk => {
          if (chunk) {
            console.log(`DocumentViewer: Received page ${currentPage} content. Length: ${chunk.content.length}`);
            setCurrentPageContent(chunk.content);
            // If there's a pending scroll, execute it now that content is loaded
            if (pendingScrollOffset !== null) {
              const localOffsetForScroll = pendingScrollOffset % DEFAULT_CHUNK_SIZE;
              scrollToOffset(pendingScrollOffset, localOffsetForScroll); // Pass global for element query, local for fallback
              setPendingScrollOffset(null);
            }
          } else {
            console.warn(`DocumentViewer: No content received for page ${currentPage}, document ${documentId}.`);
            setCurrentPageContent(null);
            setPendingScrollOffset(null); // Clear pending scroll if page load failed
          }
        })
        .catch(error => {
          console.error(`DocumentViewer: Error fetching page ${currentPage} for document ${documentId}:`, error);
          setCurrentPageContent(null);
          setPendingScrollOffset(null); // Clear pending scroll if page load failed
        })
        .finally(() => {
          setIsPageLoading(false);
        });
    }
  }, [documentId, currentPage, documentMetadata, pendingScrollOffset]); // Added pendingScrollOffset to dependencies


  // Reset current page to 1 when documentId changes
  useEffect(() => {
    setCurrentPage(1);
    setPendingScrollOffset(null); // Clear any pending scroll from a previous document
  }, [documentId]);


  useEffect(() => {
    if (contentRef.current && currentPageContent) {
      const currentPageGlobalStartOffset = (currentPage - 1) * DEFAULT_CHUNK_SIZE;
      const cleanup = setupTextSelection(contentRef.current, (text: string, startOffset: number, endOffset: number, event: MouseEvent) => {
        const globalStartOffset = currentPageGlobalStartOffset + startOffset;
        const globalEndOffset = currentPageGlobalStartOffset + endOffset;

        setContextMenu({
          x: event.clientX,
          y: event.clientY,
          selectedText: text,
          startOffset: globalStartOffset, // Store global offset
          endOffset: globalEndOffset,     // Store global offset
        });
      });
      return cleanup;
    }
  }, [currentPageContent, currentPage]); // Rerun text selection setup when page content or number changes

  // Helper function for scrolling to an offset
  const scrollToOffset = (globalStartOffset: number, localOffsetToScroll: number) => {
    if (contentRef.current) {
      const annotationElement = contentRef.current.querySelector(`[data-annotation-start="${globalStartOffset}"]`);
      if (annotationElement) {
        const scrollContainer = contentRef.current.closest('.overflow-y-auto');
        if (scrollContainer) {
          const containerRect = scrollContainer.getBoundingClientRect();
          const elementRect = annotationElement.getBoundingClientRect();
          const scrollTop = elementRect.top - containerRect.top + scrollContainer.scrollTop - 20;
          scrollContainer.scrollTo({ top: scrollTop, behavior: 'smooth' });
        } else {
          annotationElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      } else if (currentPageContent) { // Fallback scrolling if element not found (e.g. annotation spans multiple pages)
        const percentage = localOffsetToScroll / currentPageContent.length;
        const scrollTop = contentRef.current.scrollHeight * percentage;
        const scrollContainer = contentRef.current.closest('.overflow-y-auto') || contentRef.current.parentElement;
        if (scrollContainer) {
          scrollContainer.scrollTo({ top: Math.max(0, scrollTop - 150), behavior: 'smooth' });
        }
      }
    }
  };

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
      const { startOffset: globalStartOffset } = event.detail; // This is a global offset
      if (!documentMetadata || !currentPageContent === undefined) return; // Not ready

      const targetPage = Math.floor(globalStartOffset / DEFAULT_CHUNK_SIZE) + 1;

      console.log(`DocumentViewer: handleJumpToAnnotation. GlobalOffset: ${globalStartOffset}, TargetPage: ${targetPage}, CurrentPage: ${currentPage}`);

      if (targetPage !== currentPage) {
        setPendingScrollOffset(globalStartOffset); // Store the global offset
        setCurrentPage(targetPage);
        // Scrolling will be handled by the useEffect that fetches page content
      } else {
        // Already on the correct page, scroll directly
        const localOffsetForScroll = globalStartOffset % DEFAULT_CHUNK_SIZE;
        scrollToOffset(globalStartOffset, localOffsetForScroll);
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

  if (isLoadingMetadata) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading document metadata...</p>
        </div>
      </div>
    );
  }

  if (!documentMetadata) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface">
        <div className="text-center">
          <h2 className="text-lg font-medium text-destructive mb-2">
            Document Not Found
          </h2>
          <p className="text-sm text-muted-foreground">
            The requested document could not be loaded.
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
    // Highlighting logic adjusted for pagination
    console.log("DocumentViewer: highlightText called. Current Page Content (first 500 chars):", content?.substring(0, 500));
    if (!content) return "";

    if (
      typeof window.document === 'undefined' ||
      typeof window.document.createElement !== 'function' ||
      typeof window.document.createTreeWalker !== 'function' ||
      typeof window.document.createRange !== 'function'
    ) {
      console.log("highlightText: SSR guard TRIGGERED. Exiting early. typeof window.document:", typeof window.document);
      return content;
    } else {
      console.log("highlightText: SSR guard PASSED. Proceeding with client-side logic. typeof window.document:", typeof window.document);
    }
    // console.log("highlightText: Called. Initial content snippet (first 500):", content.substring(0, 500)); // Removed

    const tempDiv = window.document.createElement('div');
    tempDiv.innerHTML = content; // content is currentPageContent

    const currentPageGlobalStartOffset = (currentPage - 1) * DEFAULT_CHUNK_SIZE;

    // Filter annotations for the current page and adjust their offsets
    const annotationsToDisplay = annotations
      .map(ann => ({
        ...ann,
        // Calculate local offsets relative to the current page's content
        localStart: ann.startOffset - currentPageGlobalStartOffset,
        localEnd: ann.endOffset - currentPageGlobalStartOffset,
      }))
      .filter(ann => {
        // Check if the annotation (original global offsets) overlaps with the current page's global range
        const pageGlobalEndOffset = currentPageGlobalStartOffset + content.length;
        const annotationOverlapsPage = ann.startOffset < pageGlobalEndOffset && ann.endOffset > currentPageGlobalStartOffset;
        return annotationOverlapsPage;
      })
      // Sort by original global start offset to maintain highlighting order (e.g., for nested or overlapping annotations)
      .sort((a, b) => b.startOffset - a.startOffset); // Descending for processing from end of page content

    console.log(`DocumentViewer: Highlighting. Page: ${currentPage}. Filtered ${annotationsToDisplay.length} annotations from ${annotations.length} total.`);

    for (const annotation of annotationsToDisplay) {
      // Clamp localStart and localEnd to be within the bounds of the current page content
      const clampedLocalStart = Math.max(0, annotation.localStart);
      const clampedLocalEnd = Math.min(content.length, annotation.localEnd);

      // If, after clamping, the annotation has no length or is entirely outside the current page's content, skip.
      if (clampedLocalStart >= clampedLocalEnd) {
          console.log(`DocumentViewer: Skipping annotation ID ${annotation.id} as it has no visible part on page ${currentPage}. Original global: ${annotation.startOffset}-${annotation.endOffset}, Local: ${annotation.localStart}-${annotation.localEnd}, Clamped: ${clampedLocalStart}-${clampedLocalEnd}`);
          continue;
      }

      console.log(
        "DocumentViewer: highlightText loop - PROCESSED annotation for current page:",
        `ID: ${annotation.id}, Type: ${annotation.type}, GlobalStart: ${annotation.startOffset}, GlobalEnd: ${annotation.endOffset}, LocalStart: ${clampedLocalStart}, LocalEnd: ${clampedLocalEnd}`
      );

      if (isNaN(clampedLocalStart) || isNaN(clampedLocalEnd)) {
        console.warn(
          "DocumentViewer: highlightText loop - NaN DETECTED IN CLAMPED LOCAL OFFSETS. Annotation ID:", annotation.id,
          "LocalStart:", clampedLocalStart, "LocalEnd:", clampedLocalEnd
        );
        continue; // Skip this annotation
      }

      if (annotation.type === 'highlight') {
        const bgColorClass = getHighlightBackgroundColorClass(annotation.color);
        const walker = window.document.createTreeWalker(tempDiv, NodeFilter.SHOW_TEXT, null);
        let currentWalkerOffset = 0;
        let startNode: Text | null = null;
        let endNode: Text | null = null;
        let startNodeOffsetInText = 0;
        let endNodeOffsetInText = 0;

        let currentNode;
        while (currentNode = walker.nextNode()) {
          const nodeText = currentNode.textContent || "";
          const nodeLength = nodeText.length;

          if (startNode === null && currentWalkerOffset + nodeLength > clampedLocalStart) {
            startNode = currentNode as Text;
            startNodeOffsetInText = clampedLocalStart - currentWalkerOffset;
          }
          if (endNode === null && currentWalkerOffset + nodeLength >= clampedLocalEnd) {
            endNode = currentNode as Text;
            endNodeOffsetInText = clampedLocalEnd - currentWalkerOffset;
            break;
          }
          currentWalkerOffset += nodeLength;
        }

        if (startNode && endNode) {
          const range = window.document.createRange();
          try {
            // Ensure offsets are not out of bounds for the specific text nodes
            startNodeOffsetInText = Math.min(startNodeOffsetInText, (startNode.textContent || "").length);
            endNodeOffsetInText = Math.min(endNodeOffsetInText, (endNode.textContent || "").length);

            range.setStart(startNode, startNodeOffsetInText);
            range.setEnd(endNode, endNodeOffsetInText);

            const spanElement = window.document.createElement('span');
            spanElement.className = "annotation-highlight";
            spanElement.classList.add(bgColorClass);
            spanElement.setAttribute('data-annotation-id', annotation.id.toString());
            // IMPORTANT: data-annotation-start should store the GLOBAL start offset for jump functionality
            spanElement.setAttribute('data-annotation-start', annotation.startOffset.toString());
            if (annotation.note) {
              spanElement.setAttribute('title', annotation.note);
            }
            range.surroundContents(spanElement);

            const annotationMarkerText = annotation.note ? ' 📝' : '';
            if (annotationMarkerText && spanElement.parentNode) {
              const markerNode = window.document.createTextNode(annotationMarkerText);
              spanElement.parentNode.insertBefore(markerNode, spanElement.nextSibling);
            }
          } catch (e) {
            console.error(`highlightText: Error in surroundContents for ann ID ${annotation.id} on page ${currentPage}`, {
              error: e,
              clampedLocalStart,
              clampedLocalEnd,
              startNodeTextLength: (startNode?.textContent || "").length,
              endNodeTextLength: (endNode?.textContent || "").length,
              startNodeOffsetInText,
              endNodeOffsetInText,
              rangeString: range.toString().substring(0,100)
            });
          }
        } else {
          console.warn(`highlightText: Failed to find start/end nodes for ann ID ${annotation.id} on page ${currentPage}. ClampedLocalStart: ${clampedLocalStart}, ClampedLocalEnd: ${clampedLocalEnd}`);
        }
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
                {documentMetadata.title}
              </h2>
              <span className="text-sm text-muted-foreground">
                Filed: {documentMetadata.filingDate}
              </span>
            </div>
            {/* Zoom Controls and Pagination */}
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1 || isPageLoading}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                Page {currentPage} of {documentMetadata.totalPages || 1}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(documentMetadata.totalPages || 1, p + 1))}
                disabled={currentPage === (documentMetadata.totalPages || 1) || isPageLoading}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
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
          {isPageLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}
          {!isPageLoading && currentPageContent && (
            <div
              dangerouslySetInnerHTML={{
                __html: highlightText(currentPageContent)
              }}
              className="whitespace-pre-wrap"
            />
          )}
          {!isPageLoading && !currentPageContent && (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <p className="text-lg font-medium text-muted-foreground">
                  Page content not available.
                </p>
                <p className="text-sm text-muted-foreground">
                  Try selecting another page or document.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Pagination controls at the bottom as well */}
        {documentMetadata.totalPages && documentMetadata.totalPages > 1 && (
          <div className="mt-6 flex justify-center items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1 || isPageLoading}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {currentPage} of {documentMetadata.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(documentMetadata.totalPages, p + 1))}
              disabled={currentPage === documentMetadata.totalPages || isPageLoading}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}

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
