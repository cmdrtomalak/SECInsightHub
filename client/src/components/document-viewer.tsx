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
  const contextMenuRef = useRef<HTMLDivElement>(null); // Create ref for context menu
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
    if (documentId && documentMetadata) {
      setIsPageLoading(true);
      setCurrentPageContent(null);
      console.log(`DocumentViewer: Fetching page ${currentPage} for document ${documentId}`);
      getSECDocumentPage(documentId, currentPage)
        .then(chunk => {
          if (chunk) {
            console.log(`DocumentViewer: Received page ${currentPage} content. Length: ${chunk.content.length}`);
            setCurrentPageContent(chunk.content);
            // If there's a pending scroll, execute it now that content is loaded
            if (pendingScrollOffset !== null) {
              const targetPageForPendingScroll = Math.floor(pendingScrollOffset / DEFAULT_CHUNK_SIZE) + 1;
              if (currentPage === targetPageForPendingScroll) {
                console.log(`[DocumentViewer pendingScrollEffect] Current page ${currentPage} matches target page for pending scroll. Attempting scroll.`);
                const localOffsetToScroll = pendingScrollOffset % DEFAULT_CHUNK_SIZE;

                setTimeout(() => {
                  console.log(`[DocumentViewer pendingScrollEffect] setTimeout: Executing for global offset ${pendingScrollOffset}. Current page: ${currentPage}.`);

                  // ---- NEW DETAILED LOGGING START ----
                  if (pendingScrollOffset !== null) { // Re-check pendingScrollOffset as it might be cleared by a rapid subsequent event
                    if (contentRef.current) {
                      console.log(`[DocumentViewer pendingScrollEffect] setTimeout: contentRef.current is available.`);
                      const element = contentRef.current.querySelector(`[data-annotation-start="${pendingScrollOffset}"]`) as HTMLElement;
                      if (element) {
                        console.log(`[DocumentViewer pendingScrollEffect] setTimeout: querySelector FOUND element:`, element);
                      } else {
                        console.warn(`[DocumentViewer pendingScrollEffect] setTimeout: querySelector DID NOT FIND element for offset ${pendingScrollOffset}.`);
                      }
                    } else {
                      console.warn(`[DocumentViewer pendingScrollEffect] setTimeout: contentRef.current is NULL at time of query.`);
                    }
                  // ---- NEW DETAILED LOGGING END ----

                    scrollToOffset(pendingScrollOffset, localOffsetToScroll); // Call existing function
                  } else {
                    console.log(`[DocumentViewer pendingScrollEffect] setTimeout: pendingScrollOffset became null before scrollToOffset call.`);
                  }
                  setPendingScrollOffset(null); // Clear pending offset after attempting scroll
                }, 50);

              } else {
                console.log(`[DocumentViewer pendingScrollEffect] Current page ${currentPage} does NOT match target page ${targetPageForPendingScroll} for pending scroll ${pendingScrollOffset}. This should ideally not happen if page navigation was successful. Clearing pending offset.`);
                setPendingScrollOffset(null); // Clear if pages don't match to prevent stale scrolls
              }
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
      console.log("[DocumentViewer] Running setupTextSelection effect. currentPage:", currentPage, "Has currentPageContent:", !!currentPageContent);
      const currentPageGlobalStartOffset = (currentPage - 1) * DEFAULT_CHUNK_SIZE;
      const cleanup = setupTextSelection(contentRef.current, (text: string, startOffset: number, endOffset: number, event: MouseEvent) => {
        // Log inside the callback
        console.log("[DocumentViewer] Text selection callback triggered!");
        console.log("[DocumentViewer] Selected text:", text.substring(0, 100) + (text.length > 100 ? "..." : ""));
        console.log("[DocumentViewer] Local offsets (start/end):", startOffset, "/", endOffset);
        console.log("[DocumentViewer] Mouse event (clientX/clientY):", event.clientX, "/", event.clientY);

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

      return () => {
        console.log("[DocumentViewer] Cleanup setupTextSelection effect. currentPage:", currentPage);
        cleanup();
      };
    } else {
      console.log("[DocumentViewer] setupTextSelection effect: contentRef.current is null or no currentPageContent.");
    }
  }, [currentPageContent, currentPage]);

  // Log contextMenu state changes
  useEffect(() => {
    console.log("[DocumentViewer] contextMenu state changed:", contextMenu);
  }, [contextMenu]);

  // Helper function for scrolling to an offset
  const scrollToOffset = (globalStartOffset: number, localOffsetToScroll: number) => {
    console.log(`[DocumentViewer scrollToOffset] Called with globalStartOffset: ${globalStartOffset}, localOffsetToScroll: ${localOffsetToScroll}`);
    if (contentRef.current) {
      const annotationElement = contentRef.current.querySelector(`[data-annotation-start="${globalStartOffset}"]`) as HTMLElement;
      if (annotationElement) {
        console.log(`[DocumentViewer scrollToOffset] Annotation element found for globalStartOffset ${globalStartOffset}:`, annotationElement);

        const scrollContainer = contentRef.current.closest('.overflow-y-auto') as HTMLElement | null;

        // ---- NEW DETAILED LOGGING START ----
        if (scrollContainer) {
          console.log("[DocumentViewer scrollToOffset] Scroll container found:", scrollContainer);
          const containerRect = scrollContainer.getBoundingClientRect();
          const elementRect = annotationElement.getBoundingClientRect();
          console.log("[DocumentViewer scrollToOffset] ContainerRect:", JSON.stringify(containerRect));
          console.log("[DocumentViewer scrollToOffset] ElementRect:", JSON.stringify(elementRect));

          const scrollTopValue = elementRect.top - containerRect.top + scrollContainer.scrollTop - 20; // 20px offset
          console.log(`[DocumentViewer scrollToOffset] Calculated scrollTopValue: ${scrollTopValue}`);

          const scrollTopBefore = scrollContainer.scrollTop;
          console.log(`[DocumentViewer scrollToOffset] scrollContainer.scrollTop BEFORE: ${scrollTopBefore}`);

          scrollContainer.scrollTo({
            top: scrollTopValue,
            behavior: 'smooth'
          });

          console.log(`[DocumentViewer scrollToOffset] scrollContainer.scrollTop AFTER attempting scrollTo: ${scrollContainer.scrollTop}`);

        } else {
          console.warn("[DocumentViewer scrollToOffset] Scroll container (.overflow-y-auto) not found. Using fallback scrollIntoView.");
          annotationElement.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }
        // ---- NEW DETAILED LOGGING END ----

      } else {
        console.warn(`[DocumentViewer scrollToOffset] Annotation element NOT found by querySelector for globalStartOffset ${globalStartOffset}. Using fallback percentage scroll.`);
        if (currentPageContent) { // Fallback scrolling logic remains
          const percentage = localOffsetToScroll / currentPageContent.length;
          const scrollTop = contentRef.current.scrollHeight * percentage;
          const scrollContainerFallback = contentRef.current.closest('.overflow-y-auto') || contentRef.current.parentElement;
          if (scrollContainerFallback) {
            scrollContainerFallback.scrollTo({ top: Math.max(0, scrollTop - 150), behavior: 'smooth' });
          }
        } else {
          console.warn("[DocumentViewer scrollToOffset] Fallback scroll failed: currentPageContent is null.");
        }
      }
    } else {
      console.warn("[DocumentViewer scrollToOffset] contentRef.current is null.");
    }
  };

  // Close context menu when clicking elsewhere
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        // Clicked outside the context menu
        console.log("[DocumentViewer] handleClickOutside: Clicked outside, closing context menu.");
        setContextMenu(null);
      } else {
        // Clicked inside the context menu or on the menu itself, do nothing.
        console.log("[DocumentViewer] handleClickOutside: Clicked inside or on context menu, not closing.");
      }
    };

    // Add listener if menu is open, remove if menu is closed or on cleanup.
    if (contextMenu) {
      console.log("[DocumentViewer] Adding mousedown listener for handleClickOutside.");
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      // Ensure listener is removed if contextMenu becomes null (e.g. by explicit cancel)
      // This removal might be redundant due to the cleanup function, but good for clarity.
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => {
      console.log("[DocumentViewer] Cleanup: Removing mousedown listener for handleClickOutside.");
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [contextMenu]); // Re-run this effect when the contextMenu state changes.

  useEffect(() => {
    const eventHandler = (event: CustomEvent) => { // Renamed to eventHandler to avoid confusion with the outer scope function name
      const { startOffset: globalStartOffsetFromEvent } = event.detail;
      console.log(`[DocumentViewer] Received 'jumpToAnnotation' window event. Global startOffset: ${globalStartOffsetFromEvent}`);

      if (!documentMetadata) {
        console.warn("[DocumentViewer jumpToAnnotation event] documentMetadata not available, cannot jump.");
        return;
      }
      // It's okay if currentPageContent is not yet available for the target page,
      // as pendingScrollOffset logic will handle scrolling after content load.

      console.log(`[DocumentViewer handleJumpToAnnotation] Called with globalStartOffset: ${globalStartOffsetFromEvent}`);
      const targetPage = Math.floor(globalStartOffsetFromEvent / DEFAULT_CHUNK_SIZE) + 1;
      const localOffsetForScroll = globalStartOffsetFromEvent % DEFAULT_CHUNK_SIZE;
      console.log(`[DocumentViewer handleJumpToAnnotation] Calculated targetPage: ${targetPage}, localOffsetForScroll: ${localOffsetForScroll}, currentPage: ${currentPage}`);

      if (targetPage !== currentPage) {
        console.log(`[DocumentViewer handleJumpToAnnotation] Navigating to page ${targetPage}. Setting pendingScrollOffset to: ${globalStartOffsetFromEvent}`);
        setPendingScrollOffset(globalStartOffsetFromEvent);
        setCurrentPage(targetPage);
      } else {
        console.log(`[DocumentViewer handleJumpToAnnotation] Already on target page ${currentPage}. Calling scrollToOffset directly.`);
        scrollToOffset(globalStartOffsetFromEvent, localOffsetForScroll);
      }
    };

    console.log("[DocumentViewer] Adding 'jumpToAnnotation' window event listener.");
    window.addEventListener('jumpToAnnotation', eventHandler as EventListener);
    return () => {
      console.log("[DocumentViewer] Removing 'jumpToAnnotation' window event listener.");
      window.removeEventListener('jumpToAnnotation', eventHandler as EventListener);
    };
    // Added documentMetadata to dependencies because it's used in the handler.
    // currentPage is also used for comparison.
  }, [documentMetadata, currentPage]);

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
      const clampedLocalStart = Math.max(0, annotation.localStart);
      const clampedLocalEnd = Math.min(content.length, annotation.localEnd);

      if (clampedLocalStart >= clampedLocalEnd) {
        console.log(`[highlightText TreeWalker] Ann ID ${annotation.id}, Page ${currentPage}. Skipping as clampedLocalStart (${clampedLocalStart}) >= clampedLocalEnd (${clampedLocalEnd}). Original global: ${annotation.startOffset}-${annotation.endOffset}, Local: ${annotation.localStart}-${annotation.localEnd}.`);
        continue;
      }

      console.log( // This is the existing "PROCESSED annotation" log, adjusted slightly
        `[highlightText TreeWalker] Processing Ann ID ${annotation.id}, Page ${currentPage}. Global: ${annotation.startOffset}-${annotation.endOffset}. Seeking localStart: ${annotation.localStart} (clamped: ${clampedLocalStart}), localEnd: ${annotation.localEnd} (clamped: ${clampedLocalEnd}). Content length: ${content.length}`
      );

      if (isNaN(clampedLocalStart) || isNaN(clampedLocalEnd)) {
        console.warn(
          `[highlightText TreeWalker] Ann ID ${annotation.id}: NaN DETECTED IN CLAMPED LOCAL OFFSETS. LocalStart: ${clampedLocalStart}, LocalEnd: ${clampedLocalEnd}`
        );
        continue;
      }

      if (annotation.type === 'highlight') {
        const bgColorClass = getHighlightBackgroundColorClass(annotation.color);
        const walker = window.document.createTreeWalker(tempDiv, NodeFilter.SHOW_TEXT, null);
        let currentWalkerOffset = 0; // Renamed from currentOffset for clarity within this scope
        let startNode: Text | null = null;
        let endNode: Text | null = null;
        let startNodeOffsetInText = 0; // Renamed from startNodeOffset
        let endNodeOffsetInText = 0;   // Renamed from endNodeOffset

        let currentNode;
        while (currentNode = walker.nextNode()) {
          const nodeText = currentNode.textContent || "";
          const nodeLength = nodeText.length;

          console.log(`[highlightText TreeWalker] Ann ID ${annotation.id}: Node type: ${currentNode.nodeType}, currentWalkerOffset: ${currentWalkerOffset}, nodeLength: ${nodeLength}, Node text (snippet): "${nodeText.substring(0, 50).replace(/\n/g, ' ')}"`);

          if (startNode === null) {
            console.log(`[highlightText TreeWalker] Ann ID ${annotation.id}: Checking for startNode. Condition: (${currentWalkerOffset} + ${nodeLength} > ${clampedLocalStart}) = ${currentWalkerOffset + nodeLength > clampedLocalStart}`);
          }
          if (startNode === null && currentWalkerOffset + nodeLength > clampedLocalStart) {
            startNode = currentNode as Text;
            startNodeOffsetInText = clampedLocalStart - currentWalkerOffset;
            console.log(`[highlightText TreeWalker] Ann ID ${annotation.id}: Found startNode! startNodeOffsetInText: ${startNodeOffsetInText}. Node text: "${startNode.textContent?.substring(0,100).replace(/\n/g, ' ')}"`);
          }

          // Check endNode condition regardless of whether startNode is found yet, but only assign if endNode is still null.
          // This helps in logging the condition check accurately.
          if (endNode === null) {
             console.log(`[highlightText TreeWalker] Ann ID ${annotation.id}: Checking for endNode. Condition: (${currentWalkerOffset} + ${nodeLength} >= ${clampedLocalEnd}) = ${currentWalkerOffset + nodeLength >= clampedLocalEnd}`);
          }
          if (endNode === null && currentWalkerOffset + nodeLength >= clampedLocalEnd) {
            endNode = currentNode as Text;
            endNodeOffsetInText = clampedLocalEnd - currentWalkerOffset;
            console.log(`[highlightText TreeWalker] Ann ID ${annotation.id}: Found endNode! endNodeOffsetInText: ${endNodeOffsetInText}. Node text: "${endNode.textContent?.substring(0,100).replace(/\n/g, ' ')}"`);
            if (startNode === null) {
              console.error(`[highlightText TreeWalker] Ann ID ${annotation.id}: Found endNode BUT startNode is still null! This is an error. ClampedLocalStart: ${clampedLocalStart}`);
            }
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
            ref={contextMenuRef} // Assign the ref here
            className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-2 min-w-48"
            style={{
              left: `${contextMenu.x}px`,
              top: `${contextMenu.y}px`,
            }}
            // Removed onClick={(e) => e.stopPropagation()}
          >
            <button
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center space-x-2"
              onClick={() => {
                // contextMenu.startOffset and .endOffset are already global due to setupTextSelection modification
                console.log("[DocumentViewer] Annotate button clicked. Global offsets from contextMenu state:", contextMenu.startOffset, contextMenu.endOffset);
                onTextSelection(contextMenu.selectedText, contextMenu.startOffset, contextMenu.endOffset);
                setContextMenu(null); // Close menu after action
              }}
            >
              <span>Annotate</span>
            </button>
            <button
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center space-x-2"
              onClick={() => {
                console.log("[DocumentViewer] Cancel button clicked for context menu.");
                setContextMenu(null);
              }}
            >
              <span>Cancel</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
