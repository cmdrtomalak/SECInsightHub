// Text selection utilities for annotation functionality
export function setupTextSelection(
  container: HTMLElement,
  onTextSelection: (text: string, startOffset: number, endOffset: number, event: MouseEvent) => void
): () => void {
  let isSelecting = false;

  const handleMouseUp = (event: MouseEvent) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const selectedText = selection.toString().trim();

    if (selectedText.length === 0) return;

    // Check if selection is within our container
    if (!container.contains(range.commonAncestorContainer)) return;

    // Calculate text offsets relative to the container's text content
    const textContent = container.textContent || "";
    const beforeRange = document.createRange();
    beforeRange.setStart(container, 0);
    beforeRange.setEnd(range.startContainer, range.startOffset);
    
    const startOffset = beforeRange.toString().length;
    const endOffset = startOffset + selectedText.length;

    onTextSelection(selectedText, startOffset, endOffset, event);
  };

  const handleMouseDown = () => {
    isSelecting = true;
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    // Keyboard shortcuts for annotation
    if (e.ctrlKey || e.metaKey) {
      const selection = window.getSelection();
      const selectedText = selection?.toString().trim();

      if (selectedText && selectedText.length > 0) {
        switch (e.key) {
          case 'h':
            e.preventDefault();
            // Create a fake mouse event for keyboard shortcuts
            const fakeEvent = new MouseEvent('mouseup', { 
              clientX: 0, 
              clientY: 0, 
              bubbles: true, 
              cancelable: true 
            });
            handleMouseUp(fakeEvent);
            break;
          case 'n':
            e.preventDefault();
            const fakeEvent2 = new MouseEvent('mouseup', { 
              clientX: 0, 
              clientY: 0, 
              bubbles: true, 
              cancelable: true 
            });
            handleMouseUp(fakeEvent2);
            break;
          case 'b':
            e.preventDefault();
            const fakeEvent3 = new MouseEvent('mouseup', { 
              clientX: 0, 
              clientY: 0, 
              bubbles: true, 
              cancelable: true 
            });
            handleMouseUp(fakeEvent3);
            break;
        }
      }
    }
  };

  // Add event listeners
  container.addEventListener('mouseup', handleMouseUp);
  container.addEventListener('mousedown', handleMouseDown);
  if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('keydown', handleKeyDown);
  }

  // Return cleanup function
  return () => {
    container.removeEventListener('mouseup', handleMouseUp);
    container.removeEventListener('mousedown', handleMouseDown);
    if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
      document.removeEventListener('keydown', handleKeyDown);
    }
  };
}

export function getTextOffset(container: HTMLElement, node: Node, offset: number): number {
  let textOffset = 0;
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    null
  );

  let currentNode;
  while (currentNode = walker.nextNode()) {
    if (currentNode === node) {
      return textOffset + offset;
    }
    textOffset += currentNode.textContent?.length || 0;
  }

  return textOffset;
}

export function highlightRange(container: HTMLElement, startOffset: number, endOffset: number, className: string): void {
  const textContent = container.textContent || "";
  const text = textContent.substring(startOffset, endOffset);

  if (!text) return;

  // Create a range for the text to highlight
  const walker = document.createTreeWalker(
    container,
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

    if (startNode === null && currentOffset + nodeLength > startOffset) {
      startNode = currentNode as Text;
      startNodeOffset = startOffset - currentOffset;
    }

    if (endNode === null && currentOffset + nodeLength >= endOffset) {
      endNode = currentNode as Text;
      endNodeOffset = endOffset - currentOffset;
      break;
    }

    currentOffset += nodeLength;
  }

  if (startNode && endNode) {
    const range = document.createRange();
    range.setStart(startNode, startNodeOffset);
    range.setEnd(endNode, endNodeOffset);

    // Create highlight span
    const span = document.createElement('span');
    span.className = className;
    
    try {
      range.surroundContents(span);
    } catch (e) {
      // If we can't surround contents (crosses element boundaries),
      // extract and wrap the content
      const contents = range.extractContents();
      span.appendChild(contents);
      range.insertNode(span);
    }
  }
}
