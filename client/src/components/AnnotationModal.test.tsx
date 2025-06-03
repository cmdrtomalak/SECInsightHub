import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'; // Import QueryClient and Provider
import AnnotationModal from './annotation-modal';
import type { Annotation } from '@shared/schema';

// Mock useToast as it's used internally
jest.mock('@/hooks/use-toast', () => ({
  useToast: jest.fn().mockReturnValue({ toast: jest.fn() }),
}));

// Mock any other direct dependencies if they cause issues during isolated modal testing.
// For instance, if apiRequest or useMutation were directly called by the modal (which they are not anymore).

describe('AnnotationModal in Edit Mode', () => {
  const mockAnnotationToEdit: Annotation = {
    id: 101,
    documentId: 1,
    type: 'highlight',
    selectedText: 'This is the text to be edited.',
    note: 'Original note content.',
    color: 'pink',
    pageNumber: 1,
    startOffset: 10,
    endOffset: 40,
    createdAt: new Date(), // Changed from toISOString()
    updatedAt: new Date(), // Changed from toISOString()
  };

  const defaultProps = {
    open: true,
    onOpenChange: jest.fn(),
    onSave: jest.fn(),
    // Props for new annotation mode, provided as defaults but less relevant for edit-specific tests
    selectedText: 'Some default selected text for new',
    documentId: 123,
    selectionRange: { startOffset: 0, endOffset: 10 },
  };

  it('pre-fills form fields with annotationToEdit data and shows correct titles', () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <AnnotationModal {...defaultProps} annotationToEdit={mockAnnotationToEdit} />
      </QueryClientProvider>
    );

    // Check title and button text
    expect(screen.getByText('Edit Annotation')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update Annotation' })).toBeInTheDocument();

    // Check displayed selected text (non-editable)
    // The modal uses a div to display this, find by text content
    expect(screen.getByText(mockAnnotationToEdit.selectedText)).toBeInTheDocument();

    // Check note textarea value
    expect(screen.getByLabelText(/Note/i)).toHaveValue(mockAnnotationToEdit.note);

    // Check annotation type button (e.g., 'Highlight' button should appear selected)
    // The 'selected' type button has 'bg-orange-500', 'bg-pink-500', or 'bg-green-500'
    // For 'highlight' (pink in mock), it should be the highlight button.
    // The type in mockAnnotationToEdit is 'highlight', color 'pink'.
    // The button for 'Highlight' should have a class indicating it's active.
    const highlightTypeButton = screen.getByRole('button', { name: 'Highlight' });
    // Active class for 'highlight' type is 'bg-orange-500' if color is orange,
    // but type selection itself determines active state for the button group.
    // The getTypeButtonClass applies specific bg colors for active type.
    // For mockAnnotationToEdit.type = 'highlight', the 'Highlight' button should be active.
    expect(highlightTypeButton).toHaveClass('bg-orange-500'); // Default active color for highlight type

    // Check color selection (for 'highlight' type)
    // For 'pink' color, the button with pink background should have a border.
    // The buttons are identified by their style.backgroundColor.
    // This is a bit tricky as color buttons don't have accessible names.
    // We might need to iterate or add test-ids to color buttons in the component.
    // For now, let's assume the color state is correctly set internally and influences the `onSave` payload.
    // A more robust test would query the specific color button.
    // Example: find all buttons, filter by style, check class.
    const colorButtons = screen.getAllByRole('button').filter(btn => btn.style.backgroundColor);
    const pinkButton = colorButtons.find(btn => btn.style.backgroundColor === 'rgb(252, 231, 243)'); // #fce7f3 -> rgb(252, 231, 243)
    expect(pinkButton).toHaveClass('border-foreground');
  });

  it('calls onSave with updated data and annotation ID', () => {
    const mockOnSave = jest.fn();
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <AnnotationModal
          {...defaultProps}
          annotationToEdit={mockAnnotationToEdit}
          onSave={mockOnSave}
        />
      </QueryClientProvider>
    );

    const noteTextarea = screen.getByLabelText(/Note/i);
    fireEvent.change(noteTextarea, { target: { value: 'Updated note content.' } });

    // Example: Change type to 'note'
    const noteTypeButton = screen.getByRole('button', { name: 'Note' });
    fireEvent.click(noteTypeButton);

    const updateButton = screen.getByRole('button', { name: 'Update Annotation' });
    fireEvent.click(updateButton);

    expect(mockOnSave).toHaveBeenCalledTimes(1);
    expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({
        note: 'Updated note content.',
        type: 'note', // Type was changed
        // If the new type is 'note' (or 'bookmark'), and the original type was 'highlight',
        // the modal preserves the original highlight's color.
        color: mockAnnotationToEdit.color, // Should be 'pink' from mockAnnotationToEdit
      }),
      mockAnnotationToEdit.id
    );
  });

  it('calls onSave with original type and color if only note is changed', () => {
    const mockOnSave = jest.fn();
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <AnnotationModal
          {...defaultProps}
          annotationToEdit={mockAnnotationToEdit} // type: 'highlight', color: 'pink'
          onSave={mockOnSave}
        />
      </QueryClientProvider>
    );

    const noteTextarea = screen.getByLabelText(/Note/i);
    fireEvent.change(noteTextarea, { target: { value: 'Just the note is new.' } });

    const updateButton = screen.getByRole('button', { name: 'Update Annotation' });
    fireEvent.click(updateButton);

    expect(mockOnSave).toHaveBeenCalledTimes(1);
    expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({
        note: 'Just the note is new.',
        type: mockAnnotationToEdit.type, // Should be 'highlight'
        color: mockAnnotationToEdit.color, // Should be 'pink'
      }),
      mockAnnotationToEdit.id
    );
  });
});
