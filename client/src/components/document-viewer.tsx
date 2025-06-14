import { useQuery } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
// import { Input } from "@/components/ui/input"; // No longer used directly it seems
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Highlighter, Loader2 } from "lucide-react";
import { setupTextSelection } from "@/lib/text-selection";
import { getSECDocumentFullContent } from "@/lib/sec-api";


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

  // const [currentPage, setCurrentPage] = useState(1); // Removed
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
  const [fullDocumentContent, setFullDocumentContent] = useState<string | null>(null);
  const [isContentLoading, setIsContentLoading] = useState<boolean>(false);
  const [pendingScrollOffset, setPendingScrollOffset] = useState<number | null>(null);

  // Fetch document metadata (title, totalPages, etc.)
  const { data: documentMetadata, isLoading: isLoadingMetadata } = useQuery({
    queryKey: ["/api/documents", documentId, "metadata"],
    queryFn: async () => {
      if (!documentId) return null;
      const response = await fetch(`${import.meta.env.BASE_URL}api/documents/${documentId}`);
      // console.log("DocumentViewer: Raw response for document METADATA, documentId:", documentId, response);
      if (!response.ok) throw new Error("Failed to fetch document metadata");
      const metadata = await response.json();
      // console.log("DocumentViewer: Parsed document METADATA for documentId:", documentId, metadata);
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
      const response = await fetch(`${import.meta.env.BASE_URL}api/documents/${documentId}/annotations`);
      // console.log("DocumentViewer: Raw response for annotations, documentId:", documentId, response);
      if (!response.ok) throw new Error("Failed to fetch annotations");
      const annotationsData = await response.json();
      // console.log("DocumentViewer: Parsed annotations for documentId:", documentId, annotationsData);
      return annotationsData;
    },
    enabled: !!documentId,
  });

  console.log(
    "DocumentViewer: Rendering. documentId:", documentId,
    "Annotations count:", annotations.length
    // "Document content snippet (first 100):", documentMetadata?.content?.substring(0,100) ?? "N/A" // Not relevant anymore for main content
  );

  // Effect to fetch full document content
  useEffect(() => {
    if (documentId && documentMetadata) {
      setIsContentLoading(true);
      setFullDocumentContent(null); // Reset content when documentId or metadata changes
      console.log(`DocumentViewer: Fetching full content for document ${documentId}`);
      getSECDocumentFullContent(documentId)
        .then(content => {
          if (content !== null) {
            console.log(`DocumentViewer: Received full content. Length: ${content.length}`);
            setFullDocumentContent(content);
            // Scroll logic is now handled by the new dedicated effect
          } else {
            console.warn(`DocumentViewer: No full content received for document ${documentId}.`);
            setFullDocumentContent(null);
            // setPendingScrollOffset(null); // Pending scroll should persist if content load fails, new effect will not trigger
          }
        })
        .catch(error => {
          console.error(`DocumentViewer: Error fetching full content for document ${documentId}:`, error);
          setFullDocumentContent(null);
          // setPendingScrollOffset(null); // Pending scroll should persist if content load fails
        })
        .finally(() => {
          setIsContentLoading(false);
        });
    }
  // Only re-run if documentId or documentMetadata changes.
  // pendingScrollOffset is removed as a dependency here.
  }, [documentId, documentMetadata]);

  // New useEffect to handle scrolling when pendingScrollOffset changes or content loads
  useEffect(() => {
    // console.log(`[DocumentViewer ScrollEffect] Evaluating. Pending: ${pendingScrollOffset}, ContentLoaded: ${!!fullDocumentContent}, IsLoading: ${isContentLoading}`);
    if (pendingScrollOffset !== null && fullDocumentContent && !isContentLoading) {
      // console.log(`[DocumentViewer ScrollEffect] Conditions met. Pending offset: ${pendingScrollOffset}.`);
      const offsetToScroll = pendingScrollOffset;
      setPendingScrollOffset(null); // Clear immediately

      // console.log(`[DocumentViewer ScrollEffect] Cleared pendingScrollOffset. Scheduling scroll to ${offsetToScroll} in 100ms.`);

      setTimeout(() => {
        // console.log(`[DocumentViewer ScrollEffect setTimeout] Fired for offset ${offsetToScroll}.`);
        if (contentRef.current) {
          // console.log(`[DocumentViewer ScrollEffect setTimeout] contentRef.current exists. Calling scrollToOffset.`);
          // In full content view, local offset is the same as global offset
          scrollToOffset(offsetToScroll, offsetToScroll);
        } else {
          console.warn(`[DocumentViewer ScrollEffect setTimeout] contentRef.current is NULL. Cannot scroll to offset ${offsetToScroll}.`);
        }
      }, 100); // 100ms delay
    } else {
      // if (pendingScrollOffset !== null) {
      //     if (!fullDocumentContent) console.log(`[DocumentViewer ScrollEffect] Condition not met: fullDocumentContent is falsy.`);
      //     if (isContentLoading) console.log(`[DocumentViewer ScrollEffect] Condition not met: isContentLoading is true.`);
      // }
    }
  }, [pendingScrollOffset, fullDocumentContent, isContentLoading]);


  // Reset current page to 1 when documentId changes // This whole useEffect can be removed if setCurrentPage was its only job.
  // useEffect(() => {
    // setCurrentPage(1); // No longer needed
    // setPendingScrollOffset(null); // Clear any pending scroll from a previous document - This is still useful
  // }, [documentId]);
  // Retaining the part of the useEffect that clears pendingScrollOffset on documentId change.
  useEffect(() => {
    setPendingScrollOffset(null);
  }, [documentId]);


  useEffect(() => {
    if (contentRef.current && fullDocumentContent) {
      // console.log("[DocumentViewer] Running setupTextSelection effect. Has fullDocumentContent:", !!fullDocumentContent);
      // const currentPageGlobalStartOffset = (currentPage - 1) * DEFAULT_CHUNK_SIZE; // Removed
      const cleanup = setupTextSelection(contentRef.current, (text: string, startOffset: number, endOffset: number, event: MouseEvent) => {
        // Log inside the callback
        // console.log("[DocumentViewer] Text selection callback triggered!");
        // console.log("[DocumentViewer] Selected text:", text.substring(0, 100) + (text.length > 100 ? "..." : ""));
        // console.log("[DocumentViewer] Local offsets (start/end):", startOffset, "/", endOffset);
        // console.log("[DocumentViewer] Mouse event (clientX/clientY):", event.clientX, "/", event.clientY);

        // With full document content, local offsets are global offsets
        const globalStartOffset = startOffset;
        const globalEndOffset = endOffset;

        setContextMenu({
          x: event.clientX,
          y: event.clientY,
          selectedText: text,
          startOffset: globalStartOffset, // Store global offset
          endOffset: globalEndOffset,     // Store global offset
        });
      });

      return () => {
        // console.log("[DocumentViewer] Cleanup setupTextSelection effect.");
        cleanup();
      };
    } else {
      // console.log("[DocumentViewer] setupTextSelection effect: contentRef.current is null or no fullDocumentContent.");
    }
  }, [fullDocumentContent]); // Removed currentPage

  // Log contextMenu state changes
  useEffect(() => {
    // console.log("[DocumentViewer] contextMenu state changed:", contextMenu);
  }, [contextMenu]);

  // Helper function for scrolling to an offset
  const scrollToOffset = (globalStartOffset: number, localOffsetToScroll: number) => {
    // console.log(`[DocumentViewer scrollToOffset] Called with globalStartOffset: ${globalStartOffset}, localOffsetToScroll: ${localOffsetToScroll}`);
    if (contentRef.current) {
      const annotationElement = contentRef.current.querySelector(`[data-annotation-start="${globalStartOffset}"]`) as HTMLElement;
      if (annotationElement) {
        // console.log(`[DocumentViewer scrollToOffset] Annotation element found for globalStartOffset ${globalStartOffset}:`, annotationElement);

        const scrollContainer = contentRef.current.closest('.overflow-y-auto') as HTMLElement | null;

        // ---- NEW DETAILED LOGGING START ----
        if (scrollContainer) {
          // console.log("[DocumentViewer scrollToOffset] Scroll container found:", scrollContainer);
          const containerRect = scrollContainer.getBoundingClientRect();
          const elementRect = annotationElement.getBoundingClientRect();
          // console.log("[DocumentViewer scrollToOffset] ContainerRect:", JSON.stringify(containerRect));
          // console.log("[DocumentViewer scrollToOffset] ElementRect:", JSON.stringify(elementRect));

          const scrollTopValue = elementRect.top - containerRect.top + scrollContainer.scrollTop - 20; // 20px offset
          // console.log(`[DocumentViewer scrollToOffset] Calculated scrollTopValue: ${scrollTopValue}`);

          // const scrollTopBefore = scrollContainer.scrollTop;
          // console.log(`[DocumentViewer scrollToOffset] scrollContainer.scrollTop BEFORE: ${scrollTopBefore}`);

          scrollContainer.scrollTo({
            top: scrollTopValue,
            behavior: 'auto' // Changed from 'smooth'
          });

          // const scrollTopAfter = scrollContainer.scrollTop;
          // console.log(`[DocumentViewer scrollToOffset] scrollContainer.scrollTop IMMEDIATELY AFTER attempting scrollTo: ${scrollTopAfter}`);

          // setTimeout(() => {
          //   const scrollTopAfterDelay = scrollContainer.scrollTop;
          //   console.log(`[DocumentViewer scrollToOffset] scrollContainer.scrollTop AFTER 100ms DELAY: ${scrollTopAfterDelay}`);
          //   if (scrollTopAfterDelay !== scrollTopAfter) {
          //     console.log(`[DocumentViewer scrollToOffset] scrollTop changed after delay. Initial attempt: ${scrollTopAfter}, After delay: ${scrollTopAfterDelay}`);
          //   }
          // }, 100);

        } else {
          console.warn("[DocumentViewer scrollToOffset] Scroll container (.overflow-y-auto) not found. Using fallback scrollIntoView.");
          annotationElement.scrollIntoView({
            behavior: 'smooth', // Fallback scrollIntoView can remain smooth or be changed as well if desired. Keeping it smooth for now.
            block: 'start'
          });
        }
        // ---- NEW DETAILED LOGGING END ----

      } else {
        console.warn(`[DocumentViewer scrollToOffset] Annotation element NOT found by querySelector for globalStartOffset ${globalStartOffset}. Using fallback percentage scroll.`);
        if (fullDocumentContent) { // Fallback scrolling logic remains, uses fullDocumentContent
          const percentage = localOffsetToScroll / fullDocumentContent.length; // localOffsetToScroll is global here
          const scrollTop = contentRef.current.scrollHeight * percentage;
          const scrollContainerFallback = contentRef.current.closest('.overflow-y-auto') || contentRef.current.parentElement;
          if (scrollContainerFallback) {
            scrollContainerFallback.scrollTo({ top: Math.max(0, scrollTop - 150), behavior: 'auto' }); // Changed fallback to 'auto' as well
          }
        } else {
          console.warn("[DocumentViewer scrollToOffset] Fallback scroll failed: fullDocumentContent is null.");
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
        // console.log("[DocumentViewer] handleClickOutside: Clicked outside, closing context menu.");
        setContextMenu(null);
      } else {
        // Clicked inside the context menu or on the menu itself, do nothing.
        // console.log("[DocumentViewer] handleClickOutside: Clicked inside or on context menu, not closing.");
      }
    };

    // Add listener if menu is open, remove if menu is closed or on cleanup.
    if (contextMenu) {
      // console.log("[DocumentViewer] Adding mousedown listener for handleClickOutside.");
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      // Ensure listener is removed if contextMenu becomes null (e.g. by explicit cancel)
      // This removal might be redundant due to the cleanup function, but good for clarity.
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => {
      // console.log("[DocumentViewer] Cleanup: Removing mousedown listener for handleClickOutside.");
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [contextMenu]); // Re-run this effect when the contextMenu state changes.

  useEffect(() => {
    const eventHandler = (event: CustomEvent) => {
      const { startOffset: globalStartOffsetFromEvent } = event.detail;
      // console.log(`[DocumentViewer] Received 'jumpToAnnotation' window event. Global startOffset: ${globalStartOffsetFromEvent}`);

      if (!documentMetadata) { // Keep this guard
        console.warn("[DocumentViewer jumpToAnnotation event] documentMetadata not available, cannot process jump.");
        return;
      }
      // ALWAYS set pendingScrollOffset. The new dedicated effect will handle the rest.
      // console.log(`[DocumentViewer handleJumpToAnnotation] Setting pendingScrollOffset to: ${globalStartOffsetFromEvent}`);
      setPendingScrollOffset(globalStartOffsetFromEvent);
    };

    // console.log("[DocumentViewer] Adding 'jumpToAnnotation' window event listener.");
    window.addEventListener('jumpToAnnotation', eventHandler as EventListener);
    return () => {
      // console.log("[DocumentViewer] Removing 'jumpToAnnotation' window event listener.");
      window.removeEventListener('jumpToAnnotation', eventHandler as EventListener);
    };
  }, [documentMetadata]); // Dependency only on documentMetadata

  // Effect to handle internal anchor link clicks
  useEffect(() => {
    const contentElement = contentRef.current;
    if (!contentElement || !fullDocumentContent) {
      return;
    }

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const anchorElement = target.closest('a');

      if (anchorElement) {
        const href = anchorElement.getAttribute('href');
        if (href && href.startsWith('#')) {
          // console.log(`[DocumentViewer] Internal anchor link clicked: ${href}`);
          const id = href.substring(1);
          if (id) {
            // Try to find the element within contentRef.current
            // This is important if IDs are not globally unique on the page but are unique within the document content
            const targetElement = contentElement.querySelector(`#${id}`) || document.getElementById(id);

            if (targetElement) {
              // console.log(`[DocumentViewer] Target element found for ID '${id}':`, targetElement);
              event.preventDefault();
              targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
              // No need to set pendingScrollOffset here, as this is a direct client-side scroll.
            } else {
              // console.warn(`[DocumentViewer] Target element with ID '${id}' not found within contentRef or document.`);
            }
          }
        }
      }
    };

    // console.log("[DocumentViewer] Adding click listener for internal anchor links.");
    contentElement.addEventListener('click', handleClick);

    return () => {
      // console.log("[DocumentViewer] Removing click listener for internal anchor links.");
      contentElement.removeEventListener('click', handleClick);
    };
  }, [fullDocumentContent]); // Re-run when fullDocumentContent changes

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
      case 'orange': // Assuming 'orange' is the color set for 'note' types that need dark pink
        return 'highlight-bg-dark-pink';
      case 'green':
        return 'highlight-bg-green';
      // case 'pink': // Original pink, if different from dark pink, can be re-added if needed.
      //  return 'highlight-bg-pink';
      case 'blue':
        return 'highlight-bg-blue';
      case 'pink': // Explicitly handle 'pink' if it's different from 'dark-pink'
        return 'highlight-bg-pink'; // This was the original mapping for 'pink'
      default: // Default could be yellow or another distinct color
        return 'highlight-bg-yellow'; // Changed default to yellow
    }
  };

  const highlightText = (content: string) => {
    console.log("DocumentViewer: highlightText (single-pass) called. Content length:", content?.length);
    if (!content) return "";

    if (
      typeof window.document === 'undefined' ||
      typeof window.document.createElement !== 'function' ||
      typeof window.document.createTreeWalker !== 'function' ||
      typeof window.document.createRange !== 'function'
    ) {
      console.warn("highlightText: SSR guard or missing DOM APIs. Exiting early.");
      return content;
    }

    const tempDiv = window.document.createElement('div');
    tempDiv.innerHTML = content;

    interface TextNodeInfo {
      node: Text;
      globalStartOffset: number;
      textLength: number;
    }

    const allTextNodesInfo: TextNodeInfo[] = [];
    let currentGlobalOffset = 0;
    const textWalker = window.document.createTreeWalker(tempDiv, NodeFilter.SHOW_TEXT, null);
    let textNode;
    while (textNode = textWalker.nextNode() as Text | null) {
      const textContent = textNode.textContent || ""; // Get text content
      const textLength = textContent.length;
      if (textLength > 0) { // Only add if length is greater than 0
        allTextNodesInfo.push({
          node: textNode,
          globalStartOffset: currentGlobalOffset,
          textLength: textLength,
        });
        currentGlobalOffset += textLength;
      }
      // If textLength is 0, currentGlobalOffset does not change for this empty node.
    }

    // console.log(`[highlightText] Collected ${allTextNodesInfo.length} text nodes.`);

    // Ensure annotations are sorted by startOffset, then by endOffset descending (longest first for overlaps)
    const sortedAnnotations = [...annotations].sort((a, b) => {
      if (a.startOffset !== b.startOffset) {
        return a.startOffset - b.startOffset;
      }
      return b.endOffset - a.endOffset; // Longest annotations first if start offsets are the same
    });

    let annotationIndex = 0;
    for (const textNodeInfo of allTextNodesInfo) {
      const nodeStart = textNodeInfo.globalStartOffset;
      const nodeEnd = nodeStart + textNodeInfo.textLength;
      const currentNode = textNodeInfo.node;

      // Optimization: If all annotations have been processed, stop iterating text nodes for highlighting.
      if (annotationIndex >= sortedAnnotations.length) {
          // console.log("[highlightText] All annotations processed. Breaking from text node loop.");
          break;
      }

      // Optimization: Skip text nodes that are before the current annotation's start.
      // This requires currentAnnotation to be defined.
      if (annotationIndex < sortedAnnotations.length && nodeEnd <= sortedAnnotations[annotationIndex].startOffset) {
          continue;
      }

      // Use a new loop for annotations for the current text node to handle multiple annotations on one node
      // This is safer than manipulating annotationIndex directly in the outer loop for this part.
      // However, the original design was to advance annotationIndex, so we'll stick to that.
      while (annotationIndex < sortedAnnotations.length) {
        const currentAnnotation = sortedAnnotations[annotationIndex];

        // If annotation starts after current node ends, move to next text node
        if (currentAnnotation.startOffset >= nodeEnd) {
          // console.log(`[highlightText] Annotation ID ${currentAnnotation.id} (start: ${currentAnnotation.startOffset}) starts after current node (ends: ${nodeEnd}). Breaking for this node.`);
          break;
        }

        // If annotation ends before current node starts, it's fully processed or irrelevant to this and subsequent nodes.
        if (currentAnnotation.endOffset <= nodeStart) {
          // console.log(`[highlightText] Annotation ID ${currentAnnotation.id} (end: ${currentAnnotation.endOffset}) ends before current node (starts: ${nodeStart}). Incrementing annotationIndex.`);
          annotationIndex++;
          continue; // Check next annotation for this same node
        }

        // Overlap exists
        // Calculate segment offsets regardless of type, as span creation is needed for markers/scrolling.
        const highlightStartInNode = Math.max(0, currentAnnotation.startOffset - nodeStart);
        const highlightEndInNode = Math.min(textNodeInfo.textLength, currentAnnotation.endOffset - nodeStart);

        // ADD DETAILED LOGGING HERE
        // console.log(`[Highlight Condition Check] Ann ID: ${currentAnnotation.id}, Type: ${currentAnnotation.type}, AnnOffsets: ${currentAnnotation.startOffset}-${currentAnnotation.endOffset}, NodeRange: ${nodeStart}-${nodeEnd} (len: ${textNodeInfo.textLength}), CalcSegment: ${highlightStartInNode}-${highlightEndInNode}`);

        if (highlightStartInNode < highlightEndInNode) {
            // This is where the span is created. All annotation types that need a text range
            // (e.g., for scrolling, marker placement) should create a span.
            // Visual styling (like background color) is conditional based on type/color.
            // console.log(`[highlightText] Applying highlight/marker span for Ann ID ${currentAnnotation.id} on node starting at ${nodeStart}. Segment: ${highlightStartInNode}-${highlightEndInNode}. Global Ann: ${currentAnnotation.startOffset}-${currentAnnotation.endOffset}`);
            try {
                const range = window.document.createRange();
                range.setStart(currentNode, highlightStartInNode);
                range.setEnd(currentNode, highlightEndInNode);

                const spanElement = window.document.createElement('span');
                spanElement.setAttribute('data-annotation-id', currentAnnotation.id.toString());
                spanElement.setAttribute('data-annotation-start', currentAnnotation.startOffset.toString());

                spanElement.classList.add("annotation-span"); // Base class for all annotation-related spans

                // Apply visual highlighting and specific color if the annotation type is 'highlight' or 'note'.
                // This assumes 'notes' are also meant to be visually highlighted on the text.
                if (currentAnnotation.type === 'highlight' || currentAnnotation.type === 'note') {
                    spanElement.classList.add("annotation-highlight"); // General class for highlighted appearance
                    const bgColorClass = getHighlightBackgroundColorClass(currentAnnotation.color);
                    if (bgColorClass) { // Apply specific background color if one is resolved
                        spanElement.classList.add(bgColorClass);
                    }
                }

                // Add title attribute if a note exists, regardless of type
                if (currentAnnotation.note) {
                   spanElement.setAttribute('title', currentAnnotation.note);
                }

                range.surroundContents(spanElement);

                // Add marker if this segment is the very end of the annotation AND it has a note
                if (currentAnnotation.note && (nodeStart + highlightEndInNode) >= currentAnnotation.endOffset) {
                    if (spanElement.parentNode) { // Check parentNode before insertBefore
                       const markerNode = window.document.createTextNode(' 📝');
                       spanElement.parentNode.insertBefore(markerNode, spanElement.nextSibling);
                    } else {
                        console.warn(`[highlightText] spanElement for Ann ID ${currentAnnotation.id} has no parentNode. Cannot add marker.`);
                    }
                }
            } catch (e) {
                console.error(`[highlightText] Error surrounding contents for Ann ID ${currentAnnotation.id} on node starting at ${nodeStart}`, {
                    error: e,
                    annStart: currentAnnotation.startOffset,
                    annEnd: currentAnnotation.endOffset,
                    nodeStart,
                    nodeEnd,
                    highlightStartInNode,
                    highlightEndInNode,
                });
            }
        }

        // If this annotation is finished within this node, move to the next annotation for this same node.
        if (currentAnnotation.endOffset <= nodeEnd) {
          // console.log(`[highlightText] Annotation ID ${currentAnnotation.id} (end: ${currentAnnotation.endOffset}) finishes in this node (ends: ${nodeEnd}). Incrementing annotationIndex.`);
          annotationIndex++;
          // continue; // This would re-evaluate the *new* currentAnnotation against the same text node.
        } else {
          // This annotation spans past the current text node.
          // So, for the *next text node*, we'll still be considering *this same annotation*.
          // console.log(`[highlightText] Annotation ID ${currentAnnotation.id} (end: ${currentAnnotation.endOffset}) spans past this node (ends: ${nodeEnd}). Breaking for this node, will re-eval ann on next node.`);
          break; // Move to the next text node, current annotation remains the same.
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
              {/* Pagination controls removed */}
              {/* Informational display of totalPages (if desired) can go here, but not as interactive buttons */}
              {documentMetadata.totalPages && (
                 <span className="text-sm text-muted-foreground whitespace-nowrap">
                   (Original Chunks: {documentMetadata.totalPages || 'N/A'}) {/* Example informational display */}
                 </span>
              )}
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
          {isContentLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}
          {!isContentLoading && fullDocumentContent && (
            <div
              dangerouslySetInnerHTML={{
                __html: highlightText(fullDocumentContent)
              }}
              className="whitespace-pre-wrap"
            />
          )}
          {!isContentLoading && !fullDocumentContent && (
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
        {/* Bottom pagination controls removed */}

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
                // console.log("[DocumentViewer] Annotate button clicked. Global offsets from contextMenu state:", contextMenu.startOffset, contextMenu.endOffset);
                onTextSelection(contextMenu.selectedText, contextMenu.startOffset, contextMenu.endOffset);
                setContextMenu(null); // Close menu after action
              }}
            >
              <span>Annotate</span>
            </button>
            <button
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center space-x-2"
              onClick={() => {
                // console.log("[DocumentViewer] Cancel button clicked for context menu.");
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
