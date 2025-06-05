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

  // Effect to fetch full document content
  useEffect(() => {
    if (documentId && documentMetadata) {
      setIsContentLoading(true);
      setFullDocumentContent(null);
      console.log(`DocumentViewer: Fetching full content for document ${documentId}`);
      getSECDocumentFullContent(documentId)
        .then(content => {
          if (content !== null) {
            console.log(`DocumentViewer: Received full content. Length: ${content.length}`);
            setFullDocumentContent(content);
            // If there's a pending scroll, execute it now that content is loaded
            // With full content, any pending scroll can be attempted directly.
            if (pendingScrollOffset !== null) {
                console.log(`[DocumentViewer pendingScrollEffect] Full content loaded. Attempting scroll for pending offset ${pendingScrollOffset}.`);
                // The concept of "localOffsetToScroll" becomes the global offset itself in full content view
                const offsetToScrollTo = pendingScrollOffset;

                setTimeout(() => {
                  console.log(`[DocumentViewer pendingScrollEffect] setTimeout: Executing for global offset ${pendingScrollOffset}.`);

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

                    scrollToOffset(offsetToScrollTo, offsetToScrollTo); // localOffset is same as global in full content
                  } else {
                    console.log(`[DocumentViewer pendingScrollEffect] setTimeout: pendingScrollOffset became null before scrollToOffset call.`);
                  }
                  setPendingScrollOffset(null); // Clear pending offset after attempting scroll
                }, 50);
            }
          } else {
            console.warn(`DocumentViewer: No full content received for document ${documentId}.`);
            setFullDocumentContent(null);
            setPendingScrollOffset(null); // Clear pending scroll if content load failed
          }
        })
        .catch(error => {
          console.error(`DocumentViewer: Error fetching full content for document ${documentId}:`, error);
          setFullDocumentContent(null);
          setPendingScrollOffset(null); // Clear pending scroll if content load failed
        })
        .finally(() => {
          setIsContentLoading(false);
        });
    }
  // Removed currentPage from dependencies, documentMetadata is used as a trigger.
  // pendingScrollOffset is kept to re-run if it changes while content is already loaded.
  }, [documentId, documentMetadata, pendingScrollOffset]);


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
      console.log("[DocumentViewer] Running setupTextSelection effect. Has fullDocumentContent:", !!fullDocumentContent);
      // const currentPageGlobalStartOffset = (currentPage - 1) * DEFAULT_CHUNK_SIZE; // Removed
      const cleanup = setupTextSelection(contentRef.current, (text: string, startOffset: number, endOffset: number, event: MouseEvent) => {
        // Log inside the callback
        console.log("[DocumentViewer] Text selection callback triggered!");
        console.log("[DocumentViewer] Selected text:", text.substring(0, 100) + (text.length > 100 ? "..." : ""));
        console.log("[DocumentViewer] Local offsets (start/end):", startOffset, "/", endOffset);
        console.log("[DocumentViewer] Mouse event (clientX/clientY):", event.clientX, "/", event.clientY);

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
        console.log("[DocumentViewer] Cleanup setupTextSelection effect.");
        cleanup();
      };
    } else {
      console.log("[DocumentViewer] setupTextSelection effect: contentRef.current is null or no fullDocumentContent.");
    }
  }, [fullDocumentContent]); // Removed currentPage

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
        if (fullDocumentContent) { // Fallback scrolling logic remains, uses fullDocumentContent
          const percentage = localOffsetToScroll / fullDocumentContent.length; // localOffsetToScroll is global here
          const scrollTop = contentRef.current.scrollHeight * percentage;
          const scrollContainerFallback = contentRef.current.closest('.overflow-y-auto') || contentRef.current.parentElement;
          if (scrollContainerFallback) {
            scrollContainerFallback.scrollTo({ top: Math.max(0, scrollTop - 150), behavior: 'smooth' });
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
      // It's okay if fullDocumentContent is not yet available,
      // as pendingScrollOffset logic will handle scrolling after content load.

      console.log(`[DocumentViewer handleJumpToAnnotation] Called with globalStartOffset: ${globalStartOffsetFromEvent}`);
      // const targetPage = Math.floor(globalStartOffsetFromEvent / DEFAULT_CHUNK_SIZE) + 1; // No pages
      // const localOffsetForScroll = globalStartOffsetFromEvent % DEFAULT_CHUNK_SIZE; // No local offset in this context

      // If full content isn't loaded yet, set pending scroll. Otherwise, scroll immediately.
      if (!fullDocumentContent) {
        console.log(`[DocumentViewer handleJumpToAnnotation] Full content not loaded. Setting pendingScrollOffset to: ${globalStartOffsetFromEvent}`);
        setPendingScrollOffset(globalStartOffsetFromEvent);
      } else {
        console.log(`[DocumentViewer handleJumpToAnnotation] Full content loaded. Calling scrollToOffset directly.`);
        // For full content, localOffsetToScroll is the same as globalStartOffsetFromEvent
        scrollToOffset(globalStartOffsetFromEvent, globalStartOffsetFromEvent);
      }
    };

    console.log("[DocumentViewer] Adding 'jumpToAnnotation' window event listener.");
    window.addEventListener('jumpToAnnotation', eventHandler as EventListener);
    return () => {
      console.log("[DocumentViewer] Removing 'jumpToAnnotation' window event listener.");
      window.removeEventListener('jumpToAnnotation', eventHandler as EventListener);
    };
    // documentMetadata is used. fullDocumentContent is used to decide immediate scroll vs pending.
  }, [documentMetadata, fullDocumentContent]);

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
    // console.log("highlightText: Called. Initial content snippet (first 500):", content.substring(0, 500));

    const tempDiv = window.document.createElement('div');
    tempDiv.innerHTML = content; // content is fullDocumentContent

    // const currentPageGlobalStartOffset = (currentPage - 1) * DEFAULT_CHUNK_SIZE; // Removed

    // Annotations are already global. No need to filter by page or calculate local offsets here.
    // All annotations for the document are relevant.
    const annotationsToDisplay = annotations
      // Sort by original global start offset to maintain highlighting order
      .sort((a, b) => b.startOffset - a.startOffset); // Descending for processing from end of content

    console.log(`DocumentViewer: Highlighting. Displaying ${annotationsToDisplay.length} annotations from ${annotations.length} total.`);

    for (const annotation of annotationsToDisplay) {
      // Offsets are already global and relative to the full content.
      const clampedLocalStart = Math.max(0, annotation.startOffset);
      const clampedLocalEnd = Math.min(content.length, annotation.endOffset);

      if (clampedLocalStart >= clampedLocalEnd) {
        console.log(`[highlightText TreeWalker] Ann ID ${annotation.id}. Skipping as clampedStart (${clampedLocalStart}) >= clampedEnd (${clampedLocalEnd}). Original global: ${annotation.startOffset}-${annotation.endOffset}.`);
        continue;
      }

      console.log(
        `[highlightText TreeWalker] Processing Ann ID ${annotation.id}. Global: ${annotation.startOffset}-${annotation.endOffset}. Clamped: ${clampedLocalStart}-${clampedLocalEnd}. Content length: ${content.length}`
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
            console.error(`[highlightText TreeWalker] Ann ID ${annotation.id}: Found endNode BUT startNode is still null! This is an error. ClampedStart: ${clampedLocalStart}`);
            }
            break;
          }
          currentWalkerOffset += nodeLength;
        }

        if (startNode && endNode) {
          const baseClass = "annotation-highlight";
          const annotationIdStr = annotation.id.toString();
          const globalAnnotationStartStr = annotation.startOffset.toString(); // Key for scrolling

          const addMarkerIfNeeded = (referenceNode: Node) => {
              if (annotation.note && referenceNode.parentNode) {
                  const markerNode = window.document.createTextNode(' 📝');
                  referenceNode.parentNode.insertBefore(markerNode, referenceNode.nextSibling);
              }
          };

          if (startNode === endNode) {
              try {
                  const range = window.document.createRange();
                  // Use the already calculated startNodeOffsetInText and endNodeOffsetInText
                  // Ensure offsets are within the bounds of the specific text node's content
                  const SNodeOffset = Math.min(startNodeOffsetInText, (startNode.textContent || "").length);
                  const ENodeOffset = Math.min(endNodeOffsetInText, (startNode.textContent || "").length);

                  range.setStart(startNode, SNodeOffset);
                  range.setEnd(startNode, ENodeOffset); // Use startNode here as it's the same as endNode

                  const spanElement = window.document.createElement('span');
                  spanElement.className = `${baseClass} ${bgColorClass}`;
                  spanElement.setAttribute('data-annotation-id', annotationIdStr);
                  spanElement.setAttribute('data-annotation-start', globalAnnotationStartStr);
                  if (annotation.note) {
                      spanElement.setAttribute('title', annotation.note);
                  }
                  range.surroundContents(spanElement);
                  addMarkerIfNeeded(spanElement);
              } catch (e) {
                  console.error(`highlightText (single-node): Error for ann ID ${annotation.id}`, {
                      error: e,
                      clampedStart: clampedLocalStart,
                      clampedEnd: clampedLocalEnd,
                      startNodeOffset: startNodeOffsetInText,
                      endNodeOffset: endNodeOffsetInText,
                      nodeLength: (startNode.textContent || "").length,
                      rangeString: range.toString().substring(0,100)
                  });
              }
          } else { // startNode !== endNode - Multi-node highlighting
              // 1. Highlight startNode
              try {
                  const rangeStart = window.document.createRange();
                  const SNodeOffset = Math.min(startNodeOffsetInText, (startNode.textContent || "").length);
                  rangeStart.setStart(startNode, SNodeOffset);
                  rangeStart.setEnd(startNode, (startNode.textContent || "").length); // Highlight to the end of the startNode

                  const spanElementStart = window.document.createElement('span');
                  spanElementStart.className = `${baseClass} ${bgColorClass}`;
                  spanElementStart.setAttribute('data-annotation-id', annotationIdStr);
                  spanElementStart.setAttribute('data-annotation-start', globalAnnotationStartStr);
                  // No title or marker on partial segments usually, unless it's the only segment.
                  // Here, title and marker will be on the end segment.
                  rangeStart.surroundContents(spanElementStart);
              } catch (e) {
                  console.error(`highlightText (multi-node start): Error for ann ID ${annotation.id}`, {
                      error: e,
                      clampedStart: clampedLocalStart,
                      startNodeOffset: startNodeOffsetInText,
                      nodeLength: (startNode.textContent || "").length
                  });
              }

              // 2. Highlight nodes in between
              // Use a new TreeWalker that starts from the tempDiv root.
              // This ensures it's independent of the outer walker's state.
              const intermediateWalker = window.document.createTreeWalker(tempDiv, NodeFilter.SHOW_TEXT, null);
              let activeHighlighting = false;
              let tempCurrentNode;
              while (tempCurrentNode = intermediateWalker.nextNode()) {
                  if (tempCurrentNode === startNode) {
                      activeHighlighting = true;
                      continue; // Start node handled
                  }
                  if (tempCurrentNode === endNode) {
                      activeHighlighting = false; // Stop before processing end node
                      break;
                  }
                  if (activeHighlighting && tempCurrentNode.textContent && tempCurrentNode.textContent.trim() !== '') {
                      try {
                          const rangeMiddle = document.createRange();
                          rangeMiddle.selectNodeContents(tempCurrentNode); // Highlight the entire text node
                          const spanElementMiddle = document.createElement('span');
                          spanElementMiddle.className = `${baseClass} ${bgColorClass}`;
                          spanElementMiddle.setAttribute('data-annotation-id', annotationIdStr);
                          spanElementMiddle.setAttribute('data-annotation-start', globalAnnotationStartStr);
                          rangeMiddle.surroundContents(spanElementMiddle);
                      } catch (e) {
                          console.error(`highlightText (multi-node middle): Error for ann ID ${annotation.id} on node`, tempCurrentNode, e);
                      }
                  }
              }

              // 3. Highlight endNode
              try {
                  const rangeEnd = window.document.createRange();
                  const ENodeOffset = Math.min(endNodeOffsetInText, (endNode.textContent || "").length);
                  rangeEnd.setStart(endNode, 0); // Highlight from the beginning of the endNode
                  rangeEnd.setEnd(endNode, ENodeOffset);

                  const spanElementEnd = window.document.createElement('span');
                  spanElementEnd.className = `${baseClass} ${bgColorClass}`;
                  spanElementEnd.setAttribute('data-annotation-id', annotationIdStr);
                  spanElementEnd.setAttribute('data-annotation-start', globalAnnotationStartStr);
                  if (annotation.note) { // Add title to the last segment
                      spanElementEnd.setAttribute('title', annotation.note);
                  }
                  rangeEnd.surroundContents(spanElementEnd);
                  addMarkerIfNeeded(spanElementEnd); // Add marker after the last segment
              } catch (e) {
                  console.error(`highlightText (multi-node end): Error for ann ID ${annotation.id}`, {
                      error: e,
                      clampedEnd: clampedLocalEnd,
                      endNodeOffset: endNodeOffsetInText,
                      nodeLength: (endNode.textContent || "").length
                  });
              }
          }
        } else {
            // Original warning if start/end nodes not found
            console.warn(`highlightText: Failed to find start/end nodes for ann ID ${annotation.id}. ClampedStart: ${clampedLocalStart}, ClampedEnd: ${clampedLocalEnd}`);
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
