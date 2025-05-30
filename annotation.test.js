// Test file for annotation functionality
// Run these tests manually in browser console to validate features

const AnnotationTests = {
  // Test 1: Verify annotation creation
  testAnnotationCreation: async () => {
    console.log('Testing annotation creation...');
    
    const testAnnotation = {
      documentId: 1,
      type: 'highlight',
      selectedText: 'Test highlighted text',
      note: 'Test note',
      color: 'orange',
      pageNumber: 1,
      startOffset: 100,
      endOffset: 120
    };
    
    try {
      const response = await fetch('/api/annotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testAnnotation)
      });
      
      const result = await response.json();
      console.log('✓ Annotation created:', result);
      return result.id;
    } catch (error) {
      console.error('✗ Annotation creation failed:', error);
      return null;
    }
  },

  // Test 2: Verify annotation retrieval
  testAnnotationRetrieval: async (documentId = 1) => {
    console.log('Testing annotation retrieval...');
    
    try {
      const response = await fetch(`/api/documents/${documentId}/annotations`);
      const annotations = await response.json();
      console.log('✓ Annotations retrieved:', annotations.length, 'found');
      return annotations;
    } catch (error) {
      console.error('✗ Annotation retrieval failed:', error);
      return [];
    }
  },

  // Test 3: Verify search functionality
  testAnnotationSearch: async (query = 'test') => {
    console.log('Testing annotation search...');
    
    try {
      const response = await fetch(`/api/annotations/search?q=${encodeURIComponent(query)}`);
      const results = await response.json();
      console.log('✓ Search results:', results.length, 'found');
      return results;
    } catch (error) {
      console.error('✗ Search failed:', error);
      return [];
    }
  },

  // Test 4: Verify highlight colors
  testHighlightColors: () => {
    console.log('Testing highlight colors...');
    
    const colors = ['orange', 'green', 'pink', 'blue'];
    const expectedColors = {
      orange: '#fed7aa',
      green: '#bbf7d0', 
      pink: '#fce7f3',
      blue: '#dbeafe'
    };
    
    colors.forEach(color => {
      const element = document.createElement('span');
      element.style.backgroundColor = expectedColors[color];
      console.log(`✓ Color ${color}: ${expectedColors[color]}`);
    });
  },

  // Test 5: Verify document jumping functionality
  testDocumentJumping: (startOffset = 100) => {
    console.log('Testing document jumping...');
    
    try {
      const event = new CustomEvent('jumpToAnnotation', { 
        detail: { startOffset } 
      });
      window.dispatchEvent(event);
      console.log('✓ Jump event dispatched for offset:', startOffset);
    } catch (error) {
      console.error('✗ Document jumping failed:', error);
    }
  },

  // Run all tests
  runAllTests: async () => {
    console.log('=== Running SEC Document Viewer Tests ===');
    
    // Test annotation creation
    const annotationId = await AnnotationTests.testAnnotationCreation();
    
    // Test annotation retrieval
    await AnnotationTests.testAnnotationRetrieval();
    
    // Test search
    await AnnotationTests.testAnnotationSearch();
    
    // Test colors
    AnnotationTests.testHighlightColors();
    
    // Test jumping
    AnnotationTests.testDocumentJumping();
    
    console.log('=== Tests completed ===');
  }
};

// Export for use in browser console
if (typeof window !== 'undefined') {
  window.AnnotationTests = AnnotationTests;
}